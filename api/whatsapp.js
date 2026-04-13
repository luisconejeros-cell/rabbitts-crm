// api/whatsapp.js — VERSIÓN FINAL PROBADA
// TODO se procesa ANTES de responder (60s timeout en Vercel Hobby, suficiente)
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  // GET: diagnóstico
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      env: {
        SUPABASE_URL:         !!process.env.SUPABASE_URL,
        SUPABASE_SERVICE_KEY: !!process.env.SUPABASE_SERVICE_KEY,
        VITE_SUPABASE_URL:    !!process.env.VITE_SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: !!process.env.VITE_SUPABASE_ANON_KEY,
      }
    })
  }
  if (req.method !== 'POST') return res.status(405).end()

  const SB_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const SB_KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()
  const EVO    = 'https://wa.rabbittscapital.com'
  const EVOKEY = 'rabbitts2024'

  if (!SB_URL || !SB_KEY) {
    console.error('[WA] ENV FALTANTES: SUPABASE_URL o SUPABASE_SERVICE_KEY no configuradas')
    return res.status(200).json({ ok: false, error: 'env_missing' })
  }

  const sb = createClient(SB_URL, SB_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const body = req.body
  const event = (body?.event || '').toLowerCase()
  const inst  = body?.instance || ''

  console.log('[WA] event:', event, '| inst:', inst)

  // QR
  if (event.includes('qrcode') || event.includes('qr')) {
    const qr = body?.data?.qrcode?.base64 || body?.data?.base64 || body?.data?.qr
    if (qr) await sb.from('crm_settings').upsert({ key: `wa_qr_${inst}`, value: { qr, ts: Date.now() } }, { onConflict: 'key' })
    return res.status(200).json({ ok: true })
  }

  // Conexión
  if (event.includes('connection')) {
    if (body?.data?.state === 'open') await sb.from('crm_settings').delete().eq('key', `wa_qr_${inst}`)
    return res.status(200).json({ ok: true })
  }

  // Solo messages.upsert
  if (!event.includes('messages') || !event.includes('upsert')) {
    return res.status(200).json({ ok: true, skipped: event })
  }

  // Extraer datos del mensaje
  const data = body?.data
  const msg  = Array.isArray(data) ? data[0] : data
  const fromMe = msg?.key?.fromMe || false
  // Si es mensaje enviado DESDE Rabito: guardar en CRM pero no responder con IA
  const jid = msg.key?.remoteJid || ''
  if (jid.includes('@g.us')) return res.status(200).json({ ok: true })

  const text   = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || ''
  const name   = msg.pushName || ''
  const phone  = jid.replace(/@[^@]+$/, '')
  const tel    = '+' + phone
  const sendTo = jid.endsWith('@s.whatsapp.net') ? phone : jid

  console.log('[WA] de:', tel, '| nombre:', name, '| fromMe:', fromMe, '| texto:', text.slice(0,60))
  if (!phone) return res.status(200).json({ ok: true })

  try {
    // 1. Buscar o crear conversación
    const { data: rows } = await sb.from('crm_conversations').select('*').eq('telefono', tel).order('updated_at', { ascending: false }).limit(1)
    let conv = rows && rows.length > 0 ? rows[0] : null

    if (!conv) {
      const newConv = {
        id: 'wa-' + Date.now(), telefono: tel, nombre: name || phone,
        mode: 'ia', status: 'activo', last_message: text || '[multimedia]',
        lead_id: null,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }
      // UPSERT igual que el frontend CRM
      const { data: ins, error: ie } = await sb
        .from('crm_conversations')
        .upsert(newConv, { onConflict: 'id' })
        .select().single()

      if (ie) {
        console.error('[WA] UPSERT FAILED:', ie.message, '|code:', ie.code, '|hint:', ie.hint, '|details:', ie.details)
        // Seguir con objeto local para que Rabito igual responda
        conv = newConv
      } else {
        conv = ins
        console.log('[WA] Conv nueva:', conv.id)
      }
    } else {
      console.log('[WA] Conv existente:', conv.id)
    }

    // 2. Guardar mensaje del usuario
    if (text) {
      const { error: me } = await sb.from('crm_conv_messages').insert({
        conv_id: conv.id, role: 'user', content: text, created_at: new Date().toISOString()
      })
      if (me) console.error('[WA] INSERT msg_user:', me.message, me.code)
    }

    // 3. Actualizar last_message
    await sb.from('crm_conversations').update({ last_message: text || conv.last_message, updated_at: new Date().toISOString() }).eq('id', conv.id)

    // 4. Si fromMe: guardar como mensaje del asistente y terminar (sin responder con IA)
    if (fromMe) {
      if (text) {
        await sb.from('crm_conv_messages').insert({
          conv_id: conv.id, role: 'assistant', content: text,
          created_at: new Date().toISOString(), manual: true
        })
        await sb.from('crm_conversations').update({ last_message: text, updated_at: new Date().toISOString() }).eq('id', conv.id)
      }
      return res.status(200).json({ ok: true, saved: 'fromMe' })
    }

    // Si modo humano o sin texto: terminar sin IA
    if (conv.mode === 'humano' || !text) return res.status(200).json({ ok: true, mode: conv.mode })

    // 5. Verificar IA activa
    const { data: cfgRow } = await sb.from('crm_settings').select('value').eq('key', 'ia_config').single()
    const ia = cfgRow?.value || {}
    if (!ia.activo) {
      console.log('[WA] IA desactivada')
      return res.status(200).json({ ok: true, skipped: 'ia_off' })
    }

    // 6. Historial de conversación
    const { data: hist } = await sb.from('crm_conv_messages').select('role,content').eq('conv_id', conv.id).order('created_at', { ascending: true }).limit(20)
    const history = (hist || []).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))
    console.log('[WA] historial:', history.length, 'msgs')

    // 7. Llamar al agente IA
    const ar = await fetch('https://crm.rabbittscapital.com/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        conversationHistory: history.slice(0, -1),
        iaConfig: ia,
        leadData: { telefono: tel, nombre: conv.nombre, renta: conv.renta, modelo: conv.modelo }
      })
    })
    const ad    = await ar.json()
    const reply = ad?.reply
    if (!reply) {
      console.log('[WA] Sin reply:', JSON.stringify(ad).slice(0,100))
      return res.status(200).json({ ok: true, skipped: 'no_reply' })
    }

    // 8. Enviar por WhatsApp
    const instToUse = conv.instanceName || inst
    const wr = await fetch(`${EVO}/message/sendText/${instToUse}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOKEY },
      body: JSON.stringify({ number: sendTo, text: reply, delay: 500 })
    })
    console.log('[WA] sendWA:', wr.status)

    // 9. Guardar respuesta IA
    await sb.from('crm_conv_messages').insert({ conv_id: conv.id, role: 'assistant', content: reply, created_at: new Date().toISOString() })

    // 10. Actualizar conversación
    const upd = { last_message: reply, updated_at: new Date().toISOString(), ...(ad?.leadUpdate || {}) }
    if (ad?.action?.includes('escal')) upd.mode   = 'humano'
    if (ad?.action === 'calificado')   upd.status = 'calificado'
    await sb.from('crm_conversations').update(upd).eq('id', conv.id)

    console.log('[WA] ✅ OK →', tel)
    return res.status(200).json({ ok: true, replied: true, convId: conv.id })

  } catch(e) {
    console.error('[WA] ERROR:', e.message)
    return res.status(200).json({ ok: false, error: e.message })
  }
}
