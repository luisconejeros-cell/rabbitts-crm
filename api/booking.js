// api/booking.js — Agendamiento de equipos v2 (Calendly-like, backward compatible)
// Flujo: calcular disponibilidad cruzando CRM + Google Calendar + horas de oficina,
// elegir miembro por Round Robin o evento colectivo, crear evento externo y lead local.

const DEFAULT_TZ = 'America/Santiago'
const DAY_KEYS = ['dom','lun','mar','mie','jue','vie','sab']

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
  const GCLIENT_ID   = process.env.GOOGLE_CLIENT_ID
  const GCLIENT_SEC  = process.env.GOOGLE_CLIENT_SECRET

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase no configurado' })
  }

  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  }

  const sbGet = async (path) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers })
    const text = await r.text()
    try { return { ok: r.ok, status: r.status, data: JSON.parse(text) } }
    catch { return { ok: r.ok, status: r.status, data: text } }
  }

  const sbPost = async (table, data, prefer='return=representation') => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST', headers: { ...headers, Prefer: prefer }, body: JSON.stringify(data)
    })
    const text = await r.text()
    try { return { ok: r.ok, status: r.status, data: JSON.parse(text) } }
    catch { return { ok: r.ok, status: r.status, data: text } }
  }

  const sbPatch = async (table, query, data) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(data)
    })
    const text = await r.text()
    try { return { ok: r.ok, status: r.status, data: JSON.parse(text) } }
    catch { return { ok: r.ok, status: r.status, data: text } }
  }

  const pad2 = n => String(n).padStart(2, '0')
  const parseHHMM = s => {
    const [h,m] = String(s||'00:00').split(':').map(x => parseInt(x,10) || 0)
    return h * 60 + m
  }
  const fmtHHMM = date => date.toLocaleTimeString('es-CL', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: DEFAULT_TZ
  })

  const santiagoToUTC = (dateStr, timeStr, tz=DEFAULT_TZ) => {
    const [year, month, day] = dateStr.split('-').map(Number)
    const [hour, minute] = timeStr.split(':').map(Number)
    const approx = new Date(Date.UTC(year, month - 1, day, hour, minute || 0, 0))
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    })
    const parts = Object.fromEntries(fmt.formatToParts(approx).map(x => [x.type, x.value]))
    const shown = (parseInt(parts.hour,10) || 0) * 60 + (parseInt(parts.minute,10) || 0)
    const target = hour * 60 + (minute || 0)
    return new Date(approx.getTime() + (target - shown) * 60000).toISOString()
  }

  const dateKeyForTz = (dateStr, tz=DEFAULT_TZ) => {
    const d = new Date(new Date(dateStr + 'T12:00:00Z').toLocaleString('en-US', { timeZone: tz }))
    return DAY_KEYS[d.getDay()]
  }

  const overlap = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && aEnd > bStart

  const getValidGoogleToken = async (tokens) => {
    if (!tokens) return null
    const expiry = tokens.expiry || tokens.expiry_date || 0
    const needsRefresh = !tokens.access_token || Date.now() > expiry - 600000
    if (needsRefresh && tokens.refresh_token && GCLIENT_ID && GCLIENT_SEC) {
      try {
        const r = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: GCLIENT_ID, client_secret: GCLIENT_SEC,
            refresh_token: tokens.refresh_token, grant_type: 'refresh_token'
          })
        })
        const d = await r.json()
        if (d.access_token) return d.access_token
        console.error('[booking] google refresh failed:', JSON.stringify(d))
      } catch(e) { console.error('[booking] google refresh exception:', e.message) }
    }
    return tokens.access_token || null
  }

  const loadAgendaSettings = async () => {
    const st = await sbGet('crm_settings?key=eq.agenda_settings&select=value')
    const settings = Array.isArray(st.data) && st.data[0]?.value ? st.data[0].value : {}
    const defaultEvent = {
      id: 'asesoria', nombre: settings.titulo || 'Reunión de asesoría', duracion: 60,
      descripcion: settings.descripcion || '', modo: 'round_robin', equipoId: 'principal',
      anticipacionHoras: 12, intervalo: 30, bufferAntes: 0, bufferDespues: 0,
      requiereEmail: false, activo: true
    }
    const eventTypes = Array.isArray(settings.eventTypes) && settings.eventTypes.length ? settings.eventTypes : [defaultEvent]
    const teams = Array.isArray(settings.teams) && settings.teams.length ? settings.teams : [{ id:'principal', nombre:'Equipo comercial', memberIds:[] }]
    return { ...settings, eventTypes, teams }
  }

  const loadUsers = async () => {
    const r = await sbGet('crm_users?role=eq.agent&select=id,name,email,phone,agenda_config,google_tokens,microsoft_tokens')
    return Array.isArray(r.data) ? r.data : []
  }

  const loadLocalBusy = async (fecha) => {
    const dayStart = `${fecha}T00:00:00`
    const dayEnd = `${fecha}T23:59:59`
    const busyByUser = {}

    // 1) Nueva tabla ideal, si existe: crm_appointments
    try {
      const q = `start_at=gte.${encodeURIComponent(dayStart)}&start_at=lte.${encodeURIComponent(dayEnd)}&select=id,assigned_user_id,team_member_ids,start_at,end_at,status,external_event_id`
      const r = await sbGet(`crm_appointments?${q}`)
      if (r.ok && Array.isArray(r.data)) {
        for (const ap of r.data) {
          if (['cancelled','canceled','deleted'].includes(String(ap.status||'').toLowerCase())) continue
          const ids = [ap.assigned_user_id, ...(Array.isArray(ap.team_member_ids) ? ap.team_member_ids : [])].filter(Boolean)
          for (const uid of ids) {
            if (!busyByUser[uid]) busyByUser[uid] = []
            busyByUser[uid].push({ start: new Date(ap.start_at).toISOString(), end: new Date(ap.end_at).toISOString(), source:'crm_appointments' })
          }
        }
      }
    } catch(_) {}

    // 2) Compatibilidad actual: leads con meeting_date
    try {
      const r = await sbGet(`crm_leads?meeting_date=gte.${encodeURIComponent(dayStart)}&meeting_date=lte.${encodeURIComponent(dayEnd)}&select=id,assigned_to,meeting_date`)
      if (r.ok && Array.isArray(r.data)) {
        for (const l of r.data) {
          if (!l.assigned_to || !l.meeting_date) continue
          if (!busyByUser[l.assigned_to]) busyByUser[l.assigned_to] = []
          const s = new Date(l.meeting_date)
          busyByUser[l.assigned_to].push({ start: s.toISOString(), end: new Date(s.getTime()+60*60000).toISOString(), source:'crm_leads' })
        }
      }
    } catch(_) {}

    return busyByUser
  }

  const loadExternalBusy = async (broker, fecha, tz=DEFAULT_TZ) => {
    const busy = []
    const token = await getValidGoogleToken(broker.google_tokens)
    if (token) {
      try {
        const fb = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timeMin: santiagoToUTC(fecha, '00:00', tz),
            timeMax: santiagoToUTC(fecha, '23:59', tz),
            timeZone: tz,
            items: [{ id: 'primary' }]
          })
        })
        const fd = await fb.json()
        const blocks = fd.calendars?.primary?.busy || []
        busy.push(...blocks.map(b => ({...b, source:'google'})))
      } catch(e) { console.warn('[booking] google freeBusy error:', broker.id, e.message) }
    }

    // Hook futuro Outlook: broker.microsoft_tokens + Microsoft Graph getSchedule.
    // No se ejecuta si no existen tokens para no romper producción.
    return busy
  }

  const getMemberCandidates = (users, settings, eventType, ingresosNum) => {
    const categoria = ingresosNum >= 5000000 ? 'alto' : ingresosNum >= 2500000 ? 'medio' : 'bajo'
    const team = settings.teams.find(t => t.id === eventType.equipoId) || settings.teams[0]
    const teamMemberIds = Array.isArray(team?.memberIds) ? team.memberIds : []
    return users.filter(u => {
      if (teamMemberIds.length && !teamMemberIds.includes(u.id)) return false
      const ag = u.agenda_config || {}
      if (!ag.enAgenda && teamMemberIds.length === 0) return false
      if (!ag.activa) return false
      const cats = ag.ingresos_categorias || ['cualquiera']
      if (!cats.includes('cualquiera') && !cats.includes(categoria)) return false
      return true
    })
  }

  const memberDayWindow = (u, diaKey) => {
    const day = u.agenda_config?.dias?.[diaKey]
    if (!day?.activo || !day.desde || !day.hasta) return null
    if (parseHHMM(day.hasta) <= parseHHMM(day.desde)) return null
    return { desde: day.desde, hasta: day.hasta }
  }

  const getAvailability = async ({ fecha, ingresos=1500000, eventTypeId, modoOverride }) => {
    const settings = await loadAgendaSettings()
    const users = await loadUsers()
    const eventType = settings.eventTypes.find(e => e.id === eventTypeId) || settings.eventTypes.find(e => e.activo !== false) || settings.eventTypes[0]
    const tz = settings.timezone || DEFAULT_TZ
    const durMin = parseInt(eventType.duracion || settings.defaultDuration || 60, 10)
    const intervalo = parseInt(eventType.intervalo || settings.slotInterval || 30, 10)
    const bufferAntes = parseInt(eventType.bufferAntes || settings.bufferBefore || 0, 10)
    const bufferDespues = parseInt(eventType.bufferDespues || settings.bufferAfter || 0, 10)
    const anticipMs = parseInt(eventType.anticipacionHoras || settings.minNoticeHours || 12, 10) * 3600000
    const modo = modoOverride || eventType.modo || settings.distributionMode || 'round_robin'
    const diaKey = dateKeyForTz(fecha, tz)
    const candidatos = getMemberCandidates(users, settings, eventType, parseInt(ingresos,10) || 0)

    const localBusy = await loadLocalBusy(fecha)
    const externalBusyPairs = await Promise.all(candidatos.map(async u => [u.id, await loadExternalBusy(u, fecha, tz)]))
    const externalBusy = Object.fromEntries(externalBusyPairs)

    const availabilityByMember = {}
    const now = Date.now()

    for (const u of candidatos) {
      const win = memberDayWindow(u, diaKey)
      if (!win) continue
      const dayBusy = [...(localBusy[u.id] || []), ...(externalBusy[u.id] || [])]
      const startUTC = new Date(santiagoToUTC(fecha, win.desde, tz))
      const endUTC = new Date(santiagoToUTC(fecha, win.hasta, tz))
      const slots = []
      for (let cursor = new Date(startUTC); cursor < endUTC; cursor = new Date(cursor.getTime() + intervalo * 60000)) {
        const slotStart = new Date(cursor)
        const slotEnd = new Date(slotStart.getTime() + durMin * 60000)
        const blockStart = new Date(slotStart.getTime() - bufferAntes * 60000)
        const blockEnd = new Date(slotEnd.getTime() + bufferDespues * 60000)
        if (slotEnd > endUTC) continue
        if (slotStart.getTime() - now < anticipMs) continue
        const busy = dayBusy.some(b => overlap(blockStart.getTime(), blockEnd.getTime(), new Date(b.start).getTime(), new Date(b.end).getTime()))
        if (!busy) slots.push({ time: fmtHHMM(slotStart), start: slotStart.toISOString(), end: slotEnd.toISOString(), timestamp: slotStart.getTime() })
      }
      availabilityByMember[u.id] = { user: u, slots }
    }

    let slots = []
    if (modo === 'collective') {
      const activeIds = Object.keys(availabilityByMember)
      if (activeIds.length) {
        const counter = new Map()
        for (const uid of activeIds) {
          for (const s of availabilityByMember[uid].slots) {
            const key = s.time
            const current = counter.get(key) || { ...s, memberIds: [] }
            current.memberIds.push(uid)
            counter.set(key, current)
          }
        }
        slots = [...counter.values()]
          .filter(s => s.memberIds.length === activeIds.length)
          .map(s => ({ ...s, mode:'collective', broker: null, availableMembers: s.memberIds.length }))
      }
    } else {
      const map = new Map()
      for (const [uid, pack] of Object.entries(availabilityByMember)) {
        for (const s of pack.slots) {
          const cur = map.get(s.time) || { ...s, memberIds: [] }
          cur.memberIds.push(uid)
          map.set(s.time, cur)
        }
      }
      slots = [...map.values()].map(s => ({ ...s, mode:'round_robin', broker: null, availableMembers: s.memberIds.length }))
    }

    slots.sort((a,b) => a.timestamp - b.timestamp)
    return { settings, users, eventType, modo, slots, availabilityByMember }
  }

  const loadDistributionStats = async (memberIds, days=30) => {
    const since = new Date(Date.now() - days*86400000).toISOString()
    const stats = Object.fromEntries(memberIds.map(id => [id, { count:0, lastAt:null }]))
    try {
      const ids = memberIds.join(',')
      const r = await sbGet(`crm_leads?assigned_to=in.(${ids})&fecha=gte.${encodeURIComponent(since)}&select=assigned_to,meeting_date,fecha`)
      if (r.ok && Array.isArray(r.data)) {
        for (const row of r.data) {
          if (!stats[row.assigned_to]) continue
          stats[row.assigned_to].count += 1
          const d = row.meeting_date || row.fecha
          if (d && (!stats[row.assigned_to].lastAt || new Date(d) > new Date(stats[row.assigned_to].lastAt))) stats[row.assigned_to].lastAt = d
        }
      }
    } catch(_) {}
    return stats
  }

  const chooseRoundRobinMember = async (memberIds, users) => {
    const stats = await loadDistributionStats(memberIds)
    const byId = Object.fromEntries(users.map(u => [u.id, u]))
    return [...memberIds].sort((a,b) => {
      const wa = Math.max(1, parseInt(byId[a]?.agenda_config?.peso || 5, 10))
      const wb = Math.max(1, parseInt(byId[b]?.agenda_config?.peso || 5, 10))
      const scoreA = (stats[a]?.count || 0) / wa
      const scoreB = (stats[b]?.count || 0) / wb
      if (scoreA !== scoreB) return scoreA - scoreB
      const la = stats[a]?.lastAt ? new Date(stats[a].lastAt).getTime() : 0
      const lb = stats[b]?.lastAt ? new Date(stats[b].lastAt).getTime() : 0
      return la - lb
    })[0]
  }

  const createGoogleEvent = async ({ organizer, eventType, fecha, hora, durMin, nombre, clientePhone, clienteEmail, attendeesUsers=[], tz=DEFAULT_TZ }) => {
    const token = await getValidGoogleToken(organizer.google_tokens)
    if (!token) return { eventId:null, eventLink:null, meetLink:null, error:'google_not_connected' }

    const startDT = new Date(santiagoToUTC(fecha, hora, tz))
    const endDT = new Date(startDT.getTime() + durMin * 60000)
    const attendees = []
    if (clienteEmail) attendees.push({ email: clienteEmail, displayName: nombre })
    for (const u of attendeesUsers) if (u.email && u.email !== organizer.email) attendees.push({ email: u.email, displayName: u.name })

    const calEvent = {
      summary: `${eventType.nombre || 'Reunión'} — ${nombre}`,
      description: [
        `Cliente: ${nombre}`,
        `Teléfono: ${clientePhone}`,
        clienteEmail ? `Email: ${clienteEmail}` : '',
        eventType.descripcion ? `Evento: ${eventType.descripcion}` : '',
        '', 'Agendado desde CRM Rabbitts'
      ].filter(Boolean).join('\n'),
      start: { dateTime: startDT.toISOString(), timeZone: tz },
      end: { dateTime: endDT.toISOString(), timeZone: tz },
      attendees,
      reminders: { useDefault: false, overrides: [{ method:'email', minutes:60 }, { method:'popup', minutes:15 }] },
      conferenceData: { createRequest: { requestId: `rabbitts-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } }
    }

    const calUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1' + (attendees.length ? '&sendUpdates=all' : '')
    const cr = await fetch(calUrl, { method:'POST', headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' }, body: JSON.stringify(calEvent) })
    const cd = await cr.json()
    if (!cd.id) return { eventId:null, eventLink:null, meetLink:null, error: cd.error || cd }
    const meetLink = cd.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri || null
    return { eventId: cd.id, eventLink: cd.htmlLink, meetLink }
  }

  if (req.method === 'GET') {
    const { fecha, ingresos, eventTypeId, modo } = req.query
    if (!fecha) return res.status(400).json({ error:'fecha required', slots:[] })
    try {
      const data = await getAvailability({ fecha, ingresos, eventTypeId, modoOverride: modo })
      return res.status(200).json({
        slots: data.slots.map(s => ({ time:s.time, timestamp:s.timestamp, availableMembers:s.availableMembers, mode:s.mode, memberIds:s.memberIds })),
        eventType: { id:data.eventType.id, nombre:data.eventType.nombre, duracion:data.eventType.duracion, modo:data.modo },
        brokers: Object.keys(data.availabilityByMember).length
      })
    } catch(err) {
      console.error('[booking] GET error:', err)
      return res.status(500).json({ error: err.message, slots: [] })
    }
  }

  if (req.method === 'POST') {
    const { nombre, telefono, email, ingresos, fecha, hora, brokerId, eventTypeId, modo } = req.body || {}
    if (!nombre || !telefono || !fecha || !hora) return res.status(400).json({ error:'Faltan campos obligatorios' })

    try {
      // Recalcular justo antes de reservar para evitar double booking.
      const data = await getAvailability({ fecha, ingresos, eventTypeId, modoOverride: modo })
      const slot = data.slots.find(s => s.time === hora)
      if (!slot) return res.status(409).json({ error:'Horario ya no disponible. Elige otro horario.' })

      let assignedIds = []
      if (brokerId && slot.memberIds.includes(brokerId)) assignedIds = [brokerId]
      else if (data.modo === 'collective') assignedIds = slot.memberIds
      else assignedIds = [await chooseRoundRobinMember(slot.memberIds, data.users)]

      const byId = Object.fromEntries(data.users.map(u => [u.id, u]))
      const organizer = byId[assignedIds[0]]
      if (!organizer) return res.status(409).json({ error:'No hay asesor disponible para ese horario.' })

      const durMin = parseInt(data.eventType.duracion || 60, 10)
      const clientePhone = telefono.replace(/\s/g,'').startsWith('+') ? telefono.replace(/\s/g,'') : `+56${telefono.replace(/\s/g,'')}`
      const clienteEmail = String(email || '').trim()
      const attendeesUsers = assignedIds.slice(1).map(id => byId[id]).filter(Boolean)
      const google = await createGoogleEvent({ organizer, eventType:data.eventType, fecha, hora, durMin, nombre, clientePhone, clienteEmail, attendeesUsers, tz:data.settings.timezone || DEFAULT_TZ })

      const leadId = 'l-' + Date.now() + '-' + Math.random().toString(36).slice(2,6)
      const rentaFmt = ingresos ? `$${parseInt(ingresos,10).toLocaleString('es-CL')}` : 'No indicada'
      const leadData = {
        id: leadId, nombre, telefono: clientePhone, email: clienteEmail || '—', renta: rentaFmt,
        tag:'lead', stage:'agenda', assigned_to: organizer.id, fecha:new Date().toISOString(), calificacion:'—',
        resumen:`Agendado online. Evento: ${data.eventType.nombre}. Reunión: ${fecha} ${hora}. Equipo: ${assignedIds.map(id=>byId[id]?.name).filter(Boolean).join(', ')}.`
      }
      const leadResult = await sbPost('crm_leads', {
        ...leadData,
        origen:'agenda_publica', meeting_date:`${fecha}T${hora}`,
        ...(google.eventId ? { meeting_event_id: google.eventId } : {}),
        ...((google.meetLink || google.eventLink) ? { meeting_link: google.meetLink || google.eventLink } : {})
      })

      // Tabla nueva opcional para bloqueo multi-miembro. Si no existe, no rompe.
      try {
        await sbPost('crm_appointments', {
          id:'apt-' + Date.now() + '-' + Math.random().toString(36).slice(2,6),
          event_type_id:data.eventType.id,
          team_id:data.eventType.equipoId || 'principal',
          assigned_user_id:organizer.id,
          team_member_ids:assignedIds,
          lead_id:leadId,
          customer_name:nombre,
          customer_phone:clientePhone,
          customer_email:clienteEmail || null,
          start_at:new Date(santiagoToUTC(fecha, hora, data.settings.timezone || DEFAULT_TZ)).toISOString(),
          end_at:new Date(new Date(santiagoToUTC(fecha, hora, data.settings.timezone || DEFAULT_TZ)).getTime()+durMin*60000).toISOString(),
          status:'scheduled',
          external_provider: google.eventId ? 'google' : null,
          external_event_id: google.eventId || null,
          meeting_link: google.meetLink || google.eventLink || null,
          metadata:{ mode:data.modo, organizer:organizer.name, participants:assignedIds.map(id=>byId[id]?.name).filter(Boolean) }
        }, 'return=minimal')
      } catch(_) {}

      try {
        if (organizer.email) {
          await fetch('https://crm.rabbittscapital.com/api/notify', {
            method:'POST', headers:{ 'Content-Type':'application/json' },
            body: JSON.stringify({ type:'nueva_reunion', to:organizer.email, broker:organizer.name, lead:{ nombre, telefono:clientePhone, renta:rentaFmt, fecha, hora }, meetLink:google.meetLink })
          })
        }
      } catch(e) { console.warn('[booking] notify failed:', e.message) }

      return res.status(200).json({
        success:true, leadId, brokerName:organizer.name, participants:assignedIds.map(id=>byId[id]?.name).filter(Boolean),
        meetLink:google.meetLink, eventLink:google.eventLink, calendarCreated:!!google.eventId,
        leadCreated:leadResult.ok, mode:data.modo
      })
    } catch(err) {
      console.error('[booking] POST error:', err)
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).end()
}
