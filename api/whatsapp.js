// api/whatsapp.js — Webhook WhatsApp estable v6
// Prioridad: guardar SIEMPRE conversación/mensaje y responder sin cambiar automáticamente a revisión/humano.

import { createClient } from '@supabase/supabase-js'
import { generateAgentResponse } from './agent.js'

const clean = (v = '') => String(v ?? '').trim()
const nowIso = () => new Date().toISOString()
const makeId = (p = 'id') => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

function sb() {
  const url = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const key = clean(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null
}

function eventName(b = {}) {
  return clean(b.event || b.type || b.eventName || b.action || '').toLowerCase().replace(/_/g, '.')
}

function unwrap(o = {}) {
  let m = o?.message || o?.msg || o
  if (m?.ephemeralMessage?.message) m = m.ephemeralMessage.message
  if (m?.viewOnceMessage?.message) m = m.viewOnceMessage.message
  if (m?.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message
  if (m?.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message
  return m || {}
}

function textOf(o = {}) {
  const m = unwrap(o)
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

function jidOf(o = {}) {
  return clean(o?.key?.remoteJid || o?.remoteJid || o?.jid || o?.from || o?.sender || o?.participant || o?.data?.key?.remoteJid || '')
}
function phoneOf(jid = '') { return clean(jid).replace(/@[^@]+$/, '').replace(/:\d+$/, '').replace(/[^0-9]/g, '') }
function telOf(phone = '') { const d = clean(phone).replace(/[^0-9]/g, ''); return d ? `+${d}` : '' }
function nameOf(o = {}) { return clean(o?.pushName || o?.notifyName || o?.name || o?.senderName || o?.data?.pushName || '') }
function msgId(o = {}) { return clean(o?.key?.id || o?.id || o?.messageId || o?.data?.key?.id || '') }
function fromMeOf(o = {}) { return o?.key?.fromMe === true || o?.fromMe === true || o?.data?.key?.fromMe === true }

function messages(b = {}) {
  const d = b.data
  const out = []
  if (Array.isArray(d)) out.push(...d)
  else if (Array.isArray(d?.messages)) out.push(...d.messages)
  else if (Array.isArray(d?.message)) out.push(...d.message)
  else if (d?.key || d?.message || d?.remoteJid || d?.sender || d?.from) out.push(d)
  else if (b?.key || b?.message || b?.remoteJid || b?.sender || b?.from) out.push(b)
  return out.filter(Boolean)
}

async function readSetting(db, key, fallback = null) {
  try { const { data } = await db.from('crm_settings').select('value').eq('key', key).single(); return data?.value ?? fallback } catch { return fallback }
}
async function upsertSetting(db, key, value) {
  try { await db.from('crm_settings').upsert({ key, value }, { onConflict: 'key' }) } catch (e) { console.error('[WA] setting upsert error:', key, e?.message) }
}

async function findOrCreateConv(db, { tel, phone, name, text }) {
  let conv = null
  try {
    const { data, error } = await db.from('crm_conversations').select('*').eq('telefono', tel).order('updated_at', { ascending: false }).limit(1)
    if (error) console.error('[WA] select conv error:', error.message)
    conv = data?.[0] || null
  } catch (e) { console.error('[WA] select conv exception:', e.message) }

  if (conv) {
    try {
      await db.from('crm_conversations').update({
        nombre: conv.nombre || name || tel,
        last_message: text || conv.last_message || '[mensaje]',
        updated_at: nowIso()
      }).eq('id', conv.id)
    } catch (e) { console.error('[WA] update conv exception:', e.message) }
    return conv
  }

  const newConv = {
    id: makeId('wa'),
    telefono: tel,
    nombre: name || tel || phone,
    mode: 'ia',
    status: 'activo',
    last_message: text || '[mensaje]',
    lead_id: null,
    created_at: nowIso(),
    updated_at: nowIso()
  }

  try {
    const { data, error } = await db.from('crm_conversations').insert(newConv).select().single()
    if (error) {
      console.error('[WA] insert conv error:', error.message, error.code, error.details)
      return newConv
    }
    console.log('[WA] conv nueva:', data.id)
    return data
  } catch (e) {
    console.error('[WA] insert conv exception:', e.message)
    return newConv
  }
}

async function saveMsg(db, convId, role, content, extra = {}) {
  const msg = clean(content)
  if (!convId || !msg || msg.startsWith('[Sistema]')) return false
  const row = {
    conv_id: convId,
    role: role === 'assistant' ? 'assistant' : 'user',
    content: msg,
    created_at: extra.created_at || nowIso()
  }
  try {
    const { error } = await db.from('crm_conv_messages').insert(row)
    if (error) console.error('[WA] insert msg error:', error.message, error.code)
    return !error
  } catch (e) {
    console.error('[WA] insert msg exception:', e.message)
    return false
  }
}

async function duplicate(db, convId, content) {
  const since = new Date(Date.now() - 45000).toISOString()
  try {
    const { data, error } = await db.from('crm_conv_messages')
      .select('id')
      .eq('conv_id', convId)
      .eq('role', 'user')
      .eq('content', content)
      .gte('created_at', since)
      .limit(1)
    return !error && data?.length > 0
  } catch { return false }
}

async function ensureLead(db, conv, { tel, phone, name, text }) {
  try {
    const { data } = await db.from('crm_leads').select('*').eq('telefono', tel).limit(1)
    if (data?.length) {
      if (conv?.id && !conv.lead_id) await db.from('crm_conversations').update({ lead_id: data[0].id }).eq('id', conv.id)
      return data[0]
    }
  } catch {}
  const lead = {
    id: makeId('l-wa'),
    nombre: name || tel || phone,
    telefono: tel,
    email: '',
    tag: 'lead',
    stage: 'nuevo',
    fecha: nowIso(),
    notas: text ? `Primer contacto por WhatsApp: ${text.slice(0, 250)}` : 'Primer contacto por WhatsApp',
    fuente: 'whatsapp'
  }
  try {
    const { data, error } = await db.from('crm_leads').insert(lead).select().single()
    if (!error && data) {
      if (conv?.id) await db.from('crm_conversations').update({ lead_id: data.id }).eq('id', conv.id)
      return data
    }
    if (error) console.error('[WA] insert lead error:', error.message)
  } catch (e) { console.error('[WA] insert lead exception:', e.message) }
  return null
}

async function loadHistory(db, convId) {
  try {
    const { data } = await db.from('crm_conv_messages').select('role,content,created_at').eq('conv_id', convId).order('created_at', { ascending: true }).limit(40)
    return (data || []).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clean(m.content), created_at: m.created_at })).filter(m => m.content && !m.content.startsWith('[Sistema]'))
  } catch { return [] }
}

async function defaultInstance(db, fallback = '') {
  if (fallback) return fallback
  const nums = await readSetting(db, 'wa_numeros', [])
  if (Array.isArray(nums)) {
    const n = nums.find(x => x.activo !== false && x.instanceName) || nums.find(x => x.instanceName)
    if (n?.instanceName) return n.instanceName
  }
  return clean(process.env.EVOLUTION_DEFAULT_INSTANCE || process.env.EVO_DEFAULT_INSTANCE || '')
}

async function sendWa({ instance, number, text }) {
  const url = clean(process.env.EVOLUTION_API_URL || process.env.EVO_URL || 'https://wa.rabbittscapital.com').replace(/\/$/, '')
  const key = clean(process.env.EVOLUTION_API_KEY || process.env.EVO_KEY || '')
  if (!url || !key || !instance || !number || !text) {
    console.error('[WA] send missing:', { hasUrl: !!url, hasKey: !!key, instance, number: !!number, text: !!text })
    return { ok: false, error: 'missing_evolution_env_or_payload' }
  }
  try {
    const r = await fetch(`${url}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({ number: clean(number).replace(/[^0-9]/g, ''), text, delay: Number(process.env.EVOLUTION_SEND_DELAY || 350) })
    })
    const body = await r.text().catch(() => '')
    if (!r.ok) console.error('[WA] send error:', r.status, body.slice(0, 300))
    return { ok: r.ok, status: r.status, body: body.slice(0, 300) }
  } catch (e) {
    console.error('[WA] send exception:', e.message)
    return { ok: false, error: e.message }
  }
}

async function direct(res, db, b) {
  const to = clean(b.to || b.number || b.phone)
  const text = clean(b.mensaje || b.message || b.text)
  const inst = await defaultInstance(db, clean(b.instance || b.instanceName))
  const result = await sendWa({ instance: inst, number: to, text })
  return res.status(200).json({ ok: result.ok, sent: result.ok, result })
}

async function handleQrOrConnection(db, b, event, instance) {
  if (event.includes('qrcode') || event.includes('qr')) {
    const qr = b?.data?.qrcode?.base64 || b?.data?.base64 || b?.data?.qr || b?.qrcode?.base64 || b?.base64 || b?.qr
    if (qr && instance) await upsertSetting(db, `wa_qr_${instance}`, { qr, ts: Date.now() })
    return { ok: true, handled: 'qr' }
  }
  if (event.includes('connection')) {
    const state = b?.data?.state || b?.state || b?.data?.instance?.state
    if (state === 'open' && instance) { try { await db.from('crm_settings').delete().eq('key', `wa_qr_${instance}`) } catch {} }
    return { ok: true, handled: 'connection', state }
  }
  return null
}

function normStatus(v = '') {
  const s = String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, '_')
  return ['activo','calificado','frio','no_interesado','requiere_revision'].includes(s) ? s : ''
}

async function answer(db, { conv, tel, phone, instance, text }) {
  const ia = await readSetting(db, 'ia_config', {}) || {}
  if (ia.activo === false || conv.mode === 'humano') return { ok: true, skipped: ia.activo === false ? 'ia_off' : 'human_mode' }

  const history = await loadHistory(db, conv.id)
  const result = await generateAgentResponse({
    message: text,
    conversationHistory: history.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
    iaConfig: ia,
    leadData: {
      telefono: conv.telefono || tel || '',
      nombre: conv.nombre || '',
      lead_id: conv.lead_id || '',
      conv_id: conv.id || '',
      status: conv.status || '',
      mode: conv.mode || ''
    }
  }, { db })

  const reply = clean(result.reply)
  if (!reply) {
    console.error('[WA] agent empty:', result.error || '', result.trace || {})
    return { ok: true, skipped: 'empty_reply', error: result.error || '' }
  }

  const inst = await defaultInstance(db, instance)
  const sent = await sendWa({ instance: inst, number: phone || tel, text: reply })
  await saveMsg(db, conv.id, 'assistant', reply)

  const upd = { last_message: reply, updated_at: nowIso() }
  const allowedByHardRules = result?.trace?.derivationAllowedByHardRules === true
  const requestedStatus = normStatus(result.statusUpdate || '')
  if (allowedByHardRules && requestedStatus) upd.status = requestedStatus
  if (result.action === 'calificado') upd.status = 'calificado'
  if (allowedByHardRules && result.escalateToHuman === true) upd.mode = 'humano'
  try { await db.from('crm_conversations').update(upd).eq('id', conv.id) } catch (e) { console.error('[WA] update after reply:', e.message) }

  return { ok: true, replied: sent.ok, sendStatus: sent.status || 0, error: sent.error || '' }
}

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, endpoint: 'api/whatsapp', mode: 'stable-v6' })
  if (req.method !== 'POST') return res.status(405).json({ ok: false })

  const db = sb()
  if (!db) return res.status(200).json({ ok: false, error: 'supabase_env_missing' })
  const b = req.body || {}
  if ((b.to || b.number || b.phone) && (b.mensaje || b.message || b.text) && !b.event && !b.data?.key) return direct(res, db, b)

  const event = eventName(b)
  const rawMessages = messages(b)
  const instance = clean(b.instance || b.instanceName || b.instance_name || b.data?.instance || b.data?.instanceName || rawMessages[0]?.instance || rawMessages[0]?.instanceName || '')
  console.log('[WA] event:', event || '(no-event)', '| inst:', instance || '(no-inst)', '| msgs:', rawMessages.length)

  const handled = await handleQrOrConnection(db, b, event, instance)
  if (handled && !rawMessages.length) return res.status(200).json(handled)
  if (!(event.includes('message') || rawMessages.length)) return res.status(200).json({ ok: true, skipped: event || 'not_message' })

  const results = []
  for (const m of rawMessages) {
    const jid = jidOf(m)
    const phone = phoneOf(jid)
    const tel = telOf(phone)
    const text = textOf(m)
    const name = nameOf(m)
    const fromMe = fromMeOf(m)
    const id = msgId(m)

    console.log('[WA] inbound:', { tel, fromMe, hasText: !!text, id: id || '(no-id)' })

    if (!phone || !tel || jid.includes('@g.us') || jid.includes('@broadcast')) { results.push({ ok:true, skipped:'invalid_or_group' }); continue }
    if (!text) { results.push({ ok:true, skipped:'empty_message' }); continue }

    const conv = await findOrCreateConv(db, { tel, phone, name, text })

    if (fromMe) {
      await saveMsg(db, conv.id, 'assistant', text)
      try { await db.from('crm_conversations').update({ last_message: text, updated_at: nowIso() }).eq('id', conv.id) } catch {}
      results.push({ ok: true, saved: 'fromMe', convId: conv.id })
      continue
    }

    if (await duplicate(db, conv.id, text)) { results.push({ ok:true, skipped:'duplicate', convId: conv.id }); continue }
    await saveMsg(db, conv.id, 'user', text)
    await ensureLead(db, conv, { tel, phone, name, text })

    const result = await answer(db, { conv, tel, phone, instance, text })
    results.push({ ok:true, worker: result, convId: conv.id })
  }

  return res.status(200).json({ ok: true, processed: true, results })
}
