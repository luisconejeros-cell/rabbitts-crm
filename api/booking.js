// api/booking.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY

  const sb = async (path, opts={}) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        ...opts.headers
      },
      ...opts
    })
    return r
  }

  // ── GET: available slots ─────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { fecha, ingresos } = req.query
    if (!fecha) return res.status(400).json({ error: 'fecha required' })

    try {
      const usersRes = await sb('crm_users?role=eq.agent&select=id,name,email,phone,agenda_config,google_tokens')
      const users = await usersRes.json()

      if (!Array.isArray(users)) {
        return res.status(200).json({ slots: [], brokers: 0, error: 'users query failed' })
      }

      const ingresosNum = parseInt(ingresos) || 1500000
      const categoriaCliente = ingresosNum >= 5000000 ? 'alto' : ingresosNum >= 2500000 ? 'medio' : 'bajo'

      // Day of week in Santiago
      const fechaDate = new Date(fecha + 'T12:00:00-03:00')
      const diaSemana = fechaDate.getDay()
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
        return res.status(200).json({ slots: [], brokers: 0, diaKey, totalAgents: users.length })
      }

      const slotMap = {}

      for (const broker of brokersAptos) {
        const ag = broker.agenda_config
        const diaConfig = ag.dias[diaKey]
        const durMin = ag.duracion || 60
        const anticipHoras = ag.anticipacion || 12

        // Build slots in Santiago timezone
        let slot = new Date(`${fecha}T${diaConfig.desde}:00-03:00`)
        const endTime = new Date(`${fecha}T${diaConfig.hasta}:00-03:00`)
        const ahoraMs = Date.now()
        const anticipMs = anticipHoras * 3600000

        // Get busy from Google Calendar
        let busyTimes = []
        if (broker.google_tokens?.access_token) {
          try {
            let token = broker.google_tokens.access_token
            if (Date.now() > (broker.google_tokens.expiry || 0) - 60000 && broker.google_tokens.refresh_token) {
              const rr = await fetch('https://oauth2.googleapis.com/token', {
                method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
                body: new URLSearchParams({ client_id:process.env.GOOGLE_CLIENT_ID, client_secret:process.env.GOOGLE_CLIENT_SECRET, refresh_token:broker.google_tokens.refresh_token, grant_type:'refresh_token' })
              })
              const rd = await rr.json()
              if (rd.access_token) token = rd.access_token
            }
            const fb = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
              method:'POST',
              headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
              body: JSON.stringify({ timeMin:new Date(`${fecha}T00:00:00-03:00`).toISOString(), timeMax:new Date(`${fecha}T23:59:59-03:00`).toISOString(), timeZone:'America/Santiago', items:[{id:'primary'}] })
            })
            const fd = await fb.json()
            busyTimes = fd.calendars?.primary?.busy || []
          } catch(e) { /* ignore */ }
        }

        while (slot < endTime) {
          const slotEnd = new Date(slot.getTime() + durMin * 60000)
          if (slotEnd > endTime) break

          // Skip if too soon
          if (slot.getTime() - ahoraMs < anticipMs) { slot = slotEnd; continue }

          // Format time in Santiago
          const timeStr = slot.toLocaleTimeString('es-CL', {
            hour: '2-digit', minute: '2-digit', hour12: false,
            timeZone: 'America/Santiago'
          })

          // Skip if busy
          const busy = busyTimes.some(b =>
            slot.getTime() < new Date(b.end).getTime() &&
            slotEnd.getTime() > new Date(b.start).getTime()
          )

          if (!busy && !slotMap[timeStr]) {
            slotMap[timeStr] = { time: timeStr, broker: { id: broker.id, name: broker.name }, timestamp: slot.getTime() }
          }
          slot = slotEnd
        }
      }

      const slots = Object.values(slotMap).sort((a,b) => a.timestamp - b.timestamp)
      return res.status(200).json({ slots, brokers: brokersAptos.length })

    } catch(err) {
      console.error('GET booking error:', err)
      return res.status(500).json({ error: err.message, slots: [] })
    }
  }

  // ── POST: create booking ─────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { nombre, telefono, ingresos, fecha, hora, brokerId } = req.body
    const errors = []
    if (!nombre) errors.push('nombre')
    if (!telefono) errors.push('telefono')
    if (!fecha) errors.push('fecha')
    if (!hora) errors.push('hora')
    if (!brokerId) errors.push('brokerId')
    if (errors.length) return res.status(400).json({ error: `Faltan: ${errors.join(', ')}` })

    try {
      // Get broker
      const bRes = await sb(`crm_users?id=eq.${brokerId}&select=*`)
      const bArr = await bRes.json()
      const broker = bArr?.[0]
      if (!broker) return res.status(404).json({ error: 'Broker no encontrado' })

      const durMin = broker.agenda_config?.duracion || 60
      const rentaFmt = ingresos ? `$${parseInt(ingresos).toLocaleString('es-CL')}` : 'No indicada'

      // Try Google Calendar event
      let eventId = null, eventLink = null, meetLink = null
      if (broker.google_tokens?.access_token || broker.google_tokens?.refresh_token) {
        try {
          let token = broker.google_tokens.access_token
          if (Date.now() > (broker.google_tokens.expiry || 0) - 60000 && broker.google_tokens.refresh_token) {
            const rr = await fetch('https://oauth2.googleapis.com/token', {
              method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
              body: new URLSearchParams({ client_id:process.env.GOOGLE_CLIENT_ID, client_secret:process.env.GOOGLE_CLIENT_SECRET, refresh_token:broker.google_tokens.refresh_token, grant_type:'refresh_token' })
            })
            const rd = await rr.json()
            if (rd.access_token) token = rd.access_token
          }
          const startDT = new Date(`${fecha}T${hora}:00-03:00`)
          const endDT = new Date(startDT.getTime() + durMin * 60000)
          const calEvent = {
            summary: `Reunión Rabbitts — ${nombre}`,
            description: `Renta: ${rentaFmt}\nTeléfono: ${telefono}`,
            start: { dateTime: startDT.toISOString(), timeZone: 'America/Santiago' },
            end: { dateTime: endDT.toISOString(), timeZone: 'America/Santiago' },
            attendees: [{ email: broker.email }],
            reminders: { useDefault: false, overrides: [{method:'email',minutes:60},{method:'popup',minutes:15}] },
            conferenceData: { createRequest: { requestId:`r-${Date.now()}`, conferenceSolutionKey:{type:'hangoutsMeet'} } }
          }
          const cr = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all', {
            method:'POST',
            headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
            body: JSON.stringify(calEvent)
          })
          const cd = await cr.json()
          if (!cd.error) {
            eventId = cd.id
            eventLink = cd.htmlLink
            meetLink = cd.conferenceData?.entryPoints?.find(e=>e.entryPointType==='video')?.uri || null
          } else {
            console.warn('Calendar error:', cd.error)
          }
        } catch(e) { console.warn('Calendar failed:', e.message) }
      }

      // Create lead — only use columns that definitely exist
      const leadId = 'l-' + Date.now() + '-' + Math.random().toString(36).slice(2,6)
      const leadData = {
        id: leadId,
        nombre,
        telefono: telefono.startsWith('+') ? telefono : `+56${telefono}`,
        email: '—',
        renta: rentaFmt,
        tag: 'lead',
        stage: 'agenda',
        assigned_to: brokerId,
        fecha: new Date().toISOString(),
        calificacion: '—',
        resumen: `Agendado desde página pública. Renta: ${rentaFmt}. Reunión: ${fecha} ${hora}.`,
        propiedades: [],
        comentarios: []
      }

      // Add optional columns if they were provided
      try { leadData.origen = 'agenda_publica' } catch(e) {}
      try { leadData.meeting_date = `${fecha}T${hora}` } catch(e) {}
      if (eventId) try { leadData.meeting_event_id = eventId } catch(e) {}
      if (meetLink || eventLink) try { leadData.meeting_link = meetLink || eventLink } catch(e) {}

      const lRes = await sb('crm_leads', {
        method: 'POST',
        headers: { 'Prefer': 'return=representation' },
        body: JSON.stringify(leadData)
      })
      const lData = await lRes.json()
      console.log('Lead created:', JSON.stringify(lData))

      // Notify broker by email
      try {
        await fetch('https://crm.rabbittscapital.com/api/notify', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            type: 'nueva_reunion',
            to: broker.email,
            broker: broker.name,
            lead: { nombre, telefono, renta: rentaFmt, fecha, hora },
            meetLink
          })
        })
      } catch(e) { console.warn('Email failed:', e.message) }

      // WhatsApp link for broker
      let waLink = null
      if (broker.phone) {
        const phone = broker.phone.replace(/[^0-9]/g,'')
        const msg = encodeURIComponent(`Nueva reunión agendada:\nCliente: ${nombre}\nTeléfono: ${telefono}\nRenta: ${rentaFmt}\nFecha: ${fecha} ${hora}${meetLink ? '\nMeet: '+meetLink : ''}`)
        waLink = `https://wa.me/${phone}?text=${msg}`
      }

      return res.status(200).json({
        success: true,
        leadId,
        meetLink,
        eventLink,
        brokerName: broker.name,
        waLink
      })

    } catch(err) {
      console.error('POST booking error:', err)
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
