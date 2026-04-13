// api/whatsapp.js — Evolution API v2 webhook (DEFINITIVO)
// waitUntil mantiene la función viva después de responder al webhook
import { waitUntil } from '@vercel/functions'

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ status: 'ok', service: 'Rabbitts WhatsApp v2' })
  if (req.method !== 'POST') return res.status(405).end()

  const body = req.body

  // Responder INMEDIATAMENTE a Evolution API
  // waitUntil garantiza que processWebhook termina antes de que Vercel mate la función
  waitUntil(processWebhook(body))
  return res.status(200).json({ status: 'ok' })
}

async function processWebhook(body) {
  try {
    const event        = (body?.event || '').toLowerCase()
    const instanceName = body?.instance || ''
    const SB           = process.env.VITE_SUPABASE_URL
    const SK           = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
    const EVO          = 'https://wa.rabbittscapital.com'
    const EVOKEY       = 'rabbitts2024'

    if (!SB || !SK) { console.error('[WA] env missing'); return }
    console.log('[WA]', event, '| key:', SK.slice(-6))

    const H = { 'apikey': SK, 'Authorization': `Bearer ${SK}`, 'Content-Type': 'application/json' }

    const sbGet = async (path) => {
      const r = await fetch(`${SB}/rest/v1/${path}`, { headers: H })
      const t = await r.text()
      if (!r.ok) console.error(`[WA] GET ${path} ${r.status}:`, t.slice(0,150))
      try { return JSON.parse(t) } catch { return null }
    }
    const sbPost = async (table, data, prefer = 'return=representation') => {
      const r = await fetch(`${SB}/rest/v1/${table}`, {
        method: 'POST', headers: { ...H, 'Prefer': prefer }, body: JSON.stringify(data)
      })
      const t = await r.text()
      if (!r.ok) console.error(`[WA] POST ${table} ${r.status}:`, t.slice(0,200))
      else console.log(`[WA] POST ${table} ${r.status} ok`)
      try { const j = JSON.parse(t); return Array.isArray(j) ? j[0] : j } catch { return null }
    }
    const sbPatch = async (table, filter, data) => {
      const r = await fetch(`${SB}/rest/v1/${table}?${filter}`, {
        method: 'PATCH', headers: { ...H, 'Prefer': 'return=minimal' }, body: JSON.stringify(data)
      })
      if (!r.ok) { const t = await r.text(); console.error(`[WA] PATCH ${table} ${r.status}:`, t.slice(0,150)) }
    }

    // ── QR ────────────────────────────────────────────────────────────────────
    if (event.includes('qrcode') || event.includes('qr')) {
      const qr = body?.data?.qrcode?.base64 || body?.data?.base64
      if (qr) await sbPost('crm_settings', { key: `wa_qr_${instanceName}`, value: { qr, ts: Date.now() } }, 'resolution=merge-duplicates,return=minimal')
      return
    }
    if (event.includes('connection')) {
      if (body?.data?.state === 'open') await fetch(`${SB}/rest/v1/crm_settings?key=eq.wa_qr_${instanceName}`, { method: 'DELETE', headers: H })
      return
    }
    if (!event.includes('messages') || !event.includes('upsert')) return

    // ── Extraer mensaje ───────────────────────────────────────────────────────
    const data = body?.data
    const msg  = Array.isArray(data) ? data[0] : data
    if (!msg || msg.key?.fromMe) return
    const jid = msg.key?.remoteJid || ''
    if (jid.includes('@g.us')) return

    const text     = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || ''
    const name     = msg.pushName || ''
    const phone    = jid.replace(/@s\.whatsapp\.net$/, '').replace(/@lid$/, '').replace(/@[\w.]+$/, '')
    const sendTo   = jid.endsWith('@s.whatsapp.net') ? phone : jid
    const telefono = '+' + phone

    console.log('[WA] de:', telefono, '| nombre:', name, '| texto:', text?.slice(0,60))
    if (!phone) return

    const sendWA = async (txt) => {
      const r = await fetch(`${EVO}/message/sendText/${instanceName}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': EVOKEY },
        body: JSON.stringify({ number: sendTo, text: txt, delay: 500 })
      })
      console.log('[WA] sendWA:', r.status)
    }

    // ── Buscar o crear conversación ───────────────────────────────────────────
    const convs = await sbGet(`crm_conversations?telefono=eq.${encodeURIComponent(telefono)}&order=updated_at.desc&limit=1`)
    let conv    = Array.isArray(convs) && convs.length > 0 ? convs[0] : null
    const isNew = !conv

    if (!conv) {
      const newConv = {
        id:           'wa-' + Date.now(),
        telefono,
        nombre:       name || phone,
        mode:         'ia',
        status:       'activo',
        last_message: text || '[multimedia]',
        created_at:   new Date().toISOString(),
        updated_at:   new Date().toISOString()
      }
      const saved = await sbPost('crm_conversations', newConv)
      conv = saved || newConv
      console.log('[WA] conv creada:', conv?.id)
    } else {
      console.log('[WA] conv existente:', conv.id, 'modo:', conv.mode)
    }

    // ── Guardar mensaje usuario ───────────────────────────────────────────────
    if (text) {
      await sbPost('crm_conv_messages',
        { conv_id: conv.id, role: 'user', content: text, created_at: new Date().toISOString() },
        'return=minimal'
      )
    }
    await sbPatch('crm_conversations', `id=eq.${conv.id}`, {
      last_message: text || conv.last_message,
      updated_at: new Date().toISOString(),
      ...(name && isNew ? {} : name ? { nombre: name } : {})
    })

    if (conv.mode === 'humano' || !text) return

    // ── IA activa? ────────────────────────────────────────────────────────────
    const cfg = await sbGet('crm_settings?key=eq.ia_config&select=value')
    const ia  = cfg?.[0]?.value || {}
    if (!ia.activo) return

    // ── Historial ─────────────────────────────────────────────────────────────
    const hist = await sbGet(`crm_conv_messages?conv_id=eq.${conv.id}&order=created_at.asc&limit=20`)
    const history = Array.isArray(hist)
      ? hist.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))
      : []
    console.log('[WA] historial:', history.length, 'msgs')

    // ── Agente ────────────────────────────────────────────────────────────────
    const ar = await fetch('https://crm.rabbittscapital.com/api/agent', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        conversationHistory: history.slice(0, -1),
        iaConfig: ia,
        leadData: { telefono, nombre: conv.nombre, renta: conv.renta, modelo: conv.modelo }
      })
    })
    const ad    = await ar.json()
    const reply = ad?.reply
    if (!reply) { console.log('[WA] sin reply:', JSON.stringify(ad).slice(0,100)); return }

    await sendWA(reply)
    await sbPost('crm_conv_messages',
      { conv_id: conv.id, role: 'assistant', content: reply, created_at: new Date().toISOString() },
      'return=minimal'
    )

    const upd = { last_message: reply, updated_at: new Date().toISOString(), ...(ad?.leadUpdate||{}) }
    if (ad?.action?.includes('escal')) upd.mode = 'humano'
    if (ad?.action === 'calificado')  upd.status = 'calificado'
    await sbPatch('crm_conversations', `id=eq.${conv.id}`, upd)

    console.log('[WA] ✅ ok →', telefono)

  } catch(e) {
    console.error('[WA] error fatal:', e.message, e.stack?.slice(0,200))
  }
}
