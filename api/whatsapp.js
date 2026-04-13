// api/whatsapp.js — Evolution API v2 webhook DEFINITIVO
// Sin waitUntil (Vercel Hobby = 60s timeout, más que suficiente)
// Usa @supabase/supabase-js (ya instalado, probado, sin fetch failed)
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ status: 'ok', ts: Date.now() })
  if (req.method !== 'POST') return res.status(405).end()

  const SB_URL = (process.env.VITE_SUPABASE_URL || '').trim()
  const SB_KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()

  if (!SB_URL || !SB_KEY) {
    console.error('[WA] FALTAN ENV VARS')
    return res.status(200).json({ status: 'error', reason: 'env missing' })
  }

  const sb = createClient(SB_URL, SB_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const body         = req.body
  const event        = (body?.event || '').toLowerCase()
  const instanceName = body?.instance || ''

  console.log('[WA] event:', event, '| inst:', instanceName)

  try {
    // ── QR ────────────────────────────────────────────────────────────────────
    if (event.includes('qrcode') || event.includes('qr')) {
      const qr = body?.data?.qrcode?.base64 || body?.data?.base64 || body?.data?.qr
      if (qr) await sb.from('crm_settings').upsert({ key: `wa_qr_${instanceName}`, value: { qr, ts: Date.now() } })
      return res.status(200).json({ status: 'ok', event: 'qr' })
    }

    // ── Conexión ──────────────────────────────────────────────────────────────
    if (event.includes('connection')) {
      const state = body?.data?.state || body?.data?.connection
      if (state === 'open') {
        await sb.from('crm_settings').delete().eq('key', `wa_qr_${instanceName}`)
      }
      return res.status(200).json({ status: 'ok', event: 'connection', state })
    }

    // ── Solo messages.upsert ─────────────────────────────────────────────────
    if (!event.includes('messages') || !event.includes('upsert')) {
      return res.status(200).json({ status: 'ok', skipped: event })
    }

    const data = body?.data
    const msg  = Array.isArray(data) ? data[0] : data
    if (!msg || msg.key?.fromMe) return res.status(200).json({ status: 'ok', skipped: 'fromMe' })

    const jid = msg.key?.remoteJid || ''
    if (jid.includes('@g.us')) return res.status(200).json({ status: 'ok', skipped: 'group' })

    const text = msg.message?.conversation
      || msg.message?.extendedTextMessage?.text
      || msg.message?.imageMessage?.caption
      || msg.message?.videoMessage?.caption || ''

    const name     = msg.pushName || ''
    const phone    = jid.replace(/@[^@]+$/, '')
    const telefono = '+' + phone
    const sendTo   = jid.endsWith('@s.whatsapp.net') ? phone : jid

    console.log('[WA] de:', telefono, '| nombre:', name, '| texto:', text?.slice(0, 60))
    if (!phone) return res.status(200).json({ status: 'ok', skipped: 'no phone' })

    // ── Buscar o crear conversación ───────────────────────────────────────────
    const { data: convArr, error: e1 } = await sb
      .from('crm_conversations')
      .select('*')
      .eq('telefono', telefono)
      .order('updated_at', { ascending: false })
      .limit(1)

    if (e1) console.error('[WA] SELECT conv:', e1.message, e1.code)

    let conv  = convArr?.length > 0 ? convArr[0] : null
    const isNew = !conv

    if (!conv) {
      const { data: ins, error: e2 } = await sb
        .from('crm_conversations')
        .insert({
          id:           'wa-' + Date.now(),
          telefono,
          nombre:       name || phone,
          mode:         'ia',
          status:       'activo',
          instanceName,
          last_message: text || '[multimedia]',
          created_at:   new Date().toISOString(),
          updated_at:   new Date().toISOString()
        })
        .select()
        .single()

      if (e2) {
        console.error('[WA] INSERT conv FAILED:', e2.message, e2.code, e2.details)
        // Intentar sin instanceName si es columna desconocida
        if (e2.code === 'PGRST204' || e2.message?.includes('column') || e2.message?.includes('instanceName')) {
          const { data: ins2, error: e3 } = await sb
            .from('crm_conversations')
            .insert({ id: 'wa-' + Date.now(), telefono, nombre: name || phone, mode: 'ia', status: 'activo',
              last_message: text || '[multimedia]', created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .select().single()
          if (e3) console.error('[WA] INSERT conv retry FAILED:', e3.message)
          else { conv = ins2; console.log('[WA] Conv creada (sin instanceName):', ins2?.id) }
        }
      } else {
        conv = ins
        console.log('[WA] Conv creada:', ins?.id)
      }

      if (!conv) conv = { id: 'wa-' + Date.now(), telefono, nombre: name || phone, mode: 'ia', instanceName }
    } else {
      console.log('[WA] Conv existente:', conv.id, '| modo:', conv.mode)
      if (name && conv.nombre !== name) {
        await sb.from('crm_conversations').update({ nombre: name }).eq('id', conv.id)
      }
    }

    // ── Guardar mensaje entrante ──────────────────────────────────────────────
    if (text) {
      const { error: e3 } = await sb.from('crm_conv_messages').insert({
        conv_id: conv.id, role: 'user', content: text, created_at: new Date().toISOString()
      })
      if (e3) console.error('[WA] INSERT user msg:', e3.message)
    }

    await sb.from('crm_conversations').update({
      last_message: text || conv.last_message,
      updated_at:   new Date().toISOString()
    }).eq('id', conv.id)

    // Responder a Evolution API YA (para no timeout en el webhook)
    res.status(200).json({ status: 'ok', convId: conv.id })

    // ── Procesar respuesta IA ─────────────────────────────────────────────────
    if (conv.mode === 'humano' || !text) return

    const { data: cfgRow } = await sb.from('crm_settings').select('value').eq('key', 'ia_config').single()
    const ia = cfgRow?.value || {}
    if (!ia.activo) { console.log('[WA] IA desactivada'); return }

    const { data: hist } = await sb.from('crm_conv_messages')
      .select('role, content').eq('conv_id', conv.id)
      .order('created_at', { ascending: true }).limit(20)

    const history = (hist || []).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant', content: m.content
    }))
    console.log('[WA] historial:', history.length, 'msgs')

    const agentRes = await fetch('https://crm.rabbittscapital.com/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        conversationHistory: history.slice(0, -1),
        iaConfig: ia,
        leadData: { telefono, nombre: conv.nombre, renta: conv.renta, modelo: conv.modelo }
      })
    })
    const ad    = await agentRes.json()
    const reply = ad?.reply
    if (!reply) { console.log('[WA] sin reply:', JSON.stringify(ad).slice(0, 80)); return }

    // Enviar por WhatsApp
    const EVO = 'https://wa.rabbittscapital.com'
    const inst = conv.instanceName || instanceName
    await fetch(`${EVO}/message/sendText/${inst}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': 'rabbitts2024' },
      body: JSON.stringify({ number: sendTo, text: reply, delay: 500 })
    })

    // Guardar respuesta IA
    const { error: e4 } = await sb.from('crm_conv_messages').insert({
      conv_id: conv.id, role: 'assistant', content: reply, created_at: new Date().toISOString()
    })
    if (e4) console.error('[WA] INSERT assistant msg:', e4.message)

    const upd = { last_message: reply, updated_at: new Date().toISOString(), ...(ad?.leadUpdate || {}) }
    if (ad?.action?.includes('escal')) upd.mode = 'humano'
    if (ad?.action === 'calificado')   upd.status = 'calificado'
    await sb.from('crm_conversations').update(upd).eq('id', conv.id)

    console.log('[WA] ✅ respondido a:', telefono)

  } catch(e) {
    console.error('[WA] ERROR:', e.message, e.cause?.code || '', e.stack?.slice(0, 150))
    if (!res.headersSent) res.status(200).json({ status: 'error', msg: e.message })
  }
}
