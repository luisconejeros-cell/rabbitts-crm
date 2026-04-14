// api/whatsapp.js — Webhook Evolution API robusto
// Objetivo:
// 1) Crear/actualizar conversaciones SIEMPRE que llegue un mensaje nuevo.
// 2) Crear lead básico para números nuevos.
// 3) Llamar a /api/agent con URL dinámica del deployment.
// 4) No depender de formatos únicos de Evolution: soporta data directo, arrays, messages, message, webhook variations.
// 5) No cortar la respuesta por ia.activo indefinido: solo se salta si ia.activo === false.

import { createClient } from '@supabase/supabase-js'

const DEFAULT_EVO_URL = 'https://wa.rabbittscapital.com'
const DEFAULT_EVO_KEY = 'rabbitts2024'

function clean(value = '') {
  return String(value ?? '').trim()
}

function nowIso() {
  return new Date().toISOString()
}

function makeId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function getBaseUrl(req) {
  const configured = clean(process.env.PUBLIC_BASE_URL || process.env.APP_URL || process.env.CRM_URL)
  if (configured) return configured.replace(/\/$/, '')
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'
  return host ? `${proto}://${host}` : 'https://crm.rabbittscapital.com'
}

function getSupabase() {
  const url = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const key = clean(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function getEvolutionConfig() {
  return {
    url: clean(process.env.EVOLUTION_API_URL || process.env.EVO_URL || DEFAULT_EVO_URL).replace(/\/$/, ''),
    key: clean(process.env.EVOLUTION_API_KEY || process.env.EVO_KEY || DEFAULT_EVO_KEY)
  }
}

function normalizeEvent(body = {}) {
  return clean(body.event || body.type || body.eventName || body.action || '').toLowerCase().replace(/_/g, '.')
}

function normalizeInstance(body = {}, msg = null) {
  return clean(
    body.instance ||
    body.instanceName ||
    body.instance_name ||
    body.data?.instance ||
    body.data?.instanceName ||
    msg?.instance ||
    msg?.instanceName ||
    ''
  )
}

function unwrapMessageObject(obj = {}) {
  let message = obj?.message || obj?.msg || obj
  if (message?.ephemeralMessage?.message) message = message.ephemeralMessage.message
  if (message?.viewOnceMessage?.message) message = message.viewOnceMessage.message
  if (message?.viewOnceMessageV2?.message) message = message.viewOnceMessageV2.message
  if (message?.documentWithCaptionMessage?.message) message = message.documentWithCaptionMessage.message
  return message || {}
}

function extractTextFromMessage(obj = {}) {
  const message = unwrapMessageObject(obj)
  return clean(
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.buttonsResponseMessage?.selectedButtonId ||
    message.listResponseMessage?.title ||
    message.listResponseMessage?.singleSelectReply?.selectedRowId ||
    message.templateButtonReplyMessage?.selectedDisplayText ||
    message.templateButtonReplyMessage?.selectedId ||
    message.interactiveResponseMessage?.body?.text ||
    message.reactionMessage?.text ||
    ''
  )
}

function getRemoteJid(obj = {}) {
  return clean(
    obj?.key?.remoteJid ||
    obj?.remoteJid ||
    obj?.jid ||
    obj?.from ||
    obj?.sender ||
    obj?.participant ||
    ''
  )
}

function getPushName(obj = {}) {
  return clean(
    obj?.pushName ||
    obj?.notifyName ||
    obj?.name ||
    obj?.senderName ||
    obj?.data?.pushName ||
    ''
  )
}

function getMessageId(obj = {}) {
  return clean(
    obj?.key?.id ||
    obj?.id ||
    obj?.messageId ||
    obj?.data?.key?.id ||
    ''
  )
}

function jidToPhone(jid = '') {
  const base = clean(jid).replace(/@[^@]+$/, '').replace(/:\d+$/, '')
  return base.replace(/[^0-9]/g, '')
}

function phoneToTel(phone = '') {
  const digits = clean(phone).replace(/[^0-9]/g, '')
  return digits ? `+${digits}` : ''
}

function extractMessages(body = {}) {
  const data = body.data
  const candidates = []

  if (Array.isArray(data)) candidates.push(...data)
  else if (Array.isArray(data?.messages)) candidates.push(...data.messages)
  else if (Array.isArray(data?.message)) candidates.push(...data.message)
  else if (data?.key || data?.message || data?.remoteJid || data?.sender) candidates.push(data)
  else if (body?.key || body?.message || body?.remoteJid || body?.sender) candidates.push(body)

  return candidates.filter(Boolean)
}

function isIncomingUserMessage(msg = {}) {
  const jid = getRemoteJid(msg)
  if (!jid || jid.includes('@g.us') || jid.includes('@broadcast')) return false
  return msg?.key?.fromMe !== true && msg?.fromMe !== true
}

async function readSetting(sb, key, fallback = null) {
  try {
    const { data } = await sb.from('crm_settings').select('value').eq('key', key).single()
    return data?.value ?? fallback
  } catch (_) {
    return fallback
  }
}

async function upsertSetting(sb, key, value) {
  try {
    await sb.from('crm_settings').upsert({ key, value }, { onConflict: 'key' })
  } catch (error) {
    console.warn('[WA] setting error:', key, error.message)
  }
}

async function findOrCreateConversation(sb, { tel, phone, name, text, instance }) {
  let conv = null

  try {
    const { data, error } = await sb.from('crm_conversations')
      .select('*')
      .eq('telefono', tel)
      .order('updated_at', { ascending: false })
      .limit(10)
    if (!error && data?.length) {
      const real = data.find(c => c.last_message && c.last_message !== '[mensaje]' && c.last_message !== '[mensaje multimedia]')
      conv = real || data[0]
    }
  } catch (error) {
    console.warn('[WA] search conv error:', error.message)
  }

  if (conv) {
    const update = {
      nombre: conv.nombre || name || phone,
      last_message: text || conv.last_message || '[mensaje]',
      updated_at: nowIso()
    }
    if (instance && 'instanceName' in conv) update.instanceName = instance
    try {
      const { data } = await sb.from('crm_conversations').update(update).eq('id', conv.id).select().single()
      return data || { ...conv, ...update }
    } catch (_) {
      return { ...conv, ...update }
    }
  }

  const base = {
    id: phone ? `wa-${phone}` : makeId('wa'),
    telefono: tel,
    nombre: name || tel || phone,
    mode: 'ia',
    status: 'activo',
    last_message: text || '[mensaje]',
    lead_id: null,
    created_at: nowIso(),
    updated_at: nowIso()
  }

  const attempts = [
    { ...base, instanceName: instance || null, origen: 'whatsapp' },
    { ...base, instanceName: instance || null },
    base
  ]

  for (const payload of attempts) {
    try {
      const { data, error } = await sb.from('crm_conversations').insert(payload).select().single()
      if (!error && data) {
        console.log('[WA] conversación nueva creada:', data.id, tel)
        return data
      }
      if (error) console.warn('[WA] insert conv intento falló:', error.message)
    } catch (error) {
      console.warn('[WA] insert conv excepción:', error.message)
    }
  }

  console.error('[WA] no se pudo persistir conversación; se responderá igual con objeto local:', tel)
  return base
}

async function saveMessage(sb, convId, role, content, extra = {}) {
  if (!convId || !content) return false

  const base = {
    conv_id: convId,
    role: role === 'assistant' ? 'assistant' : 'user',
    content: clean(content),
    created_at: extra.created_at || nowIso()
  }

  // Instancias antiguas pueden no tener columnas extra como manual/internal/masivo.
  // Guardamos el mensaje mínimo si falla el intento completo para que nunca desaparezca del panel.
  const attempts = [
    { ...base, ...extra, conv_id: convId, role: base.role, content: base.content, created_at: base.created_at },
    base
  ]

  for (const payload of attempts) {
    try {
      const { error } = await sb.from('crm_conv_messages').insert(payload)
      if (!error) return true
      console.warn('[WA] saveMessage intento falló:', error.message)
    } catch (error) {
      console.warn('[WA] saveMessage excepción:', error.message)
    }
  }
  return false
}

async function recentlySavedIncoming(sb, convId, content) {
  if (!convId || !content) return false
  const since = new Date(Date.now() - 90_000).toISOString()
  try {
    const { data, error } = await sb.from('crm_conv_messages')
      .select('id')
      .eq('conv_id', convId)
      .eq('role', 'user')
      .eq('content', content)
      .gte('created_at', since)
      .limit(1)
    return !error && Array.isArray(data) && data.length > 0
  } catch (_) {
    return false
  }
}

async function ensureLead(sb, conv, { tel, phone, name, text }) {
  if (!tel) return null
  try {
    const { data: existing } = await sb.from('crm_leads').select('*').eq('telefono', tel).limit(1)
    if (existing?.length) {
      if (conv?.id && !conv.lead_id) await sb.from('crm_conversations').update({ lead_id: existing[0].id }).eq('id', conv.id)
      return existing[0]
    }
  } catch (_) {}

  const base = {
    id: phone ? `l-wa-${phone}` : makeId('l-wa'),
    nombre: name || tel || phone,
    telefono: tel,
    email: '',
    tag: 'lead',
    stage: 'nuevo',
    fecha: nowIso(),
    notas: text ? `Primer contacto por WhatsApp: ${text.slice(0, 250)}` : 'Primer contacto por WhatsApp'
  }

  const attempts = [
    { ...base, fuente: 'whatsapp', origen: 'whatsapp' },
    { ...base, fuente: 'whatsapp' },
    base
  ]

  for (const payload of attempts) {
    try {
      const { data, error } = await sb.from('crm_leads').insert(payload).select().single()
      if (!error && data) {
        if (conv?.id) await sb.from('crm_conversations').update({ lead_id: data.id }).eq('id', conv.id)
        console.log('[WA] lead nuevo creado:', data.id, tel)
        return data
      }
      if (error) console.warn('[WA] insert lead intento falló:', error.message)
    } catch (error) {
      console.warn('[WA] insert lead excepción:', error.message)
    }
  }

  return null
}

async function loadHistory(sb, convId) {
  if (!convId) return []
  try {
    const { data } = await sb.from('crm_conv_messages')
      .select('role,content,created_at')
      .eq('conv_id', convId)
      .order('created_at', { ascending: true })
      .limit(40)
    return (data || []).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clean(m.content) })).filter(m => m.content)
  } catch (_) {
    return []
  }
}

