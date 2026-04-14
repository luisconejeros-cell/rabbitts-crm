// api/whatsapp.js — Webhook estable Rabbitts CRM
// Flujo simple y probado: recibir -> guardar -> generar respuesta -> enviar por Evolution -> guardar respuesta.

import { createClient } from '@supabase/supabase-js'
import { generateAgentResponse } from './agent.js'

const clean = (v = '') => String(v ?? '').trim()
const nowIso = () => new Date().toISOString()

function getSupabase() {
  const url = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const key = clean(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function eventName(body = {}) {
  return clean(body.event || body.type || body.eventName || body.action || '').toLowerCase().replace(/_/g, '.')
}

function unwrapMessage(message = {}) {
  let m = message || {}
  if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message
  if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message
  if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message
  if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message
  return m
}

function extractText(raw = {}) {
  const m = unwrapMessage(raw.message || raw.msg || raw)
  return clean(
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.title ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.templateButtonReplyMessage?.selectedDisplayText ||
    m.templateButtonReplyMessage?.selectedId ||
    m.interactiveResponseMessage?.body?.text ||
    m.reactionMessage?.text ||
    ''
  )
}

function extractMessages(body = {}) {
  const d = body.data
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.messages)) return d.messages
  if (Array.isArray(d?.message)) return d.message
  if (d?.key || d?.message || d?.remoteJid || d?.from || d?.sender) return [d]
  if (body?.key || body?.message || body?.remoteJid || body?.from || body?.sender) return [body]
  return []
}

function jidOf(raw = {}) {
  return clean(raw?.key?.remoteJid || raw?.remoteJid || raw?.jid || raw?.from || raw?.sender || raw?.data?.key?.remoteJid || '')
}
function fromMeOf(raw = {}) { return raw?.key?.fromMe === true || raw?.fromMe === true || raw?.data?.key?.fromMe === true }
function nameOf(raw = {}) { return clean(raw?.pushName || raw?.notifyName || raw?.name || raw?.senderName || raw?.data?.pushName || '') }
function phoneFromJid(jid = '') { return clean(jid).replace(/@[^@]+$/, '').replace(/:\d+$/, '').replace(/[^0-9]/g, '') }
function telOf(phone = '') { const d = phone.replace(/[^0-9]/g, ''); return d ? `+${d}` : '' }

async function readSetting(db, key, fallback = null) {
  try {
    const { data } = await db.from('crm_settings').select('value').eq('key', key).single()
    return data?.value ?? fallback
  } catch { return fallback }
}

async function upsertSetting(db, key, value) {
  try { await db.from('crm_settings').upsert({ key, value }, { onConflict: 'key' }) } catch (e) { console.error('[WA] setting error', key, e.message) }
}

async function getIaConfig(db) {
  const ia = await readSetting(db, 'ia_config', {})
  return ia && typeof ia === 'object' ? ia : {}
}

async function getEvolutionConfig(db, instanceFromEvent = '', conv = null) {
  const waNums = await readSetting(db, 'wa_numeros', [])
  const nums = Array.isArray(waNums) ? waNums : []
  const selected = nums.find(n => instanceFromEvent && n.instanceName === instanceFromEvent)
    || nums.find(n => n.activo !== false && n.instanceName)
    || nums[0]
    || {}

  const instance = clean(instanceFromEvent || conv?.instanceName || selected.instanceName || process.env.EVOLUTION_DEFAULT_INSTANCE || process.env.EVO_DEFAULT_INSTANCE)
  const url = clean(process.env.EVOLUTION_API_URL || process.env.EVO_URL || selected.evoUrl || selected.url || 'https://wa.rabbittscapital.com').replace(/\/$/, '')
  const key = clean(process.env.EVOLUTION_API_KEY || process.env.EVO_KEY || selected.evoKey || selected.apiKey || selected.apikey || 'rabbitts2024')
  return { instance, url, key }
}

