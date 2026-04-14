// api/whatsapp.js — Webhook Evolution API + Rabito IA
// Archivo backend puro. No pegar JSX/HTML suelto aquí.

import { createClient } from '@supabase/supabase-js'

const DEFAULT_EVO_URL = 'https://wa.rabbittscapital.com'
const DEFAULT_EVO_KEY = 'rabbitts2024'
const DEFAULT_AGENT_URL = 'https://crm.rabbittscapital.com/api/agent'

function safeJsonParse(text, fallback = null) {
  try { return text ? JSON.parse(text) : fallback } catch (_) { return fallback }
}

async function readJsonResponse(response) {
  const text = await response.text()
  const json = safeJsonParse(text)
  return { text, json }
}

function getMessageText(msg = {}) {
  return (
    msg?.message?.conversation ||
    msg?.message?.extendedTextMessage?.text ||
    msg?.message?.imageMessage?.caption ||
    msg?.message?.videoMessage?.caption ||
    msg?.message?.documentMessage?.caption ||
    ''
  )
}

function normalizePhoneFromJid(jid = '') {
  const raw = String(jid).replace(/@[^@]+$/, '').replace(/\D/g, '')
  return raw ? `+${raw}` : ''
}

function getSendTo(jid = '') {
  const raw = String(jid).replace(/@[^@]+$/, '').replace(/\D/g, '')
  return jid.endsWith('@s.whatsapp.net') ? raw : jid
}

