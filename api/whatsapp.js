// api/whatsapp.js — Evolution API v2 webhook
export default async function handler(req, res) {

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', service: 'Rabbitts WhatsApp Webhook v2' })
  }
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const body         = req.body
    const event        = (body?.event || '').toLowerCase()
    const instanceName = body?.instance || ''

    const SUPABASE_URL  = process.env.VITE_SUPABASE_URL
    // Usar Service Role Key para bypassar RLS — si no existe, caer a anon key
    const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
    const EVO_URL       = 'https://wa.rabbittscapital.com'
    const EVO_KEY       = 'rabbitts2024'

    console.log('[WA]', event, '| instance:', instanceName, '| key_type:', process.env.SUPABASE_SERVICE_KEY ? 'service' : 'anon')

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error('[WA] Faltan env vars de Supabase')
      return res.status(200).json({ status: 'error', reason: 'supabase env missing' })
    }

    const sbHeaders = {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json'
    }

    // ID único tipo texto (compatible con cualquier esquema de Supabase)
    const newId = () => 'wa-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)

    // INSERT y devolver el row insertado
    const sbInsert = async (table, data) => {
      const r    = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method:  'POST',
        headers: { ...sbHeaders, 'Prefer': 'return=representation' },
        body:    JSON.stringify(data)
      })
      const text = await r.text()
      if (!r.ok) {
        console.error(`[WA] INSERT ${table} FAILED status=${r.status}:`, text.slice(0, 300))
        return null
      }
      try { const j = JSON.parse(text); return Array.isArray(j) ? j[0] : j }
      catch { return null }
    }

    // PATCH por id
    const sbPatch = async (table, id, data) => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
        method:  'PATCH',
        headers: { ...sbHeaders, 'Prefer': 'return=minimal' },
        body:    JSON.stringify(data)
      })
      if (!r.ok) {
        const text = await r.text()
        console.error(`[WA] PATCH ${table} id=${id} FAILED status=${r.status}:`, text.slice(0, 200))
      }
    }

    // ── QR ────────────────────────────────────────────────────────────────────
    if (event.includes('qrcode') || event.includes('qr')) {
      const qrBase64 = body?.data?.qrcode?.base64 || body?.data?.base64 || body?.data?.qr
      if (qrBase64) {
        await fetch(`${SUPABASE_URL}/rest/v1/crm_settings`, {
          method:  'POST',
          headers: { ...sbHeaders, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body:    JSON.stringify({ key: `wa_qr_${instanceName}`, value: { qr: qrBase64, ts: Date.now() } })
        })
      }
      return res.status(200).json({ status: 'ok', event: 'qr' })
    }

    // ── Conexión ──────────────────────────────────────────────────────────────
    if (event.includes('connection')) {
      const state = body?.data?.state || body?.data?.connection
      if (state === 'open') {
        await fetch(`${SUPABASE_URL}/rest/v1/crm_settings?key=eq.wa_qr_${instanceName}`, {
          method: 'DELETE', headers: sbHeaders
        })
      }
      return res.status(200).json({ status: 'ok', event: 'connection', state })
    }

    // ── Solo procesar messages.upsert ─────────────────────────────────────────
    if (!event.includes('messages') || !event.includes('upsert')) {
      return res.status(200).json({ status: 'ok', skipped: event })
    }

    // ── Extraer mensaje ───────────────────────────────────────────────────────
    const data = body?.data
    const msg  = Array.isArray(data) ? data[0] : data
    if (!msg)            return res.status(200).json({ status: 'ok', skipped: 'no msg' })
    if (msg.key?.fromMe) return res.status(200).json({ status: 'ok', skipped: 'fromMe' })

    const remoteJid = msg.key?.remoteJid || ''
    if (remoteJid.includes('@g.us')) return res.status(200).json({ status: 'ok', skipped: 'group' })

    const msgText =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.imageMessage?.caption ||
      msg.message?.videoMessage?.caption ||
      msg.message?.buttonsResponseMessage?.selectedDisplayText ||
      msg.message?.listResponseMessage?.title ||
      ''

    const pushName  = msg.pushName || ''
    const phoneFrom = remoteJid.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '').replace(/@[\w.]+$/, '')
    const sendNumber = remoteJid.endsWith('@s.whatsapp.net') ? phoneFrom : remoteJid

    console.log('[WA] from:', phoneFrom, '| name:', pushName, '| text:', msgText?.slice(0, 60))

    if (!phoneFrom) return res.status(200).json({ status: 'ok', skipped: 'no phone' })

    // Enviar WhatsApp
    const sendWA = async (text) => {
      try {
        const r = await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
          body:    JSON.stringify({ number: sendNumber, text, delay: 800 })
        })
        console.log('[WA] sendWA:', r.status)
      } catch(e) { console.error('[WA] sendWA error:', e.message) }
    }

    // ── Buscar conversación existente ─────────────────────────────────────────
    const convRes = await fetch(
      `${SUPABASE_URL}/rest/v1/crm_conversations?telefono=eq.%2B${phoneFrom}&order=created_at.desc&limit=1`,
      { headers: sbHeaders }
    )
    const convArr = await convRes.json()
    console.log('[WA] convSearch status:', convRes.status, '| found:', Array.isArray(convArr) ? convArr.length : 'error', JSON.stringify(convArr).slice(0,100))

    let conv  = Array.isArray(convArr) && convArr.length > 0 ? convArr[0] : null
    const isNew = !conv

    // ── Crear conversación nueva ──────────────────────────────────────────────
    if (!conv) {
      const newConv = {
        id:           newId(),
        telefono:     '+' + phoneFrom,
        nombre:       pushName || phoneFrom,
        mode:         'ia',
        status:       'activo',
        instanceName,
        last_message: msgText || '[multimedia]',
        created_at:   new Date().toISOString(),
        updated_at:   new Date().toISOString()
      }
      console.log('[WA] Creating new conv with id:', newConv.id)
      const saved = await sbInsert('crm_conversations', newConv)
      conv = saved || newConv
      console.log('[WA] Conv after insert:', conv?.id, '| saved?', !!saved)
    } else {
      console.log('[WA] Existing conv:', conv.id, '| mode:', conv.mode)
    }

    // ── Guardar mensaje del usuario ───────────────────────────────────────────
    if (msgText) {
      await sbInsert('crm_conv_messages', {
        id:         newId(),
        conv_id:    conv.id,
        role:       'user',
        content:    msgText,
        created_at: new Date().toISOString()
      })
    }

    // Actualizar last_message
    await sbPatch('crm_conversations', conv.id, {
      last_message: msgText || conv.last_message,
      updated_at:   new Date().toISOString()
    })

    // ── Si modo humano, no responder ──────────────────────────────────────────
    if (conv.mode === 'humano') {
      return res.status(200).json({ status: 'ok', mode: 'humano' })
    }

    if (!msgText) {
      return res.status(200).json({ status: 'ok', skipped: 'no text' })
    }

    // ── Verificar IA activa ───────────────────────────────────────────────────
    const cfgRes   = await fetch(`${SUPABASE_URL}/rest/v1/crm_settings?key=eq.ia_config&select=value`, { headers: sbHeaders })
    const cfgData  = await cfgRes.json()
    const iaConfig = cfgData?.[0]?.value || {}
    if (!iaConfig.activo) {
      return res.status(200).json({ status: 'ok', skipped: 'ia off' })
    }

    // ── Historial ─────────────────────────────────────────────────────────────
    const histRes  = await fetch(
      `${SUPABASE_URL}/rest/v1/crm_conv_messages?conv_id=eq.${conv.id}&order=created_at.asc&limit=20`,
      { headers: sbHeaders }
    )
    const histData = await histRes.json()
    const history  = Array.isArray(histData)
      ? histData.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))
      : []

    // ── Llamar al agente ──────────────────────────────────────────────────────
    const agentRes  = await fetch('https://crm.rabbittscapital.com/api/agent', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        message: msgText,
        conversationHistory: history.slice(0, -1),
        iaConfig,
        leadData: { telefono: '+' + phoneFrom, nombre: conv.nombre, renta: conv.renta, modelo: conv.modelo }
      })
    })
    const agentData = await agentRes.json()
    const reply     = agentData?.reply

    if (!reply) {
      console.log('[WA] No reply from agent:', JSON.stringify(agentData).slice(0, 100))
      return res.status(200).json({ status: 'ok', skipped: 'no reply' })
    }

    // ── Enviar y guardar respuesta ────────────────────────────────────────────
    await sendWA(reply)

    await sbInsert('crm_conv_messages', {
      id:         newId(),
      conv_id:    conv.id,
      role:       'assistant',
      content:    reply,
      created_at: new Date().toISOString()
    })

    const updateData = {
      last_message: reply,
      updated_at:   new Date().toISOString(),
      ...(agentData?.leadUpdate || {})
    }
    if (agentData?.action === 'escalar' || agentData?.action === 'escalacion') updateData.mode = 'humano'
    if (agentData?.action === 'calificado') updateData.status = 'calificado'

    await sbPatch('crm_conversations', conv.id, updateData)

    if (agentData?.action === 'escalar' || agentData?.action === 'escalacion') {
      fetch('https://crm.rabbittscapital.com/api/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'escalation', to: process.env.CRM_ADMIN_EMAIL, lead: { nombre: conv.nombre, telefono: '+' + phoneFrom } })
      }).catch(() => {})
    }

    console.log('[WA] ✅ replied to:', phoneFrom)
    return res.status(200).json({ status: 'ok', replied: true, convId: conv.id })

  } catch (err) {
    console.error('[WA] Unhandled error:', err.message, err.stack?.slice(0, 200))
    return res.status(200).json({ status: 'error', message: err.message })
  }
}
