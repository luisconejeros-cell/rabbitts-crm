// api/calendar.js — Google Calendar event management
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { action, tokens, event } = req.body

  // Refresh token if expired
  async function getValidToken(tokens) {
    if (Date.now() < tokens.expiry - 60000) return tokens.access_token
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: tokens.refresh_token,
        grant_type: 'refresh_token'
      })
    })
    const data = await res.json()
    return data.access_token
  }

  try {
    const accessToken = await getValidToken(tokens)

    // ── Create Calendar Event ─────────────────────────────────────────────
    if (action === 'create') {
      const { titulo, fecha, hora, duracion=60, clienteEmail, clienteNombre, brokerEmail, notas='' } = event

      // Build event datetime
      const startDT = new Date(`${fecha}T${hora}:00`)
      const endDT = new Date(startDT.getTime() + duracion * 60000)

      const calEvent = {
        summary: `Reunión Rabbitts Capital — ${clienteNombre}`,
        description: `Reunión de asesoría inmobiliaria con ${clienteNombre}.\n\n${notas}`,
        start: {
          dateTime: startDT.toISOString(),
          timeZone: 'America/Santiago'
        },
        end: {
          dateTime: endDT.toISOString(),
          timeZone: 'America/Santiago'
        },
        attendees: [
          { email: brokerEmail, displayName: 'Asesor Rabbitts Capital' },
          ...(clienteEmail ? [{ email: clienteEmail, displayName: clienteNombre }] : [])
        ],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 60 },
            { method: 'popup', minutes: 15 }
          ]
        },
        conferenceData: {
          createRequest: {
            requestId: `rabbitts-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        }
      }

      const calRes = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(calEvent)
        }
      )

      const calData = await calRes.json()
      if (calData.error) throw new Error(calData.error.message)

      return res.status(200).json({
        eventId: calData.id,
        eventLink: calData.htmlLink,
        meetLink: calData.conferenceData?.entryPoints?.[0]?.uri || null,
        start: calData.start.dateTime
      })
    }

    // ── Get free/busy slots ───────────────────────────────────────────────
    if (action === 'availability') {
      const { fecha } = event
      const timeMin = new Date(`${fecha}T08:00:00`).toISOString()
      const timeMax = new Date(`${fecha}T20:00:00`).toISOString()

      const fbRes = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          timeMin,
          timeMax,
          timeZone: 'America/Santiago',
          items: [{ id: 'primary' }]
        })
      })

      const fbData = await fbRes.json()
      const busy = fbData.calendars?.primary?.busy || []
      return res.status(200).json({ busy })
    }

    return res.status(400).json({ error: 'Invalid action' })

  } catch (err) {
    console.error('Calendar error:', err)
    return res.status(500).json({ error: err.message })
  }
}