async function autoCreateLeads(sb) {
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

  const { data: pending, error } = await sb
    .from('crm_conversations')
    .select('*')
    .eq('status', 'calificado')
    .is('lead_id', null)
    .lt('updated_at', cutoff)
    .limit(5)

  if (error) {
    console.warn('[WA] autoCreateLeads select:', error.message)
    return
  }
  if (!pending?.length) return

  for (const conv of pending) {
    const { data: existing } = await sb
      .from('crm_leads')
      .select('id')
      .eq('telefono', conv.telefono)
      .limit(1)

    if (existing?.length) {
      await sb.from('crm_conversations').update({ lead_id: existing[0].id }).eq('id', conv.id)
      continue
    }

    const newLead = {
      id: 'l-auto-' + Date.now() + '-' + String(conv.id).slice(-4),
      nombre: conv.nombre || conv.telefono,
      telefono: conv.telefono || '',
      email: conv.email || '',
      tag: 'lead',
      stage: 'nuevo',
      fecha: new Date().toISOString(),
      notas: `Auto-creado desde WhatsApp (calificó pero no agendó). ${conv.last_message ? 'Último mensaje: ' + String(conv.last_message).slice(0, 100) : ''}`,
      fuente: 'whatsapp_auto'
    }

    const { data: lead, error: insertError } = await sb
      .from('crm_leads')
      .insert(newLead)
      .select()
      .single()

    if (!insertError && lead) {
      await sb.from('crm_conversations').update({ lead_id: lead.id }).eq('id', conv.id)
      console.log('[WA] Auto-lead creado:', conv.telefono, lead.id)
    } else if (insertError) {
      console.error('[WA] Auto-lead error:', insertError.message)
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, apikey')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const SB_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const SB_KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()
  const EVO_URL = (process.env.EVOLUTION_API_URL || process.env.EVO_URL || DEFAULT_EVO_URL).trim()
  const EVO_KEY = (process.env.EVOLUTION_API_KEY || process.env.EVO_KEY || DEFAULT_EVO_KEY).trim()
  const AGENT_URL = (process.env.RABITO_AGENT_URL || DEFAULT_AGENT_URL).trim()

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'ok',
      service: 'whatsapp-webhook',
      env: {
        SUPABASE_URL: !!SB_URL,
        SUPABASE_KEY: !!SB_KEY,
        EVOLUTION_API_URL: !!EVO_URL,
        EVOLUTION_API_KEY: !!EVO_KEY,
        RABITO_AGENT_URL: !!AGENT_URL
      }
    })
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  if (!SB_URL || !SB_KEY) {
    console.error('[WA] ENV faltantes: SUPABASE_URL/SUPABASE_SERVICE_KEY')
    return res.status(200).json({ ok: false, error: 'env_missing' })
  }

  const sb = createClient(SB_URL, SB_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })

  const body = req.body || {}
  const eventRaw = String(body?.event || body?.type || '').trim()
  const event = eventRaw.toLowerCase()
  const inst = String(body?.instance || body?.instanceName || body?.data?.instance || '').trim()

  console.log('[WA] event:', eventRaw || '(sin evento)', '| inst:', inst || '(sin instancia)')

  try {
    // Guardar QR si Evolution lo manda por webhook
    if (event.includes('qrcode') || event.includes('qr')) {
      const qr =
        body?.data?.qrcode?.base64 ||
        body?.data?.base64 ||
        body?.data?.qr ||
        body?.qrcode?.base64 ||
        body?.base64 ||
        body?.qr ||
        ''

      if (qr && inst) {
        await sb
          .from('crm_settings')
          .upsert({ key: `wa_qr_${inst}`, value: { qr, ts: Date.now() } }, { onConflict: 'key' })
      }

      return res.status(200).json({ ok: true, event: eventRaw })
    }

    // Estado de conexión
    if (event.includes('connection')) {
      const state = body?.data?.state || body?.state || body?.data?.connection || ''
      if (state === 'open' && inst) {
        await sb.from('crm_settings').delete().eq('key', `wa_qr_${inst}`)
      }

      return res.status(200).json({ ok: true, event: eventRaw, state })
    }

    // Rabito solo responde a mensajes entrantes nuevos.
    if (!event.includes('messages') || !event.includes('upsert')) {
      return res.status(200).json({ ok: true, skipped: eventRaw || 'unknown_event' })
    }

    const data = body?.data
    const msg = Array.isArray(data) ? data[0] : data
    if (!msg?.key) return res.status(200).json({ ok: true, skipped: 'no_message_key' })

    const fromMe = !!msg?.key?.fromMe
    const jid = msg?.key?.remoteJid || ''
    if (!jid || jid.includes('@g.us')) return res.status(200).json({ ok: true, skipped: 'group_or_no_jid' })

    const text = getMessageText(msg).trim()
    const name = msg?.pushName || msg?.senderName || ''
    const tel = normalizePhoneFromJid(jid)
    const sendTo = getSendTo(jid)

    console.log('[WA] de:', tel, '| nombre:', name, '| fromMe:', fromMe, '| texto:', text.slice(0, 80))
    if (!tel) return res.status(200).json({ ok: true, skipped: 'no_phone' })

    // 1. Buscar o crear conversación
    const { data: rows, error: convError } = await sb
      .from('crm_conversations')
      .select('*')
      .eq('telefono', tel)
      .order('updated_at', { ascending: false })
      .limit(1)

    if (convError) console.warn('[WA] select conv:', convError.message)

    let conv = rows?.[0] || null

    if (!conv) {
      const newConv = {
        id: 'wa-' + Date.now(),
        telefono: tel,
        nombre: name || tel,
        mode: 'ia',
        status: 'activo',
        last_message: text || '[multimedia]',
        lead_id: null,
        instanceName: inst || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const { data: ins, error: insertConvError } = await sb
        .from('crm_conversations')
        .upsert(newConv, { onConflict: 'id' })
        .select()
        .single()

      if (insertConvError) {
        console.error('[WA] upsert conv:', insertConvError.message)
        conv = newConv
      } else {
        conv = ins
      }
    } else if (inst && !conv.instanceName) {
      await sb.from('crm_conversations').update({ instanceName: inst }).eq('id', conv.id)
      conv.instanceName = inst
    }

    // 2. Guardar mensaje entrante o saliente
    if (text) {
      const role = fromMe ? 'assistant' : 'user'
      const { error: msgError } = await sb.from('crm_conv_messages').insert({
        conv_id: conv.id,
        role,
        content: text,
        created_at: new Date().toISOString(),
        manual: fromMe || undefined
      })
      if (msgError) console.warn('[WA] insert message:', msgError.message)
    }

    await sb
      .from('crm_conversations')
      .update({ last_message: text || conv.last_message, updated_at: new Date().toISOString(), ...(inst ? { instanceName: inst } : {}) })
      .eq('id', conv.id)

    // Si el mensaje salió desde el mismo WhatsApp, no responder con IA.
    if (fromMe) return res.status(200).json({ ok: true, saved: 'fromMe' })

    // Sin texto o conversación en modo humano: no responder con IA.
    if (conv.mode === 'humano' || !text) {
      return res.status(200).json({ ok: true, mode: conv.mode || 'ia', skipped: !text ? 'no_text' : 'human_mode' })
    }

    // 3. Verificar configuración IA
    const { data: cfgRow, error: cfgError } = await sb
      .from('crm_settings')
      .select('value')
      .eq('key', 'ia_config')
      .single()

    if (cfgError) console.warn('[WA] ia_config:', cfgError.message)

    const ia = cfgRow?.value || {}
    if (!ia.activo) {
      console.log('[WA] IA desactivada')
      return res.status(200).json({ ok: true, skipped: 'ia_off' })
    }

    // 4. Historial
    const { data: hist } = await sb
      .from('crm_conv_messages')
      .select('role,content')
      .eq('conv_id', conv.id)
      .order('created_at', { ascending: true })
      .limit(20)

    const history = (hist || [])
      .filter(m => m?.content)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))

    // 5. Llamar a Rabito IA
    const agentRes = await fetch(AGENT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: text,
        conversationHistory: history.slice(0, -1),
        iaConfig: ia,
        leadData: {
          telefono: tel,
          nombre: conv.nombre,
          renta: conv.renta,
          modelo: conv.modelo
        }
      })
    })

    const agentPayload = await readJsonResponse(agentRes)
    if (!agentRes.ok || !agentPayload.json) {
      console.error('[WA] agent bad response:', agentRes.status, agentPayload.text.slice(0, 300))
      return res.status(200).json({ ok: false, error: 'agent_bad_response', status: agentRes.status })
    }

    const ad = agentPayload.json
    const reply = ad?.reply
    if (!reply) {
      console.log('[WA] Sin reply:', JSON.stringify(ad).slice(0, 200))
      return res.status(200).json({ ok: true, skipped: 'no_reply' })
    }

    // 6. Enviar respuesta por WhatsApp
    const instToUse = conv.instanceName || inst
    if (!instToUse) {
      console.error('[WA] Falta instancia para responder')
      return res.status(200).json({ ok: false, error: 'missing_instance' })
    }

    const waRes = await fetch(`${EVO_URL}/message/sendText/${instToUse}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
      body: JSON.stringify({ number: sendTo, text: reply, delay: 500 })
    })

    const waPayload = await readJsonResponse(waRes)
    console.log('[WA] sendWA:', waRes.status, waPayload.text.slice(0, 120))

    // 7. Guardar respuesta de Rabito
    await sb.from('crm_conv_messages').insert({
      conv_id: conv.id,
      role: 'assistant',
      content: reply,
      created_at: new Date().toISOString()
    })

    const upd = {
      last_message: reply,
      updated_at: new Date().toISOString(),
      ...(ad?.leadUpdate || {})
    }

    if (ad?.action?.includes?.('escal')) upd.mode = 'humano'
    if (ad?.action === 'calificado') upd.status = 'calificado'

    await sb.from('crm_conversations').update(upd).eq('id', conv.id)
    autoCreateLeads(sb).catch(e => console.warn('[WA] autoLead error:', e.message))

    return res.status(200).json({ ok: true, replied: true, convId: conv.id })

  } catch (e) {
    console.error('[WA] ERROR:', e?.stack || e?.message || e)
    return res.status(200).json({ ok: false, error: e?.message || 'unknown_error' })
  }
}
