// api/booking.js — Public booking page data + booking endpoint
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
  const sb = (path, opts={}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', ...opts.headers },
    ...opts
  })

  // ── GET: return available slots ───────────────────────────────────────────
  if (req.method === 'GET') {
    const { fecha, ingresos } = req.query
    if (!fecha) return res.status(400).json({ error: 'fecha required' })

    const usersRes = await sb('crm_users?role=eq.agent&select=id,name,email,phone,agenda_config,google_tokens')
    const users = await usersRes.json()

    const ingresosNum = parseInt(ingresos) || 0
    // Use Santiago time offset (-3 or -4) — approximate with -3
    const ahoraSantiago = Date.now() - (0 * 60000) // server time is already close enough
    
    // Day of week for the requested date (in Santiago timezone)
    const fechaDate = new Date(fecha + 'T12:00:00-03:00')
    const diaSemana = fechaDate.getDay() // 0=dom,1=lun,...6=sab
    const DIAS_KEY = ['dom','lun','mar','mie','jue','vie','sab']
    const diaKey = DIAS_KEY[diaSemana]

    const categoriaCliente = ingresosNum >= 5000000 ? 'alto' : ingresosNum >= 2500000 ? 'medio' : 'bajo'

    // Filter brokers: must be active and have the day configured
    const brokersAptos = (users||[]).filter(u => {
      const ag = u.agenda_config
      if (!ag) return false
      if (!ag.activa) return false                          // broker must be active
      if (!ag.dias?.[diaKey]?.activo) return false          // must have that day enabled
      const cats = ag.ingresos_categorias || ['cualquiera']
      if (!cats.includes('cualquiera') && !cats.includes(categoriaCliente)) return false
      return true
    }).sort((a,b) => (b.agenda_config?.peso||5) - (a.agenda_config?.peso||5))

    if (!brokersAptos.length) {
      return res.status(200).json({ slots: [], brokers: 0, debug: `No brokers for day ${diaKey}, total agents: ${users.length}` })
    }

    const slotMap = {}

    for (const broker of brokersAptos) {
      const ag = broker.agenda_config
      const diaConfig = ag.dias[diaKey]
      const durMin = ag.duracion || 60
      const anticipMin = (ag.anticipacion || 12) * 60 // minutes

      const [desdeH, desdeM] = diaConfig.desde.split(':').map(Number)
      const [hastaH, hastaM] = diaConfig.hasta.split(':').map(Number)

      // Build slots in Santiago time
      let slot = new Date(`${fecha}T${diaConfig.desde}:00-03:00`)
      const endTime = new Date(`${fecha}T${diaConfig.hasta}:00-03:00`)

      // Get busy times from Google Calendar
      let busyTimes = []
      if (broker.google_tokens?.access_token) {
        try {
          const fbRes = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${broker.google_tokens.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              timeMin: new Date(`${fecha}T00:00:00-03:00`).toISOString(),
              timeMax: new Date(`${fecha}T23:59:59-03:00`).toISOString(),
              timeZone: 'America/Santiago',
              items: [{ id: 'primary' }]
            })
          })
          const fbData = await fbRes.json()
          busyTimes = fbData.calendars?.primary?.busy || []
        } catch(e) { /* ignore */ }
      }

      while (slot < endTime) {
        const slotEnd = new Date(slot.getTime() + durMin * 60000)
        if (slotEnd > endTime) break

        const slotKey = slot.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', timeZone:'America/Santiago' })
        const slotTimestamp = slot.getTime()

        // Check minimum anticipation
        if (slotTimestamp - Date.now() < anticipMin * 60000) { slot = slotEnd; continue }

        // Check if busy in Google Calendar
        const isBusy = busyTimes.some(b => {
          const bs = new Date(b.start).getTime()
          const be = new Date(b.end).getTime()
          return slotTimestamp < be && slotEnd.getTime() > bs
        })

        if (!isBusy && !slotMap[slotKey]) {
          slotMap[slotKey] = { time: slotKey, broker: { id: broker.id, name: broker.name }, timestamp: slotTimestamp }
        }
        slot = slotEnd
      }
    }

    const slots = Object.values(slotMap).sort((a,b) => a.timestamp - b.timestamp)
    return res.status(200).json({ slots, brokers: brokersAptos.length })
  }

  // ── POST: create booking ──────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { nombre, telefono, ingresos, fecha, hora, brokerId } = req.body
    if (!nombre || !telefono || !fecha || !hora || !brokerId) {
      return res.status(400).json({ error: 'Faltan datos requeridos' })
    }

    const brokerRes = await sb(`crm_users?id=eq.${brokerId}&select=*`)
    const brokers = await brokerRes.json()
    const broker = brokers[0]
    if (!broker) return res.status(404).json({ error: 'Broker no encontrado' })

    const durMin = broker.agenda_config?.duracion || 60

    // Create Google Calendar event
    let eventData = null
    if (broker.google_tokens) {
      try {
        const startDT = new Date(`${fecha}T${hora}:00-03:00`)
        const endDT = new Date(startDT.getTime() + durMin * 60000)
        const calEvent = {
          summary: `Reunión Rabbitts — ${nombre}`,
          description: `Renta declarada: $${parseInt(ingresos).toLocaleString('es-CL')}\nTeléfono: ${telefono}`,
          start: { dateTime: startDT.toISOString(), timeZone: 'America/Santiago' },
          end: { dateTime: endDT.toISOString(), timeZone: 'America/Santiago' },
          attendees: [{ email: broker.email }],
          reminders: { useDefault: false, overrides: [{ method:'email', minutes:60 }, { method:'popup', minutes:15 }] },
          conferenceData: { createRequest: { requestId:`rabbitts-${Date.now()}`, conferenceSolutionKey:{type:'hangoutsMeet'} } }
        }
        // Refresh token if needed
        let accessToken = broker.google_tokens.access_token
        if (Date.now() > broker.google_tokens.expiry - 60000) {
          const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
            method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
            body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: broker.google_tokens.refresh_token, grant_type:'refresh_token' })
          })
          const refreshData = await refreshRes.json()
          if (refreshData.access_token) accessToken = refreshData.access_token
        }
        const calRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all', {
          method:'POST', headers:{ 'Authorization':`Bearer ${accessToken}`, 'Content-Type':'application/json' },
          body: JSON.stringify(calEvent)
        })
        eventData = await calRes.json()
        if (eventData.error) { console.warn('Cal error:', eventData.error); eventData = null }
      } catch(e) { console.warn('Calendar error:', e.message) }
    }

    // Create lead in CRM
    const leadId = 'l-' + Date.now() + '-' + Math.random().toString(36).slice(2,6)
    await sb('crm_leads', {
      method:'POST',
      headers:{'Prefer':'return=minimal'},
      body: JSON.stringify({
        id: leadId, nombre, telefono, email:'—',
        renta: `$${parseInt(ingresos).toLocaleString('es-CL')}`,
        tag:'lead', stage:'agenda', assigned_to: brokerId,
        fecha: new Date().toISOString(), origen:'agenda_publica',
        resumen: `Lead desde agenda pública. Renta: $${parseInt(ingresos).toLocaleString('es-CL')}`,
        meeting_date: `${fecha}T${hora}`,
        meeting_event_id: eventData?.id || null,
        meeting_link: eventData?.conferenceData?.entryPoints?.[0]?.uri || eventData?.htmlLink || null,
        calificacion:'—', propiedades:[], comentarios:[]
      })
    })

    // Notify broker by email
    await fetch(`https://crm.rabbittscapital.com/api/notify`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ type:'nueva_reunion', to:broker.email, broker:broker.name, lead:{nombre,telefono,renta:`$${parseInt(ingresos).toLocaleString('es-CL')}`,fecha,hora}, meetLink:eventData?.conferenceData?.entryPoints?.[0]?.uri||null })
    }).catch(()=>{})

    return res.status(200).json({
      success: true,
      meetLink: eventData?.conferenceData?.entryPoints?.[0]?.uri || null,
      eventLink: eventData?.htmlLink || null,
      brokerName: broker.name
    })
  }
}
