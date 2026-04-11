// api/booking.js — Rabbitts Capital Booking API
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY

  const sbGet = async (path) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    })
    return r.json()
  }

  const sbPost = async (table, data) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(data)
    })
    const text = await r.text()
    try { return { ok: r.ok, status: r.status, data: JSON.parse(text) } }
    catch(e) { return { ok: r.ok, status: r.status, data: text } }
  }

  // Get current Santiago offset dynamically
  const getSantiagoOffset = () => {
    // America/Santiago: UTC-4 in winter (March-Oct approx), UTC-3 in summer
    const now = new Date()
    const santiago = new Date(now.toLocaleString('en-US', { timeZone: 'America/Santiago' }))
    const utc = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }))
    return (utc - santiago) / 60000 // offset in minutes (positive = behind UTC)
  }

  const toSantiagoISO = (dateStr, timeStr) => {
    // Create date in Santiago timezone
    const offsetMin = getSantiagoOffset()
    const offsetHours = Math.floor(offsetMin / 60)
    const offsetStr = `-0${offsetHours}:00`
    return `${dateStr}T${timeStr}:00${offsetStr}`
  }

  // ── GET: available slots ─────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { fecha, ingresos } = req.query
    if (!fecha) return res.status(400).json({ error: 'fecha required' })

    try {
      const users = await sbGet('crm_users?role=eq.agent&select=id,name,email,phone,agenda_config,google_tokens')
      if (!Array.isArray(users)) return res.status(200).json({ slots: [], error: 'No agents found' })

      const ingresosNum = parseInt(ingresos) || 1500000
      const categoriaCliente = ingresosNum >= 5000000 ? 'alto' : ingresosNum >= 2500000 ? 'medio' : 'bajo'

      // Get day of week in Santiago timezone
      const fechaSantiago = new Date(new Date(fecha + 'T12:00:00Z').toLocaleString('en-US', { timeZone: 'America/Santiago' }))
      const diaSemana = fechaSantiago.getDay() // 0=Sun
      const DIAS_KEY = ['dom','lun','mar','mie','jue','vie','sab']
      const diaKey = DIAS_KEY[diaSemana]

      const brokersAptos = users.filter(u => {
        const ag = u.agenda_config
        if (!ag || !ag.activa) return false
        if (!ag.dias?.[diaKey]?.activo) return false
        const cats = ag.ingresos_categorias || ['cualquiera']
        if (!cats.includes('cualquiera') && !cats.includes(categoriaCliente)) return false
        return true
      }).sort((a,b) => (b.agenda_config?.peso||5) - (a.agenda_config?.peso||5))

      if (!brokersAptos.length) {
        return res.status(200).json({ slots: [], brokers: 0, debug: `day=${diaKey} agents=${users.length}` })
      }

      const slotMap = {}
      const ahora = Date.now()

      for (const broker of brokersAptos) {
        const ag = broker.agenda_config
        const diaConfig = ag.dias[diaKey]
        const durMin = ag.duracion || 60
        const anticipMs = (ag.anticipacion || 12) * 3600000

        // Build slots in Santiago timezone
        const desdeISO = toSantiagoISO(fecha, diaConfig.desde)
        const hastaISO = toSantiagoISO(fecha, diaConfig.hasta)
        let slot = new Date(desdeISO)
        const endTime = new Date(hastaISO)

        // Get busy from Calendar
        let busyTimes = []
        const tokens = broker.google_tokens
        if (tokens) {
          try {
            let accessToken = tokens.access_token
            if (tokens.refresh_token && Date.now() > (tokens.expiry||0) - 60000) {
              const rr = await fetch('https://oauth2.googleapis.com/token', {
                method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
                body: new URLSearchParams({ client_id:process.env.GOOGLE_CLIENT_ID, client_secret:process.env.GOOGLE_CLIENT_SECRET, refresh_token:tokens.refresh_token, grant_type:'refresh_token' })
              })
              const rd = await rr.json()
              if (rd.access_token) accessToken = rd.access_token
            }
            const fb = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
              method:'POST',
              headers:{'Authorization':`Bearer ${accessToken}`,'Content-Type':'application/json'},
              body: JSON.stringify({ timeMin: new Date(toSantiagoISO(fecha,'00:00')).toISOString(), timeMax: new Date(toSantiagoISO(fecha,'23:59')).toISOString(), timeZone:'America/Santiago', items:[{id:'primary'}] })
            })
            const fd = await fb.json()
            busyTimes = fd.calendars?.primary?.busy || []
          } catch(e) { /* ignore */ }
        }

        while (slot < endTime) {
          const slotEnd = new Date(slot.getTime() + durMin * 60000)
          if (slotEnd > endTime) break
          if (slot.getTime() - ahora < anticipMs) { slot = slotEnd; continue }

          const timeStr = slot.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'America/Santiago' })
          const busy = busyTimes.some(b => slot.getTime() < new Date(b.end).getTime() && slotEnd.getTime() > new Date(b.start).getTime())

          if (!busy && !slotMap[timeStr]) {
            slotMap[timeStr] = { time: timeStr, broker: { id: broker.id, name: broker.name }, timestamp: slot.getTime() }
          }
          slot = slotEnd
        }
      }

      const slots = Object.values(slotMap).sort((a,b) => a.timestamp - b.timestamp)
      return res.status(200).json({ slots, brokers: brokersAptos.length })
    } catch(err) {
      return res.status(500).json({ error: err.message, slots: [] })
    }
  }

  // ── POST: confirm booking ────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { nombre, telefono, ingresos, fecha, hora, brokerId } = req.body
    if (!nombre || !telefono || !fecha || !hora || !brokerId) {
      return res.status(400).json({ error: 'Faltan datos', got: { nombre:!!nombre, telefono:!!telefono, fecha:!!fecha, hora:!!hora, brokerId:!!brokerId } })
    }

    try {
      // Get broker
      const bArr = await sbGet(`crm_users?id=eq.${brokerId}&select=*`)
      const broker = Array.isArray(bArr) ? bArr[0] : null
      if (!broker) return res.status(404).json({ error: 'Broker no encontrado', brokerId })

      const durMin = broker.agenda_config?.duracion || 60
      const rentaFmt = ingresos ? `$${parseInt(ingresos).toLocaleString('es-CL')}` : 'No indicada'
      const phone = telefono.replace(/\s/g,'').startsWith('+') ? telefono.replace(/\s/g,'') : `+56${telefono.replace(/\s/g,'').replace(/^9/,'9')}`

      // Create Google Calendar event with correct Santiago timezone
      let eventId = null, eventLink = null, meetLink = null
      const tokens = broker.google_tokens
      if (tokens) {
        try {
          let accessToken = tokens.access_token
          // Refresh if needed
          if (tokens.refresh_token && Date.now() > (tokens.expiry||0) - 60000) {
            const rr = await fetch('https://oauth2.googleapis.com/token', {
              method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
              body: new URLSearchParams({ client_id:process.env.GOOGLE_CLIENT_ID, client_secret:process.env.GOOGLE_CLIENT_SECRET, refresh_token:tokens.refresh_token, grant_type:'refresh_token' })
            })
            const rd = await rr.json()
            if (rd.access_token) accessToken = rd.access_token
          }

          // Use Santiago timezone string (not hardcoded offset)
          const startISO = toSantiagoISO(fecha, hora)
          const startDT = new Date(startISO)
          const endDT = new Date(startDT.getTime() + durMin * 60000)

          const calEvent = {
            summary: `Reunión Rabbitts — ${nombre}`,
            description: `Cliente: ${nombre}\nTeléfono: ${phone}\nRenta: ${rentaFmt}`,
            start: { dateTime: startDT.toISOString(), timeZone: 'America/Santiago' },
            end:   { dateTime: endDT.toISOString(),   timeZone: 'America/Santiago' },
            attendees: [{ email: broker.email, displayName: broker.name }],
            reminders: { useDefault: false, overrides: [{method:'email',minutes:60},{method:'popup',minutes:15}] },
            conferenceData: { createRequest: { requestId:`r${Date.now()}`, conferenceSolutionKey:{type:'hangoutsMeet'} } }
          }

          const cr = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all', {
            method:'POST',
            headers:{'Authorization':`Bearer ${accessToken}`,'Content-Type':'application/json'},
            body: JSON.stringify(calEvent)
          })
          const cd = await cr.json()
          if (cd.id) {
            eventId = cd.id
            eventLink = cd.htmlLink
            meetLink = cd.conferenceData?.entryPoints?.find(e=>e.entryPointType==='video')?.uri || null
          } else {
            console.error('Calendar event failed:', JSON.stringify(cd))
          }
        } catch(e) { console.error('Calendar exception:', e.message) }
      }

      // Create lead — minimal safe fields only
      const leadId = 'l-' + Date.now() + '-' + Math.random().toString(36).slice(2,6)
      const leadData = {
        id: leadId,
        nombre,
        telefono: phone,
        email: '—',
        renta: rentaFmt,
        tag: 'lead',
        stage: 'agenda',
        assigned_to: brokerId,
        fecha: new Date().toISOString(),
        calificacion: '—',
        resumen: `Agendado online. Renta: ${rentaFmt}. Reunión: ${fecha} ${hora}.`
      }

      // Add optional fields safely
      const optionals = {
        origen: 'agenda_publica',
        meeting_date: `${fecha}T${hora}`,
        ...(eventId ? { meeting_event_id: eventId } : {}),
        ...((meetLink||eventLink) ? { meeting_link: meetLink||eventLink } : {})
      }

      // Try with all fields first, fallback to minimal
      let leadResult = await sbPost('crm_leads', { ...leadData, ...optionals })
      if (!leadResult.ok) {
        console.warn('Lead with optionals failed, trying minimal:', leadResult.data)
        leadResult = await sbPost('crm_leads', leadData)
      }
      console.log('Lead result:', leadResult.status, JSON.stringify(leadResult.data).slice(0,200))

      // Notify broker by email
      try {
        await fetch('https://crm.rabbittscapital.com/api/notify', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ type:'nueva_reunion', to:broker.email, broker:broker.name, lead:{nombre,telefono:phone,renta:rentaFmt,fecha,hora}, meetLink })
        })
      } catch(e) { console.warn('Email failed:', e.message) }

      return res.status(200).json({
        success: true,
        leadId,
        meetLink,
        eventLink,
        brokerName: broker.name,
        calendarCreated: !!eventId,
        leadCreated: leadResult.ok
      })

    } catch(err) {
      console.error('POST booking exception:', err)
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).end()
}
