// api/whatsapp.js — Evolution API v2 (usa @supabase/supabase-js para evitar fetch failed)
import { createClient } from '@supabase/supabase-js'
import { waitUntil } from '@vercel/functions'

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ status: 'ok', service: 'Rabbitts WA v2' })
  if (req.method !== 'POST') return res.status(405).end()
  // Responder inmediatamente — waitUntil mantiene la función viva
  waitUntil(processWebhook(req.body))
  return res.status(200).json({ status: 'ok' })
}

async function processWebhook(body) {
  const SB_URL  = (process.env.VITE_SUPABASE_URL || '').trim()
  const SB_KEY  = (process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()
  const EVO_URL = 'https://wa.rabbittscapital.com'
  const EVO_KEY = 'rabbitts2024'

  if (!SB_URL || !SB_KEY) {
    console.error('[WA] ERROR: env vars VITE_SUPABASE_URL o SUPABASE_SERVICE_KEY no configuradas')
    return
  }

  // Cliente Supabase oficial — maneja SSL, timeouts y reconexión automáticamente
  const sb = createClient(SB_URL, SB_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch }
  })

  try {
    const event        = (body?.event || '').toLowerCase()
    const instanceName = body?.instance || ''
    console.log('[WA]', event, '| inst:', instanceName, '| sb_url:', SB_URL.slice(0, 30))

    // ── QR ──────────────────────────────────────────────────────────────────
    if (event.includes('qrcode') || event.includes('qr')) {
      const qr = body?.data?.qrcode?.base64 || body?.data?.base64 || body?.data?.qr
      if (qr) await sb.from('crm_settings').upsert({ key: `wa_qr_${instanceName}`, value: { qr, ts: Date.now() } })
      return
    }

    // ── Conexión ─────────────────────────────────────────────────────────────
    if (event.includes('connection')) {
      if (body?.data?.state === 'open' || body?.data?.connection === 'open') {
        await sb.from('crm_settings').delete().eq('key', `wa_qr_${instanceName}`)
      }
      return
    }

    // ── Solo messages.upsert ─────────────────────────────────────────────────
    if (!event.includes('messages') || !event.includes('upsert')) return

    const data = body?.data
    const msg  = Array.isArray(data) ? data[0] : data
    if (!msg || msg.key?.fromMe) return
    const jid = msg.key?.remoteJid || ''
    if (jid.includes('@g.us')) return

    const text = msg.message?.conversation
      || msg.message?.extendedTextMessage?.text
      || msg.message?.imageMessage?.caption
      || msg.message?.videoMessage?.caption || ''

    const name     = msg.pushName || ''
    const phone    = jid.replace(/@[^@]+$/, '')
    const telefono = '+' + phone
    const sendTo   = jid.endsWith('@s.whatsapp.net') ? phone : jid

    console.log('[WA] de:', telefono, '| nombre:', name, '| texto:', text?.slice(0, 60))
    if (!phone) return

    // ── Buscar o crear conversación ──────────────────────────────────────────
    const { data: convArr, error: convErr } = await sb
      .from('crm_conversations')
      .select('*')
      .eq('telefono', telefono)
      .order('updated_at', { ascending: false })
      .limit(1)

    if (convErr) console.error('[WA] SELECT conv error:', convErr.message, convErr.code)

    let conv  = convArr && convArr.length > 0 ? convArr[0] : null
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
      const { data: ins, error: insErr } = await sb
        .from('crm_conversations')
        .insert(newConv)
        .select()
        .single()

      if (insErr) {
        console.error('[WA] INSERT conv error:', insErr.message, insErr.code, insErr.details)
      } else {
        console.log('[WA] Conv creada:', ins?.id)
      }
      conv = ins || newConv
    } else {
      console.log('[WA] Conv existente:', conv.id, '| modo:', conv.mode)
    }

    // ── Guardar mensaje usuario ──────────────────────────────────────────────
    if (text) {
      const { error: msgErr } = await sb.from('crm_conv_messages').insert({
        conv_id:    conv.id,
        role:       'user',
        content:    text,
        created_at: new Date().toISOString()
      })
      if (msgErr) console.error('[WA] INSERT user msg error:', msgErr.message)
    }

    // Actualizar last_message
    await sb.from('crm_conversations').update({
      last_message: text || conv.last_message,
      updated_at:   new Date().toISOString(),
      ...(name && conv.nombre !== name ? { nombre: name } : {})
    }).eq('id', conv.id)

    if (conv.mode === 'humano') return
    if (!text) return

    // ── Verificar IA activa ──────────────────────────────────────────────────
    const { data: cfgData } = await sb.from('crm_settings').select('value').eq('key', 'ia_config').single()
    const ia = cfgData?.value || {}
    if (!ia.activo) { console.log('[WA] IA desactivada'); return }

    // ── Historial ────────────────────────────────────────────────────────────
    const { data: histData } = await sb
      .from('crm_conv_messages')
      .select('role, content')
      .eq('conv_id', conv.id)
      .order('created_at', { ascending: true })
      .limit(20)

    const history = (histData || []).map(m => ({
      role:    m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }))
    console.log('[WA] historial:', history.length, 'msgs')

    // ── Llamar agente ────────────────────────────────────────────────────────
    const ar = await fetch('https://crm.rabbittscapital.com/api/agent', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        message:             text,
        conversationHistory: history.slice(0, -1),
        iaConfig:            ia,
        leadData:            { telefono, nombre: conv.nombre, renta: conv.renta, modelo: conv.modelo }
      })
    })
    const ad    = await ar.json()
    const reply = ad?.reply
    if (!reply) { console.log('[WA] sin reply:', JSON.stringify(ad).slice(0, 100)); return }

    // ── Enviar por WhatsApp ──────────────────────────────────────────────────
    await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
      body:    JSON.stringify({ number: sendTo, text: reply, delay: 500 })
    })

    // ── Guardar respuesta ────────────────────────────────────────────────────
    const { error: aErr } = await sb.from('crm_conv_messages').insert({
      conv_id:    conv.id,
      role:       'assistant',
      content:    reply,
      created_at: new Date().toISOString()
    })
    if (aErr) console.error('[WA] INSERT assistant msg error:', aErr.message)

    const upd = { last_message: reply, updated_at: new Date().toISOString(), ...(ad?.leadUpdate || {}) }
    if (ad?.action?.includes('escal')) upd.mode = 'humano'
    if (ad?.action === 'calificado')   upd.status = 'calificado'
    await sb.from('crm_conversations').update(upd).eq('id', conv.id)

    console.log('[WA] ✅ respondido a:', telefono, '| conv:', conv.id)

  } catch (e) {
    console.error('[WA] ERROR FATAL:', e.message, e.cause?.code || '', e.stack?.slice(0, 200))
  }
}