async function getDefaultInstance(sb, fallback = '') {
  if (fallback) return fallback
  const nums = await readSetting(sb, 'wa_numeros', [])
  if (Array.isArray(nums) && nums.length) {
    const active = nums.find(n => n.activo !== false && (n.status === 'open' || n.instanceName)) || nums.find(n => n.instanceName)
    if (active?.instanceName) return active.instanceName
  }
  return clean(process.env.EVOLUTION_DEFAULT_INSTANCE || process.env.EVO_DEFAULT_INSTANCE || '')
}

async function sendWhatsApp({ instance, number, text }) {
  const evo = getEvolutionConfig()
  if (!evo.url || !evo.key || !instance || !number || !text) {
    return { ok: false, status: 0, error: 'missing_send_config' }
  }

  const cleanNumber = clean(number).replace(/[^0-9]/g, '')
  const response = await fetch(`${evo.url}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: evo.key },
    body: JSON.stringify({ number: cleanNumber, text, delay: 500 })
  })

  const body = await response.text().catch(() => '')
  return { ok: response.ok, status: response.status, body: body.slice(0, 300) }
}

async function handleDirectSend(req, res, sb, body) {
  const to = clean(body.to || body.number || body.phone)
  const text = clean(body.mensaje || body.message || body.text)
  const instance = await getDefaultInstance(sb, clean(body.instance || body.instanceName))
  const result = await sendWhatsApp({ instance, number: to, text })
  return res.status(200).json({ ok: result.ok, sent: result.ok, result })
}

async function handleQrOrConnection(sb, body, event, instance) {
  if (event.includes('qrcode') || event.includes('qr')) {
    const qr = body?.data?.qrcode?.base64 || body?.data?.base64 || body?.data?.qr || body?.qrcode?.base64 || body?.base64 || body?.qr
    if (qr && instance) await upsertSetting(sb, `wa_qr_${instance}`, { qr, ts: Date.now() })
    return { ok: true, handled: 'qr' }
  }

  if (event.includes('connection')) {
    const state = body?.data?.state || body?.state || body?.data?.instance?.state
    if (state === 'open' && instance) await sb.from('crm_settings').delete().eq('key', `wa_qr_${instance}`)
    return { ok: true, handled: 'connection', state }
  }

  return null
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const sb = getSupabase()
    const evo = getEvolutionConfig()
    return res.status(200).json({
      status: 'ok',
      endpoint: 'api/whatsapp',
      env: {
        supabase: !!sb,
        evolutionUrl: !!evo.url,
        evolutionKey: !!evo.key,
        publicBase: clean(process.env.PUBLIC_BASE_URL || process.env.APP_URL || process.env.CRM_URL || '') || null
      }
    })
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

  const sb = getSupabase()
  if (!sb) {
    console.error('[WA] Supabase env faltante')
    return res.status(200).json({ ok: false, error: 'supabase_env_missing' })
  }

  const body = req.body || {}

  // Permite uso interno del CRM para envíos manuales/masivos: {to, mensaje}
  if ((body.to || body.number || body.phone) && (body.mensaje || body.message || body.text) && !body.event && !body.data?.key) {
    return handleDirectSend(req, res, sb, body)
  }

  const event = normalizeEvent(body)
  const rawMessages = extractMessages(body)
  const instance = normalizeInstance(body, rawMessages[0])

  console.log('[WA] webhook event:', event || '(sin event)', '| instance:', instance || '(sin instance)', '| mensajes:', rawMessages.length)

  const handled = await handleQrOrConnection(sb, body, event, instance)
  if (handled && !rawMessages.length) return res.status(200).json(handled)

  const isMessageEvent = event.includes('messages') || event.includes('message') || rawMessages.length > 0
  if (!isMessageEvent) return res.status(200).json({ ok: true, skipped: event || 'not_message' })

  const results = []

  for (const raw of rawMessages) {
    const jid = getRemoteJid(raw)
    const phone = jidToPhone(jid)
    const tel = phoneToTel(phone)
    const text = extractTextFromMessage(raw)
    const name = getPushName(raw)
    const fromMe = raw?.key?.fromMe === true || raw?.fromMe === true
    const msgId = getMessageId(raw)

    console.log('[WA] msg:', { tel, name, fromMe, hasText: !!text, msgId, jid: jid.slice(0, 40) })

    if (!phone || !tel || jid.includes('@g.us') || jid.includes('@broadcast')) {
      results.push({ ok: true, skipped: 'invalid_or_group', jid })
      continue
    }

    // No crear conversaciones vacías por eventos técnicos de Evolution.
    // Esto evita filas duplicadas con "[mensaje]" y panel sin mensajes.
    if (!text) {
      results.push({ ok: true, skipped: 'empty_message', jid, msgId })
      continue
    }

    const conv = await findOrCreateConversation(sb, { tel, phone, name, text, instance })

    if (fromMe) {
      if (text) await saveMessage(sb, conv.id, 'assistant', text, { manual: true })
      results.push({ ok: true, saved: 'fromMe', convId: conv.id })
      continue
    }

    // Evitar procesar el mismo mensaje dos veces cuando Evolution reintenta o manda eventos paralelos.
    const duplicated = await recentlySavedIncoming(sb, conv.id, text)
    if (duplicated) {
      results.push({ ok: true, convId: conv.id, skipped: 'duplicate_message', msgId })
      continue
    }

    // Guardar SIEMPRE la conversación y el mensaje entrante, aunque luego la IA esté apagada.
    await saveMessage(sb, conv.id, 'user', text)
    await ensureLead(sb, conv, { tel, phone, name, text })

    if (!text) {
      results.push({ ok: true, convId: conv.id, skipped: 'no_text' })
      continue
    }

    const ia = await readSetting(sb, 'ia_config', {}) || {}
    if (ia.activo === false) {
      results.push({ ok: true, convId: conv.id, skipped: 'ia_off' })
      continue
    }

    if (conv.mode === 'humano') {
      results.push({ ok: true, convId: conv.id, skipped: 'human_mode' })
      continue
    }

    const history = await loadHistory(sb, conv.id)
    const baseUrl = getBaseUrl(req)

    let agentData = null
    try {
      const agentRes = await fetch(`${baseUrl}/api/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          conversationHistory: history.slice(0, -1),
          iaConfig: ia,
          leadData: {
            telefono: tel,
            nombre: conv.nombre || name || '',
            lead_id: conv.lead_id || '',
            conv_id: conv.id
          }
        })
      })
      const rawAgent = await agentRes.text()
      agentData = JSON.parse(rawAgent)
    } catch (error) {
      console.error('[WA] agent error:', error.message)
      agentData = { ok: false, reply: '', action: 'escalar', error: error.message }
    }

    const reply = clean(agentData?.reply)
    const leadUpdate = agentData?.leadUpdate && typeof agentData.leadUpdate === 'object' ? agentData.leadUpdate : {}

    if (Object.keys(leadUpdate).length) {
      try { await sb.from('crm_conversations').update({ ...leadUpdate, updated_at: nowIso() }).eq('id', conv.id) } catch (_) {}
      try {
        if (conv.lead_id) await sb.from('crm_leads').update({ ...leadUpdate }).eq('id', conv.lead_id)
      } catch (_) {}
    }

    if (!reply) {
      // No mostrar mensajes internos al cliente ni en la bandeja como si fueran respuesta de Rabito.
      // Solo marcamos la conversación para revisión. El motivo queda en logs/resultados del webhook.
      try {
        await sb.from('crm_conversations').update({ status: 'requiere_revision', updated_at: nowIso() }).eq('id', conv.id)
      } catch (_) {}
      console.warn('[WA] agent_no_reply:', { convId: conv.id, tel, agentError: agentData?.error || null, trace: agentData?.trace || null })
      results.push({ ok: true, convId: conv.id, skipped: 'agent_no_reply', action: 'review_only', trace: agentData?.trace || null })
      continue
    }

    const instanceToUse = await getDefaultInstance(sb, instance || conv.instanceName || '')
    const sent = await sendWhatsApp({ instance: instanceToUse, number: phone, text: reply })
    console.log('[WA] send:', sent.status, '| conv:', conv.id)

    await saveMessage(sb, conv.id, 'assistant', reply)

    const convUpdate = {
      last_message: reply,
      updated_at: nowIso()
    }
    if (agentData?.action === 'calificado') convUpdate.status = 'calificado'
    const explicitHuman = agentData?.escalateToHuman === true || agentData?.derivarHumano === true || agentData?.human === true
    if (explicitHuman) convUpdate.mode = 'humano'

    try { await sb.from('crm_conversations').update(convUpdate).eq('id', conv.id) } catch (_) {}

    results.push({ ok: true, convId: conv.id, replied: sent.ok, sendStatus: sent.status })
  }

  return res.status(200).json({ ok: true, results })
}