async function findOrCreateConversation(db, { tel, phone, name, text, instance }) {
  const { data: existing, error } = await db.from('crm_conversations')
    .select('*')
    .eq('telefono', tel)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (error) console.error('[WA] conv select error:', error.message)
  if (existing?.[0]) {
    const conv = existing[0]
    const upd = { nombre: conv.nombre || name || tel, last_message: text || conv.last_message || '[mensaje]', updated_at: nowIso() }
    if (instance && Object.prototype.hasOwnProperty.call(conv, 'instanceName')) upd.instanceName = instance
    const { data } = await db.from('crm_conversations').update(upd).eq('id', conv.id).select().single()
    return data || { ...conv, ...upd }
  }

  const base = {
    id: phone ? `wa-${phone}` : `wa-${Date.now()}`,
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

  for (const row of attempts) {
    const { data, error: insertError } = await db.from('crm_conversations').insert(row).select().single()
    if (!insertError && data) {
      console.log('[WA] conv created:', data.id)
      return data
    }
    console.error('[WA] conv insert attempt error:', insertError?.message)
  }

  return base
}

async function saveMessage(db, convId, role, content, extra = {}) {
  const text = clean(content)
  if (!convId || !text || text.startsWith('[Sistema]')) return false
  const row = {
    conv_id: convId,
    role: role === 'assistant' ? 'assistant' : 'user',
    content: text,
    created_at: extra.created_at || nowIso()
  }
  if (extra.manual != null) row.manual = extra.manual
  const { error } = await db.from('crm_conv_messages').insert(row)
  if (error) {
    const { error: retryError } = await db.from('crm_conv_messages').insert({ conv_id: convId, role: row.role, content: text, created_at: row.created_at })
    if (retryError) {
      console.error('[WA] msg insert error:', retryError.message)
      return false
    }
  }
  return true
}

async function ensureLead(db, conv, { tel, phone, name, text }) {
  try {
    const { data } = await db.from('crm_leads').select('id').eq('telefono', tel).limit(1)
    if (data?.[0]?.id) {
      if (!conv.lead_id) await db.from('crm_conversations').update({ lead_id: data[0].id }).eq('id', conv.id)
      return data[0].id
    }
  } catch {}

  const base = {
    id: phone ? `l-wa-${phone}` : `l-wa-${Date.now()}`,
    nombre: name || tel || phone,
    telefono: tel,
    email: '',
    tag: 'lead',
    stage: 'nuevo',
    fecha: nowIso(),
    notas: text ? `Primer contacto por WhatsApp: ${text.slice(0, 250)}` : 'Primer contacto por WhatsApp'
  }
  const attempts = [{ ...base, fuente: 'whatsapp', origen: 'whatsapp' }, { ...base, fuente: 'whatsapp' }, base]
  for (const row of attempts) {
    const { data, error } = await db.from('crm_leads').insert(row).select('id').single()
    if (!error && data?.id) {
      await db.from('crm_conversations').update({ lead_id: data.id }).eq('id', conv.id)
      return data.id
    }
  }
  return null
}

async function loadHistory(db, convId) {
  const { data, error } = await db.from('crm_conv_messages')
    .select('role,content,created_at')
    .eq('conv_id', convId)
    .order('created_at', { ascending: true })
    .limit(50)
  if (error) {
    console.error('[WA] history error:', error.message)
    return []
  }
  return (data || [])
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clean(m.content), created_at: m.created_at }))
    .filter(m => m.content && !m.content.startsWith('[Sistema]'))
}

function statusAllowed(status = '', iaConfig = {}) {
  const s = clean(status).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')
  if (['activo', 'calificado', 'frio', 'no_interesado'].includes(s)) return s
  if (s === 'requiere_revision') {
    const rules = normalizeText([iaConfig.reglasDuras, iaConfig.reglasRevision, iaConfig.reglasDerivacion].map(x => typeof x === 'string' ? x : JSON.stringify(x || '')).join('\n'))
    return /requiere_revision|requiere revision|derivar a revision/.test(rules) ? s : ''
  }
  return ''
}
function normalizeText(t = '') { return clean(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') }

function extractVisibleReply(value) {
  if (!value) return ''
  if (typeof value === 'string') {
    const t = clean(value)
    if (!t.startsWith('{')) return t
    try { return clean(JSON.parse(t).reply || JSON.parse(t).message || JSON.parse(t).text || '') } catch { return t }
  }
  if (typeof value === 'object') return clean(value.reply || value.message || value.text || '')
  return ''
}

async function sendWhatsApp(db, { instance, number, text, conv }) {
  const cfg = await getEvolutionConfig(db, instance, conv)
  const cleanNumber = clean(number).replace(/[^0-9]/g, '')
  const msg = extractVisibleReply(text)

  if (!cfg.url || !cfg.key || !cfg.instance || !cleanNumber || !msg) {
    console.error('[WA] send missing:', { url: !!cfg.url, key: !!cfg.key, instance: cfg.instance || null, number: !!cleanNumber, text: !!msg })
    return { ok: false, status: 0, error: 'missing_send_config' }
  }

  const endpoint = `${cfg.url}/message/sendText/${encodeURIComponent(cfg.instance)}`
  const payload = { number: cleanNumber, text: msg, delay: 400 }
  console.log('[WA] send attempt:', endpoint, cleanNumber)
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: cfg.key },
    body: JSON.stringify(payload)
  })
  const raw = await r.text().catch(() => '')
  console.log('[WA] send status:', r.status, raw.slice(0, 180))
  return { ok: r.ok, status: r.status, raw }
}

