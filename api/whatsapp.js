// api/whatsapp.js — Evolution API v2 webhook
// Responde 200 INMEDIATAMENTE y procesa en segundo plano para evitar timeouts
import { waitUntil } from '@vercel/functions'

export default async function handler(req, res) {

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', service: 'Rabbitts WhatsApp Webhook v2' })
  }
  if (req.method !== 'POST') return res.status(405).end()

  const body = req.body

  // ── Responder a Evolution API INMEDIATAMENTE (evita timeout) ─────────────
  // waitUntil permite que el procesamiento continúe después de devolver la respuesta
  waitUntil(processWebhook(body))
  return res.status(200).json({ status: 'ok', queued: true })
}

async function processWebhook(body) {
  try {
    const event        = (body?.event || '').toLowerCase()
    const instanceName = body?.instance || ''

    const SUPABASE_URL = process.env.VITE_SUPABASE_URL
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
    const EVO_URL      = 'https://wa.rabbittscapital.com'
    const EVO_KEY      = 'rabbitts2024'

    console.log('[WA]', event, '| instance:', instanceName)

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.error('[WA] Faltan env vars de Supabase')
      return
    }

    const sbH = {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json'
    }

    const newId = () => 'wa-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)

    const sbInsert = async (table, data) => {
      const r    = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST', headers: { ...sbH, 'Prefer': 'return=representation' },
        body: JSON.stringify(data)
      })
      const text = await r.text()
      if (!r.ok) console.error(`[WA] INSERT ${table} FAILED ${r.status}:`, text.slice(0, 200))
      try { const j = JSON.parse(text); return Array.isArray(j) ? j[0] : j } catch { return null }
    }

    const sbPatch = async (table, id, data) => {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { ...sbH, 'Prefer': 'return=minimal' },
        body: JSON.stringify(data)
      })
      if (!r.ok) {
        const t = await r.text()
        console.error(`[WA] PATCH ${table} ${id} FAILED ${r.status}:`, t.slice(0, 150))
      }
    }

    // ── QR ────────────────────────────────────────────────────────────────────
    if (event.includes('qrcode') || event.includes('qr')) {
      const qrBase64 = body?.data?.qrcode?.base64 || body?.data?.base64 || body?.data?.qr
      if (qrBase64) {
        await fetch(`${SUPABASE_URL}/rest/v1/crm_settings`, {
          method: 'POST', headers: { ...sbH, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ key: `wa_qr_${instanceName}`, value: { qr: qrBase64, ts: Date.now() } })
        })
      }
      return
    }

    // ── Conexión ──────────────────────────────────────────────────────────────
    if (event.includes('connection')) {
      const state = body?.data?.state || body?.data?.connection
      if (state === 'open') {
        await fetch(`${SUPABASE_URL}/rest/v1/crm_settings?key=eq.wa_qr_${instanceName}`, {
          method: 'DELETE', headers: sbH
        })
      }
      return
    }

    // ── Solo messages.upsert ──────────────────────────────────────────────────
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
      msg.message?.videoMessage?.caption ||
      msg.message?.buttonsResponseMessage?.selectedDisplayText ||
      msg.message?.listResponseMessage?.title || ''

    const pushName   = msg.pushName || ''
    const phoneFrom  = remoteJid.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '').replace(/@[\w.]+$/, '')
    const sendNumber = remoteJid.endsWith('@s.whatsapp.net') ? phoneFrom : remoteJid

    console.log('[WA] from:', phoneFrom, '| text:', msgText?.slice(0, 60))
    if (!phoneFrom) return

    const sendWA = async (text) => {
      try {
        const r = await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
          body: JSON.stringify({ number: sendNumber, text, delay: 500 })
        })
        console.log('[WA] sendWA status:', r.status)
      } catch(e) { console.error('[WA] sendWA error:', e.message) }
    }

    // ── Buscar o crear conversación ───────────────────────────────────────────
    const convRes = await fetch(
      `${SUPABASE_URL}/rest/v1/crm_conversations?telefono=eq.%2B${phoneFrom}&order=created_at.desc&limit=1`,
      { headers: sbH }
    )
    const convArr = await convRes.json()
    let conv  = Array.isArray(convArr) && convArr.length > 0 ? convArr[0] : null
    const isNew = !conv

    if (!conv) {
      const newConv = {
        id: newId(), telefono: '+' + phoneFrom, nombre: pushName || phoneFrom,
        mode: 'ia', status: 'activo', instanceName,
        last_message: msgText || '[multimedia]',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }
      const saved = await sbInsert('crm_conversations', newConv)
      conv = saved || newConv
      console.log('[WA] Conv creada:', conv.id)
    } else {
      console.log('[WA] Conv existente:', conv.id, '| modo:', conv.mode)
    }

    // ── Guardar mensaje del usuario ───────────────────────────────────────────
    if (msgText) {
      await sbInsert('crm_conv_messages', {
        conv_id: conv.id, role: 'user', content: msgText,
        created_at: new Date().toISOString()
      })
    }

    await sbPatch('crm_conversations', conv.id, {
      last_message: msgText || conv.last_message,
      updated_at: new Date().toISOString(),
      ...(pushName && !isNew ? { nombre: pushName } : {})
    })

    // ── No responder si modo humano o sin texto ───────────────────────────────
    if (conv.mode === 'humano') { console.log('[WA] modo humano'); return }
    if (!msgText) return

    // ── Verificar IA activa ───────────────────────────────────────────────────
    const cfgRes  = await fetch(`${SUPABASE_URL}/rest/v1/crm_settings?key=eq.ia_config&select=value`, { headers: sbH })
    const cfgData = await cfgRes.json()
    const iaConfig = cfgData?.[0]?.value || {}
    if (!iaConfig.activo) { console.log('[WA] IA desactivada'); return }

    // ── Historial ─────────────────────────────────────────────────────────────
    const histRes  = await fetch(
      `${SUPABASE_URL}/rest/v1/crm_conv_messages?conv_id=eq.${conv.id}&order=created_at.asc&limit=20`,
      { headers: sbH }
    )
    const histData = await histRes.json()
    const history  = Array.isArray(histData)
      ? histData.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))
      : []

    console.log('[WA] historial:', history.length, 'mensajes')

    // ── Llamar al agente ──────────────────────────────────────────────────────
    const agentRes  = await fetch('https://crm.rabbittscapital.com/api/agent', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msgText,
        conversationHistory: history.slice(0, -1),
        iaConfig,
        leadData: { telefono: '+' + phoneFrom, nombre: conv.nombre, renta: conv.renta, modelo: conv.modelo }
      })
    })
    const agentData = await agentRes.json()
    const reply     = agentData?.reply

    if (!reply) { console.log('[WA] Sin respuesta del agente:', JSON.stringify(agentData).slice(0,100)); return }

    // ── Enviar y guardar respuesta ────────────────────────────────────────────
    await sendWA(reply)

    await sbInsert('crm_conv_messages', {
      conv_id: conv.id, role: 'assistant', content: reply,
      created_at: new Date().toISOString()
    })

    const updateData = { last_message: reply, updated_at: new Date().toISOString(), ...(agentData?.leadUpdate || {}) }
    if (agentData?.action === 'escalar' || agentData?.action === 'escalacion') updateData.mode = 'humano'
    if (agentData?.action === 'calificado') updateData.status = 'calificado'
    await sbPatch('crm_conversations', conv.id, updateData)

    console.log('[WA] ✅ respondido a:', phoneFrom, '| conv:', conv.id)

  } catch (err) {
    console.error('[WA] Error en processWebhook:', err.message)
  }
}
