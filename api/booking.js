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

  // ── GET: return available slots for a given date + income ─────────────────
  if (req.method === 'GET') {
    const { fecha, ingresos } = req.query
    if (!fecha) return res.status(400).json({ error: 'fecha required' })

    // Get all active brokers with agenda config
    const usersRes = await sb('crm_users?role=eq.agent&select=id,name,email,phone,agenda_config,google_tokens')
    const users = await usersRes.json()

    const ingresosNum = parseInt(ingresos) || 0
    const ahora = Date.now()
    const fechaDate = new Date(fecha + 'T00:00:00')
    const diaSemana = fechaDate.getDay() // 0=dom,1=lun,...6=sab
    const DIAS_KEY = ['dom','lun','mar','mie','jue','vie','sab']
    const diaKey = DIAS_KEY[diaSemana]

    // Filter brokers by income category
    const categoriaCliente = ingresosNum >= 5000000 ? 'alto' : ingresosNum >= 2500000 ? 'medio' : 'bajo'
    const brokersAptos = (users||[]).filter(u => {
      const ag = u.agenda_config
      if (!ag?.enAgenda) return false  // must be explicitly added to agenda by admin
      if (!ag?.activa) return false
      const cats = ag.ingresos_categorias || ['cualquiera']
      if (!cats.includes('cualquiera') && !cats.includes(categoriaCliente)) return false
      if (!ag.dias?.[diaKey]?.activo) return false
      return true
    }).sort((a,b) => (b.agenda_config?.peso||5) - (a.agenda_config?.peso||5))

    if (!brokersAptos.length) return res.status(200).json({ slots: [], brokers: 0 })

    // Generate slots across all available brokers for that day
    // Group by time slot, assign best broker
    const slotMap = {}

    for (const broker of brokersAptos) {
      const ag = broker.agenda_config
      const diaConfig = ag.dias[diaKey]
      const durMin = ag.duracion || 60
      const anticipMin = (ag.anticipacion || 12) * 60 // in minutes

      const [desdeH, desdeM] = diaConfig.desde.split(':').map(Number)
      const [hastaH, hastaM] = diaConfig.hasta.split(':').map(Number)

      let slot = new Date(fecha + 'T00:00:00')
      slot.setHours(desdeH, desdeM, 0, 0)
      const end = new Date(fecha + 'T00:00:00')
      end.setHours(hastaH, hastaM, 0, 0)

      // Get broker's busy times from Google Calendar if connected
      let busyTimes = []
      if (broker.google_tokens?.access_token) {
        try {
          const fbRes = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${broker.google_tokens.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              timeMin: new Date(fecha + 'T00:00:00').toISOString(),
              timeMax: new Date(fecha + 'T23:59:59').toISOString(),
              timeZone: 'America/Santiago',
              items: [{ id: 'primary' }]
            })
          })
          const fbData = await fbRes.json()
          busyTimes = fbData.calendars?.primary?.busy || []
        } catch(e) { /* ignore */ }
      }

      while (slot < end) {
        const slotEnd = new Date(slot.getTime() + durMin * 60000)
        if (slotEnd > end) break

        const slotKey = slot.toTimeString().slice(0,5) // "09:00"
        const slotTimestamp = slot.getTime()

        // Check minimum anticipation
        if (slotTimestamp - ahora < anticipMin * 60000) { slot = slotEnd; continue }

        // Check if busy
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

    // Get broker
    const brokerRes = await sb(`crm_users?id=eq.${brokerId}&select=*`)
    const brokers = await brokerRes.json()
    const broker = brokers[0]
    if (!broker) return res.status(404).json({ error: 'Broker no encontrado' })

    const ag = broker.agenda_config
    const durMin = ag?.duracion || 60

    // Create calendar event
    let eventData = null
    if (broker.google_tokens) {
      try {
        const calRes = await fetch(`${process.env.VITE_APP_URL || 'https://crm.rabbittscapital.com'}/api/calendar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create',
            tokens: broker.google_tokens,
            event: {
              titulo: `Reunión Rabbitts — ${nombre}`,
              fecha, hora, duracion: durMin,
              clienteEmail: '',
              clienteNombre: nombre,
              brokerEmail: broker.email,
              notas: `Renta declarada: $${parseInt(ingresos).toLocaleString('es-CL')}\nTeléfono: ${telefono}`
            }
          })
        })
        eventData = await calRes.json()
      } catch(e) { console.warn('Calendar error:', e.message) }
    }

    // Create lead in CRM
    const leadId = 'l-' + Date.now() + '-' + Math.random().toString(36).slice(2,6)
    const lead = {
      id: leadId,
      nombre, telefono,
      email: '—',
      renta: `$${parseInt(ingresos).toLocaleString('es-CL')}`,
      tag: 'lead',
      stage: 'agenda',
      assigned_to: brokerId,
      fecha: new Date().toISOString(),
      origen: 'agenda_publica',
      resumen: `Lead desde página de agenda pública. Renta: $${parseInt(ingresos).toLocaleString('es-CL')}`,
      meeting_date: fecha + 'T' + hora,
      meeting_event_id: eventData?.eventId || null,
      meeting_link: eventData?.meetLink || eventData?.eventLink || null,
      calificacion: '—',
      propiedades: [], comentarios: []
    }
    await sb('crm_leads', { method: 'POST', headers: { 'Prefer': 'return=minimal' }, body: JSON.stringify(lead) })

    // Send email to broker
    const notifyUrl = `${process.env.VITE_APP_URL || 'https://crm.rabbittscapital.com'}/api/notify`
    await fetch(notifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'nueva_reunion',
        to: broker.email,
        broker: broker.name,
        lead: { nombre, telefono, renta: `$${parseInt(ingresos).toLocaleString('es-CL')}`, fecha, hora },
        meetLink: eventData?.meetLink || null
      })
    }).catch(()=>{})

    // Send WhatsApp to broker if has phone
    let waLink = null
    if (broker.phone) {
      const waMsg = encodeURIComponent(`Nueva reunión agendada:\nCliente: ${nombre}\nTeléfono: ${telefono}\nRenta: $${parseInt(ingresos).toLocaleString('es-CL')}\nFecha: ${fecha} ${hora}${eventData?.meetLink ? '\nMeet: '+eventData.meetLink : ''}`)
      waLink = `https://wa.me/${broker.phone.replace(/[^0-9]/g,'')}?text=${waMsg}`
    }

    return res.status(200).json({
      success: true,
      meetLink: eventData?.meetLink || null,
      eventLink: eventData?.eventLink || null,
      brokerName: broker.name,
      waLink
    })
  }
}
