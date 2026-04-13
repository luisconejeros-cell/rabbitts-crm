// api/whatsapp.js — Rabbitts Capital WhatsApp webhook
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Diagnóstico GET: muestra qué env vars están configuradas
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

  // Leer URL y KEY — intenta múltiples nombres de variable
  const SB_URL = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ''
  ).trim()

  const SB_KEY = (
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim()

  const EVO_URL = 'https://wa.rabbittscapital.com'
  const EVO_KEY = 'rabbitts2024'

  if (!SB_URL || !SB_KEY) {
    console.error('[WA] ENV VARS FALTANTES — configura en Vercel Dashboard:',
      'SUPABASE_URL:', !!SB_URL, '| SUPABASE_SERVICE_KEY:', !!SB_KEY)
    return res.status(200).json({ ok: false, error: 'env_missing' })
  }

  const sb = createClient(SB_URL, SB_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const body         = req.body
  const event        = (body?.event || '').toLowerCase()
  const instanceName = body?.instance || ''

  console.log('[WA] event:', event, '| instance:', instanceName)

  try {
    // QR
    if (event.includes('qrcode') || event.includes('qr')) {
      const qr = body?.data?.qrcode?.base64 || body?.data?.base64 || body?.data?.qr
      if (qr) {
        await sb.from('crm_settings').upsert(
          { key: `wa_qr_${instanceName}`, value: { qr, ts: Date.now() } },
          { onConflict: 'key' }
        )
      }
      return res.status(200).json({ ok: true, event: 'qr' })
    }

    // Conexión
    if (event.includes('connection')) {
      const state = body?.data?.state || body?.data?.connection
      if (state === 'open') {
        await sb.from('crm_settings').delete().eq('key', `wa_qr_${instanceName}`)
      }
      return res.status(200).json({ ok: true, event: 'connection', state })
    }

    // Solo procesar messages.upsert
    if (!event.includes('messages') || !event.includes('upsert')) {
      return res.status(200).json({ ok: true, skipped: event })
    }

    // Extraer mensaje
    const data = body?.data
    const msg  = Array.isArray(data) ? data[0] : data
    if (!msg || msg.key?.fromMe) return res.status(200).json({ ok: true, skipped: 'fromMe' })

    const jid = msg.key?.remoteJid || ''
    if (jid.includes('@g.us')) return res.status(200).json({ ok: true, skipped: 'group' })

    const text = msg.message?.conversation
      || msg.message?.extendedTextMessage?.text
      || msg.message?.imageMessage?.caption
      || msg.message?.videoMessage?.caption || ''

    const name     = msg.pushName || ''
    const phone    = jid.replace(/@[^@]+$/, '')
    const telefono = '+' + phone
    const sendTo   = jid.endsWith('@s.whatsapp.net') ? phone : jid

    console.log('[WA] de:', telefono, '| nombre:', name, '| texto:', text?.slice(0, 60))
    if (!phone) return res.status(200).json({ ok: true, skipped: 'no_phone' })

    // Buscar conversación existente
    const { data: existing, error: selErr } = await sb
      .from('crm_conversations')
      .select('*')
      .eq('telefono', telefono)
      .order('updated_at', { ascending: false })
      .limit(1)

    if (selErr) console.error('[WA] SELECT error:', selErr.message, selErr.code)

    let conv  = existing && existing.length > 0 ? existing[0] : null
    const isNew = !conv

    // Crear conversación nueva (solo con campos que SABEMOS que existen)
    if (!conv) {
      const { data: created, error: insErr } = await sb
        .from('crm_conversations')
        .insert({
          id:           'wa-' + Date.now(),
          telefono,
          nombre:       name || phone,
          mode:         'ia',
          status:       'activo',
          last_message: text || '[multimedia]',
          created_at:   new Date().toISOString(),
          updated_at:   new Date().toISOString()
        })
        .select()
        .single()

      if (insErr) {
        console.error('[WA] INSERT conv error:', insErr.message, insErr.code, insErr.hint)
        return res.status(200).json({ ok: false, step: 'insert_conv', error: insErr.message })
      }

      conv = created
      console.log('[WA] Conv creada:', conv.id)
    } else {
      console.log('[WA] Conv existente:', conv.id, '| modo:', conv.mode)
    }

    // Guardar mensaje entrante
    if (text) {
      const { error: msgErr } = await sb.from('crm_conv_messages').insert({
        conv_id:    conv.id,
        role:       'user',
        content:    text,
        created_at: new Date().toISOString()
      })
      if (msgErr) console.error('[WA] INSERT msg error:', msgErr.message, msgErr.code)
    }

    // Actualizar last_message
    await sb.from('crm_conversations').update({
      last_message: text || conv.last_message,
      updated_at:   new Date().toISOString()
    }).eq('id', conv.id)

    // Responder a Evolution API para que no timeout
    res.status(200).json({ ok: true, convId: conv.id })

    // --- Desde aquí: procesar IA (después de responder al webhook) ---
    if (conv.mode === 'humano' || !text) return

    // Verificar IA activa
    const { data: cfgRow } = await sb
      .from('crm_settings')
      .select('value')
      .eq('key', 'ia_config')
      .single()

    const ia = cfgRow?.value || {}
    if (!ia.activo) { console.log('[WA] IA desactivada'); return }

    // Historial de la conversación
    const { data: histRows } = await sb
      .from('crm_conv_messages')
      .select('role, content')
      .eq('conv_id', conv.id)
      .order('created_at', { ascending: true })
      .limit(20)

    const history = (histRows || []).map(m => ({
      role:    m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }))

    console.log('[WA] historial:', history.length, 'mensajes')

    // Llamar al agente IA
    const agentRes = await fetch('https://crm.rabbittscapital.com/api/agent', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        message:             text,
        conversationHistory: history.slice(0, -1),
        iaConfig:            ia,
        leadData: {
          telefono,
          nombre:    conv.nombre,
          renta:     conv.renta,
          modelo:    conv.modelo
        }
      })
    })

    const agentData = await agentRes.json()
    const reply = agentData?.reply

    if (!reply) {
      console.log('[WA] Agente sin respuesta:', JSON.stringify(agentData).slice(0, 100))
      return
    }

    // Enviar respuesta por WhatsApp
    const inst = conv.instanceName || instanceName
    await fetch(`${EVO_URL}/message/sendText/${inst}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
      body:    JSON.stringify({ number: sendTo, text: reply, delay: 500 })
    })

    // Guardar respuesta en historial
    await sb.from('crm_conv_messages').insert({
      conv_id:    conv.id,
      role:       'assistant',
      content:    reply,
      created_at: new Date().toISOString()
    })

    // Actualizar conversación
    const upd = {
      last_message: reply,
      updated_at:   new Date().toISOString(),
      ...(agentData?.leadUpdate || {})
    }
    if (agentData?.action?.includes('escal')) upd.mode    = 'humano'
    if (agentData?.action === 'calificado')   upd.status  = 'calificado'

    await sb.from('crm_conversations').update(upd).eq('id', conv.id)

    console.log('[WA] ✅ Respondido a:', telefono)

  } catch (err) {
    console.error('[WA] ERROR FATAL:', err.message, err.cause?.code || '')
    if (!res.headersSent) {
      res.status(200).json({ ok: false, error: err.message })
    }
  }
}
