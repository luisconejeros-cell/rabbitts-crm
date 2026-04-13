// api/whatsapp.js — Evolution API v2 webhook (sin dependencias externas)
export default async function handler(req, res) {

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', service: 'Rabbitts WhatsApp Webhook v2' })
  }
  if (req.method !== 'POST') return res.status(405).end()

  // Responder INMEDIATAMENTE para que Evolution API no timeout
  res.status(200).json({ status: 'ok' })

  // Procesar el mensaje después de devolver la respuesta
  try {
    await processWebhook(req.body)
  } catch(err) {
    console.error('[WA] processWebhook error:', err.message)
  }
}

async function processWebhook(body) {
  const event        = (body?.event || '').toLowerCase()
  const instanceName = body?.instance || ''

  const SB_URL = process.env.VITE_SUPABASE_URL
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  const EVO_URL = 'https://wa.rabbittscapital.com'
  const EVO_KEY = 'rabbitts2024'

  if (!SB_URL || !SB_KEY) { console.error('[WA] Faltan env vars'); return }

  console.log('[WA] event:', event, '| instance:', instanceName)

  const H = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }

  // QR
  if (event.includes('qrcode') || event.includes('qr')) {
    const qr = body?.data?.qrcode?.base64 || body?.data?.base64 || body?.data?.qr
    if (qr) await sb_upsert(SB_URL, H, 'crm_settings', { key: `wa_qr_${instanceName}`, value: { qr, ts: Date.now() } })
    return
  }

  // Conexión
  if (event.includes('connection')) {
    if (body?.data?.state === 'open' || body?.data?.connection === 'open') {
      await fetch(`${SB_URL}/rest/v1/crm_settings?key=eq.wa_qr_${instanceName}`, { method: 'DELETE', headers: H })
    }
    return
  }

  // Solo messages.upsert
  if (!event.includes('messages') || !event.includes('upsert')) return

  const data = body?.data
  const msg  = Array.isArray(data) ? data[0] : data
  if (!msg || msg.key?.fromMe) return

  const remoteJid = msg.key?.remoteJid || ''
  if (remoteJid.includes('@g.us')) return

  const msgText =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption || ''

  const pushName   = msg.pushName || ''
  const phoneRaw   = remoteJid.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '').replace(/@[\w.]+$/, '')
  const telefono   = '+' + phoneRaw
  const sendNumber = remoteJid.endsWith('@s.whatsapp.net') ? phoneRaw : remoteJid

  console.log('[WA] de:', telefono, '| nombre:', pushName, '| texto:', msgText?.slice(0,60))
  if (!phoneRaw) return

  // Buscar conversación por teléfono
  const r1 = await fetch(`${SB_URL}/rest/v1/crm_conversations?telefono=eq.${encodeURIComponent(telefono)}&order=updated_at.desc&limit=1`, { headers: H })
  const arr = await r1.json()
  let conv  = Array.isArray(arr) && arr.length > 0 ? arr[0] : null

  console.log('[WA] búsqueda conv status:', r1.status, '| encontrada:', !!conv)

  if (!conv) {
    // Crear conversación con campos mínimos garantizados
    const id = 'wa-' + Date.now()
    const convData = {
      id,
      telefono,
      nombre:       pushName || phoneRaw,
      mode:         'ia',
      status:       'activo',
      last_message: msgText || '[multimedia]',
      created_at:   new Date().toISOString(),
      updated_at:   new Date().toISOString()
    }
    const r2 = await fetch(`${SB_URL}/rest/v1/crm_conversations`, {
      method: 'POST', headers: { ...H, 'Prefer': 'return=representation' },
      body: JSON.stringify(convData)
    })
    const body2 = await r2.text()
    console.log('[WA] INSERT conv status:', r2.status, '| body:', body2.slice(0,200))

    if (r2.ok) {
      try { const j = JSON.parse(body2); conv = Array.isArray(j) ? j[0] : j } catch { conv = convData }
    } else {
      // Si falla con instanceName u otra columna, intentar sin campos extra
      const convMinimal = { id, telefono, nombre: pushName || phoneRaw, mode: 'ia', status: 'activo',
        last_message: msgText || '[multimedia]', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      const r3 = await fetch(`${SB_URL}/rest/v1/crm_conversations`, {
        method: 'POST', headers: { ...H, 'Prefer': 'return=representation' },
        body: JSON.stringify(convMinimal)
      })
      const body3 = await r3.text()
      console.log('[WA] INSERT minimal status:', r3.status, '| body:', body3.slice(0,200))
      try { const j = JSON.parse(body3); conv = Array.isArray(j) ? j[0] : j } catch { conv = convMinimal }
    }
  }

  // Guardar mensaje del usuario
  if (msgText) {
    const rm = await fetch(`${SB_URL}/rest/v1/crm_conv_messages`, {
      method: 'POST', headers: { ...H, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ conv_id: conv.id, role: 'user', content: msgText, created_at: new Date().toISOString() })
    })
    console.log('[WA] INSERT msg_user status:', rm.status)
  }

  // Actualizar last_message
  await fetch(`${SB_URL}/rest/v1/crm_conversations?id=eq.${encodeURIComponent(conv.id)}`, {
    method: 'PATCH', headers: { ...H, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ last_message: msgText || conv.last_message, updated_at: new Date().toISOString() })
  })

  if (conv.mode === 'humano') return
  if (!msgText) return

  // IA activa?
  const rc = await fetch(`${SB_URL}/rest/v1/crm_settings?key=eq.ia_config&select=value`, { headers: H })
  const cd = await rc.json()
  const iaConfig = cd?.[0]?.value || {}
  if (!iaConfig.activo) return

  // Historial
  const rh = await fetch(`${SB_URL}/rest/v1/crm_conv_messages?conv_id=eq.${conv.id}&order=created_at.asc&limit=20`, { headers: H })
  const hd = await rh.json()
  const history = Array.isArray(hd) ? hd.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })) : []
  console.log('[WA] historial:', history.length, 'msgs')

  // Llamar agente
  const ra = await fetch('https://crm.rabbittscapital.com/api/agent', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: msgText,
      conversationHistory: history.slice(0, -1),
      iaConfig,
      leadData: { telefono, nombre: conv.nombre, renta: conv.renta, modelo: conv.modelo }
    })
  })
  const agentData = await ra.json()
  const reply = agentData?.reply
  if (!reply) { console.log('[WA] sin respuesta del agente'); return }

  // Enviar por WhatsApp
  await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
    body: JSON.stringify({ number: sendNumber, text: reply, delay: 500 })
  })

  // Guardar respuesta
  const ra2 = await fetch(`${SB_URL}/rest/v1/crm_conv_messages`, {
    method: 'POST', headers: { ...H, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ conv_id: conv.id, role: 'assistant', content: reply, created_at: new Date().toISOString() })
  })
  console.log('[WA] INSERT msg_assistant status:', ra2.status)

  const upd = { last_message: reply, updated_at: new Date().toISOString(), ...(agentData?.leadUpdate||{}) }
  if (agentData?.action?.includes('escal')) upd.mode = 'humano'
  if (agentData?.action === 'calificado') upd.status = 'calificado'
  await fetch(`${SB_URL}/rest/v1/crm_conversations?id=eq.${encodeURIComponent(conv.id)}`, {
    method: 'PATCH', headers: { ...H, 'Prefer': 'return=minimal' }, body: JSON.stringify(upd)
  })

  console.log('[WA] ✅ respondido a:', telefono)
}

async function sb_upsert(url, headers, table, data) {
  return fetch(`${url}/rest/v1/${table}`, {
    method: 'POST', headers: { ...headers, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(data)
  })
}