async function processOneMessage(db, body, raw) {
  const event = eventName(body)
  const instance = clean(body.instance || body.instanceName || body.data?.instance || '')
  const jid = jidOf(raw)
  const phone = phoneFromJid(jid)
  const tel = telOf(phone)
  const text = extractText(raw)
  const name = nameOf(raw)
  const fromMe = fromMeOf(raw)

  console.log('[WA] message parsed:', { event, instance, tel, fromMe, hasText: !!text, text: text.slice(0, 80) })

  if (!tel || jid.includes('@g.us')) return { ok: true, skipped: 'no_tel_or_group' }

  const conv = await findOrCreateConversation(db, { tel, phone, name, text: text || '[mensaje]', instance })
  if (!conv?.id) return { ok: false, error: 'conv_not_created' }

  if (text) await saveMessage(db, conv.id, fromMe ? 'assistant' : 'user', text, { manual: fromMe })
  await db.from('crm_conversations').update({ last_message: text || conv.last_message || '[mensaje]', updated_at: nowIso() }).eq('id', conv.id)
  await ensureLead(db, conv, { tel, phone, name, text })

  if (fromMe) return { ok: true, saved: 'from_me', convId: conv.id }
  if (!text) return { ok: true, saved: 'no_text', convId: conv.id }
  if (conv.mode === 'humano') return { ok: true, saved: 'human_mode', convId: conv.id }

  const iaConfig = await getIaConfig(db)
  if (iaConfig.activo === false) return { ok: true, saved: 'ia_off', convId: conv.id }

  const history = await loadHistory(db, conv.id)
  const leadData = { telefono: tel, nombre: conv.nombre || name || '', email: conv.email || '', status: conv.status || '', lead_id: conv.lead_id || '' }

  console.log('[WA] calling agent:', { convId: conv.id, history: history.length })
  const agentResult = await generateAgentResponse({
    message: text,
    conversationHistory: history.slice(0, -1),
    iaConfig,
    leadData
  })

  const reply = extractVisibleReply(agentResult)
  console.log('[WA] agent reply:', { chars: reply.length, action: agentResult?.action, statusUpdate: agentResult?.statusUpdate })
  if (!reply) return { ok: true, saved: 'agent_empty', convId: conv.id }

  const send = await sendWhatsApp(db, { instance, number: phone, text: reply, conv })
  if (!send.ok) {
    console.error('[WA] send failed:', send.status, send.raw || send.error)
    return { ok: true, saved: 'reply_not_sent', convId: conv.id, sendStatus: send.status }
  }

  await saveMessage(db, conv.id, 'assistant', reply)

  const upd = { last_message: reply, updated_at: nowIso() }
  const status = statusAllowed(agentResult?.statusUpdate || agentResult?.action, iaConfig)
  if (status) upd.status = status
  if (agentResult?.leadUpdate && typeof agentResult.leadUpdate === 'object') Object.assign(upd, agentResult.leadUpdate)
  await db.from('crm_conversations').update(upd).eq('id', conv.id)

  console.log('[WA] done:', { tel, convId: conv.id })
  return { ok: true, replied: true, convId: conv.id }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      env: {
        supabase: !!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
        supabaseKey: !!(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY),
        anthropic: !!(process.env.ANTHROPIC_KEY || process.env.VITE_ANTHROPIC_KEY || process.env.CLAUDE_API_KEY),
        evolutionUrl: !!(process.env.EVOLUTION_API_URL || process.env.EVO_URL),
        evolutionKey: !!(process.env.EVOLUTION_API_KEY || process.env.EVO_KEY)
      }
    })
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method_not_allowed' })
  const db = getSupabase()
  if (!db) {
    console.error('[WA] missing Supabase env')
    return res.status(200).json({ ok: false, error: 'missing_supabase_env' })
  }

  const body = req.body || {}
  const event = eventName(body)
  const instance = clean(body.instance || body.instanceName || body.data?.instance || '')
  console.log('[WA] webhook:', { event, instance })

  try {
    if (event.includes('qrcode') || event.includes('qr')) {
      const qr = body?.data?.qrcode?.base64 || body?.data?.base64 || body?.data?.qr || body?.qrcode
      if (qr) await upsertSetting(db, `wa_qr_${instance}`, { qr, ts: Date.now() })
      return res.status(200).json({ ok: true, event })
    }

    if (event.includes('connection')) {
      if (body?.data?.state === 'open' || body?.state === 'open') {
        try { await db.from('crm_settings').delete().eq('key', `wa_qr_${instance}`) } catch {}
      }
      return res.status(200).json({ ok: true, event })
    }

    const msgs = extractMessages(body)
    if (!msgs.length || (event && !event.includes('message'))) {
      return res.status(200).json({ ok: true, skipped: event || 'no_message_event' })
    }

    const results = []
    for (const raw of msgs.slice(0, 5)) results.push(await processOneMessage(db, body, raw))
    return res.status(200).json({ ok: true, results })
  } catch (e) {
    console.error('[WA] fatal:', e.message, e.stack)
    return res.status(200).json({ ok: false, error: e.message })
  }
}
