// api/booking.js — Rabbitts Capital Booking API
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
  const GCLIENT_ID   = process.env.GOOGLE_CLIENT_ID
  const GCLIENT_SEC  = process.env.GOOGLE_CLIENT_SECRET

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
        'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', 'Prefer': 'return=representation'
      },
      body: JSON.stringify(data)
    })
    const text = await r.text()
    try { return { ok: r.ok, status: r.status, data: JSON.parse(text) } }
    catch(e) { return { ok: r.ok, status: r.status, data: text } }
  }

  /**
   * Convert a local Santiago date+time string to UTC ISO string.
   * Strategy: treat the date+time as UTC, find how much Santiago differs
   * at that moment, then adjust to get the correct UTC equivalent.
   */
  const santiagoToUTC = (dateStr, timeStr) => {
    const [year, month, day] = dateStr.split('-').map(Number)
    const [hour, minute] = timeStr.split(':').map(Number)

    // First pass: treat as UTC to get approximate Santiago offset
    const approx = new Date(Date.UTC(year, month - 1, day, hour, minute, 0))

    // Get what Santiago time would show for this UTC moment
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Santiago',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    })
    const parts = Object.fromEntries(fmt.formatToParts(approx).map(x => [x.type, x.value]))
    const santiagoH = parseInt(parts.hour)
    const santiagoM = parseInt(parts.minute)

    // How many minutes does Santiago differ from the target time?
    const diffMin = (hour * 60 + minute) - (santiagoH * 60 + santiagoM)

    // Adjust UTC by that difference
    return new Date(approx.getTime() + diffMin * 60000).toISOString()
  }

  // Refresh token — proactively refresh if < 10 min left
  const getValidToken = async (tokens) => {
    if (!tokens) return null
    const expiry = tokens.expiry || 0
    const needsRefresh = !tokens.access_token || Date.now() > expiry - 600000
    if (needsRefresh && tokens.refresh_token) {
      try {
        const r = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: GCLIENT_ID, client_secret: GCLIENT_SEC,
            refresh_token: tokens.refresh_token, grant_type: 'refresh_token'
          })
        })
        const d = await r.json()
        if (d.access_token) { console.log('Token refreshed'); return d.access_token }
        console.error('Refresh failed:', JSON.stringify(d))
      } catch(e) { console.error('Refresh exception:', e.message) }
    }
    return tokens.access_token || null
  }

  // ── GET: available slots ─────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { fecha, ingresos } = req.query
    if (!fecha) return res.status(400).json({ error: 'fecha required' })

    try {
      const users = await sbGet('crm_users?role=eq.agent&select=id,name,email,phone,agenda_config,google_tokens')
      if (!Array.isArray(users)) return res.status(200).json({ slots: [], error: 'query failed' })

      const ingresosNum = parseInt(ingresos) || 1500000
      const categoriaCliente = ingresosNum >= 5000000 ? 'alto' : ingresosNum >= 2500000 ? 'medio' : 'bajo'

      // Day of week in Santiago
      const fechaSantiago = new Date(new Date(fecha + 'T12:00:00Z').toLocaleString('en-US', { timeZone: 'America/Santiago' }))
      const diaKey = ['dom','lun','mar','mie','jue','vie','sab'][fechaSantiago.getDay()]

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

        // Convert broker's availability window to UTC
        const startUTC = santiagoToUTC(fecha, diaConfig.desde)
        const endUTC   = santiagoToUTC(fecha, diaConfig.hasta)
        let slot = new Date(startUTC)
        const endTime = new Date(endUTC)

        // Get busy times
        let busyTimes = []
        const accessToken = await getValidToken(broker.google_tokens)
        if (accessToken) {
          try {
            const dayStartUTC = santiagoToUTC(fecha, '00:00')
            const dayEndUTC   = santiagoToUTC(fecha, '23:59')
            const fb = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                timeMin: dayStartUTC, timeMax: dayEndUTC,
                timeZone: 'America/Santiago', items: [{ id: 'primary' }]
              })
            })
            const fd = await fb.json()
            busyTimes = fd.calendars?.primary?.busy || []
          } catch(e) { console.warn('freeBusy error:', e.message) }
        }

        while (slot < endTime) {
          const slotEnd = new Date(slot.getTime() + durMin * 60000)
          if (slotEnd > endTime) break
          if (slot.getTime() - ahora < anticipMs) { slot = slotEnd; continue }

          // Show time in Santiago timezone
          const timeStr = slot.toLocaleTimeString('es-CL', {
            hour: '2-digit', minute: '2-digit', hour12: false,
            timeZone: 'America/Santiago'
          })

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
      console.error('GET error:', err)
      return res.status(500).json({ error: err.message, slots: [] })
    }
  }

  // ── POST: confirm booking ────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { nombre, telefono, email, ingresos, fecha, hora, brokerId } = req.body
    if (!nombre || !telefono || !fecha || !hora || !brokerId) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' })
    }

    try {
      const bArr = await sbGet(`crm_users?id=eq.${brokerId}&select=*`)
      const broker = Array.isArray(bArr) ? bArr[0] : null
      if (!broker) return res.status(404).json({ error: 'Broker no encontrado' })

      const durMin = broker.agenda_config?.duracion || 60
      const rentaFmt = ingresos ? `$${parseInt(ingresos).toLocaleString('es-CL')}` : 'No indicada'
      const clientePhone = telefono.replace(/\s/g,'').startsWith('+') ? telefono : `+56${telefono.replace(/\s/g,'')}`
      const clienteEmail = (email || '').trim()

      // ── Google Calendar event ──────────────────────────────────────────
      let eventId = null, eventLink = null, meetLink = null

      if (!broker.google_tokens) {
        console.warn('Broker sin Google Calendar')
      } else {
        const accessToken = await getValidToken(broker.google_tokens)
        if (!accessToken) {
          console.error('No se pudo obtener access token')
        } else {
          // Convert Santiago booking time to UTC correctly
          const startUTCiso = santiagoToUTC(fecha, hora)
          const startDT = new Date(startUTCiso)
          const endDT   = new Date(startDT.getTime() + durMin * 60000)

          console.log(`Booking: ${fecha} ${hora} Santiago → ${startDT.toISOString()} UTC`)

          // Only add client as attendee (broker is calendar owner = organizer automatically)
          const attendees = []
          if (clienteEmail) {
            attendees.push({ email: clienteEmail, displayName: nombre })
          }

          const calEvent = {
            summary: `Reunión Rabbitts Capital — ${nombre}`,
            description: [
              `Cliente: ${nombre}`,
              `Teléfono: ${clientePhone}`,
              clienteEmail ? `Email: ${clienteEmail}` : '',
              `Renta declarada: ${rentaFmt}`,
              '',
              'Agendado desde crm.rabbittscapital.com/agenda'
            ].filter(Boolean).join('\n'),
            start: { dateTime: startDT.toISOString(), timeZone: 'America/Santiago' },
            end:   { dateTime: endDT.toISOString(),   timeZone: 'America/Santiago' },
            attendees,
            reminders: {
              useDefault: false,
              overrides: [{ method:'email', minutes:60 }, { method:'popup', minutes:15 }]
            },
            conferenceData: {
              createRequest: {
                requestId: `rabbitts-${Date.now()}`,
                conferenceSolutionKey: { type: 'hangoutsMeet' }
              }
            }
          }

          const calUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events' +
            '?conferenceDataVersion=1' +
            (attendees.length > 0 ? '&sendUpdates=all' : '')

          const cr = await fetch(calUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(calEvent)
          })
          const cd = await cr.json()

          if (cd.id) {
            eventId   = cd.id
            eventLink = cd.htmlLink
            meetLink  = cd.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || null
            console.log('Calendar OK:', eventId, '| Meet:', meetLink)
          } else {
            console.error('Calendar failed:', JSON.stringify(cd.error || cd))
          }
        }
      }

      // ── Create lead ────────────────────────────────────────────────────
      const leadId = 'l-' + Date.now() + '-' + Math.random().toString(36).slice(2,6)
      const leadData = {
        id: leadId, nombre, telefono: clientePhone,
        email: clienteEmail || '—', renta: rentaFmt,
        tag: 'lead', stage: 'agenda', assigned_to: brokerId,
        fecha: new Date().toISOString(), calificacion: '—',
        resumen: `Agendado online. Renta: ${rentaFmt}. Reunión: ${fecha} ${hora}.`
      }

      let leadResult = await sbPost('crm_leads', {
        ...leadData,
        origen: 'agenda_publica',
        meeting_date: `${fecha}T${hora}`,
        ...(eventId ? { meeting_event_id: eventId } : {}),
        ...((meetLink || eventLink) ? { meeting_link: meetLink || eventLink } : {})
      })
      if (!leadResult.ok) {
        console.warn('Retry lead minimal:', leadResult.status)
        leadResult = await sbPost('crm_leads', leadData)
      }
      console.log('Lead:', leadResult.ok, leadResult.status)

      // ── Notify broker by email ─────────────────────────────────────────
      try {
        await fetch('https://crm.rabbittscapital.com/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'nueva_reunion', to: broker.email, broker: broker.name,
            lead: { nombre, telefono: clientePhone, renta: rentaFmt, fecha, hora },
            meetLink
          })
        })
      } catch(e) { console.warn('Email failed:', e.message) }

      return res.status(200).json({
        success: true, leadId, meetLink, eventLink,
        brokerName: broker.name,
        calendarCreated: !!eventId,
        leadCreated: leadResult.ok
      })

    } catch(err) {
      console.error('POST exception:', err)
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).end()
}
