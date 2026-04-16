// api/whatsapp.js — Webhook WhatsApp estable v9
// Flujo confiable: recibir -> guardar conversación -> generar respuesta -> enviar por Evolution -> guardar respuesta SOLO si se envió.

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
    m.audioMessage?.caption ||
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

function collectJids(value, out = []) {
  if (!value || out.length > 80) return out
  if (typeof value === 'string') {
    if (/@(s\.whatsapp\.net|c\.us|lid|g\.us|broadcast)\b/i.test(value)) out.push(clean(value))
    return out
  }
  if (Array.isArray(value)) {
    for (const item of value) collectJids(item, out)
    return out
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (/remoteJid|participant|sender|from|jid|author|recipient|chatId|user/i.test(k)) collectJids(v, out)
    }
  }
  return out
}

function hasLidMarker(value, depth = 0) {
  if (!value || depth > 7) return false
  if (typeof value === 'string') return /@lid\b|\blid\b/i.test(value)
  if (Array.isArray(value)) return value.some(v => hasLidMarker(v, depth + 1))
  if (typeof value === 'object') return Object.entries(value).some(([k, v]) => /lid/i.test(k) || hasLidMarker(v, depth + 1))
  return false
}

function collectPhoneCandidates(value, out = [], path = '') {
  if (!value || out.length > 80) return out
  if (typeof value === 'string') {
    const raw = value
    const jidMatch = raw.match(/(\d{8,15})@(s\.whatsapp\.net|c\.us)/i)
    if (jidMatch) out.push(jidMatch[1])
    if (/phone|number|senderpn|participantpn|remotejidalt|participantalt|from|sender|wa_id|wid/i.test(path)) {
      for (const m of raw.matchAll(/\+?\d[\d\s().-]{7,}\d/g)) {
        const d = m[0].replace(/\D/g, '')
        if (d.length >= 8 && d.length <= 15) out.push(d)
      }
    }
    return out
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPhoneCandidates(item, out, path)
    return out
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collectPhoneCandidates(v, out, path ? `${path}.${k}` : k)
  }
  return out
}

function pickRealPhone(obj, fallback = '') {
  const candidates = [...new Set([fallback, ...collectPhoneCandidates(obj)].map(x => clean(x).replace(/\D/g, '')).filter(x => x.length >= 8 && x.length <= 15))]
  // Chile primero porque este CRM opera principalmente con números +56; si Evolution entrega LID +386 y también PN +56, usamos PN.
  return candidates.find(x => x.startsWith('56')) || candidates.find(x => !x.startsWith('386')) || candidates[0] || ''
}

function jidOf(o = {}) {
  const direct = [
    o?.key?.remoteJid,
    o?.remoteJid,
    o?.jid,
    o?.from,
    o?.sender,
    o?.participant,
    o?.data?.key?.remoteJid,
    o?.data?.remoteJid,
    o?.data?.sender,
    o?.data?.from,
    o?.data?.participant
  ].map(clean).filter(Boolean)
  const all = [...direct, ...collectJids(o)]
  const unique = [...new Set(all)]
  return unique.find(j => /@(s\.whatsapp\.net|c\.us)$/i.test(j)) || unique.find(j => /@lid$/i.test(j)) || unique[0] || ''
}

function phoneOf(jid = '') {
  const j = clean(jid)
  if (!j || /@lid$/i.test(j)) return ''
  return j.replace(/@[^@]+$/, '').replace(/:\d+$/, '').replace(/[^0-9]/g, '')
}

function lidOf(jid = '') {
  const j = clean(jid)
  return /@lid$/i.test(j) ? j.replace(/@lid$/i, '').replace(/[^0-9]/g, '') : ''
}

function telOf(phone = '', lid = '') {
  const d = clean(phone).replace(/[^0-9]/g, '')
  if (d) return '+' + d
  const l = clean(lid).replace(/[^0-9]/g, '')
  return l ? 'wa-lid-' + l : ''
}

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

async function getWaNumbers(db) {
  const nums = await readSetting(db, 'wa_numeros', [])
  return Array.isArray(nums) ? nums : []
}

async function getInstanceConfig(db, fallbackInstance = '') {
  const nums = await getWaNumbers(db)
  const chosen = nums.find(x => fallbackInstance && x.instanceName === fallbackInstance)
    || nums.find(x => x.activo !== false && x.instanceName)
    || nums.find(x => x.instanceName)
    || {}

  const instance = clean(fallbackInstance || chosen.instanceName || process.env.EVOLUTION_DEFAULT_INSTANCE || process.env.EVO_DEFAULT_INSTANCE || '')
  const url = clean(process.env.EVOLUTION_API_URL || process.env.EVO_URL || chosen.evoUrl || chosen.url || 'https://wa.rabbittscapital.com').replace(/\/$/, '')
  const key = clean(
    process.env.EVOLUTION_API_KEY ||
    process.env.EVO_KEY ||
    chosen.evoKey ||
    chosen.apiKey ||
    chosen.apikey ||
    // Compatibilidad con la configuración antigua del CRM. Idealmente mover a variables de entorno en Vercel.
    'rabbitts2024'
  )
  return { instance, url, key }
}

async function findOrCreateConv(db, { tel, phone, lid, name, text, instance }) {
  let conv = null
  try {
    const { data, error } = await db.from('crm_conversations')
      .select('*')
      .eq('telefono', tel)
      .order('updated_at', { ascending: false })
      .limit(1)
    if (error) console.error('[WA] select conv error:', error.message)
    conv = data?.[0] || null
  } catch (e) { console.error('[WA] select conv exception:', e.message) }

  if (conv) {
    const upd = {
      nombre: conv.nombre || name || tel,
      last_message: text || conv.last_message || '[mensaje]',
      updated_at: nowIso()
    }
    if (instance && Object.prototype.hasOwnProperty.call(conv, 'instanceName')) upd.instanceName = instance
    try {
      const { data } = await db.from('crm_conversations').update(upd).eq('id', conv.id).select().single()
      return data || { ...conv, ...upd }
    } catch (e) {
      console.error('[WA] update conv exception:', e.message)
      return { ...conv, ...upd }
    }
  }

  const base = {
    id: phone ? `wa-${phone}` : (lid ? `wa-lid-${lid}` : makeId('wa')),
    telefono: tel,
    nombre: name || (tel && tel.startsWith('wa-lid-') ? 'WhatsApp sin número visible' : tel) || phone,
    mode: 'ia',
    status: 'activo',
    last_message: text || '[mensaje]',
    lead_id: null,
    created_at: nowIso(),
    updated_at: nowIso()
  }

  const attempts = [
    { ...base, origen: 'whatsapp' },
    base
  ]
  for (const row of attempts) {
    try {
      const { data, error } = await db.from('crm_conversations').insert(row).select().single()
      if (!error && data) {
        console.log('[WA] conv created:', data.id)
        return data
      }
      if (error) console.error('[WA] insert conv attempt error:', error.message)
    } catch {}
  }
  return base
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

async function duplicate(db, convId, content, role = 'user') {
  const since = new Date(Date.now() - 90000).toISOString()
  try {
    const { data, error } = await db.from('crm_conv_messages')
      .select('id')
      .eq('conv_id', convId)
      .eq('role', role)
      .eq('content', content)
      .gte('created_at', since)
      .limit(1)
    return !error && data?.length > 0
  } catch { return false }
}

async function ensureLead(db, conv, { tel, phone, lid, name, text }) {
  try {
    const { data } = await db.from('crm_leads').select('*').eq('telefono', tel).limit(1)
    if (data?.length) {
      if (conv?.id && !conv.lead_id) await db.from('crm_conversations').update({ lead_id: data[0].id }).eq('id', conv.id)
      return data[0]
    }
  } catch {}

  const base = {
    id: phone ? `l-wa-${phone}` : (lid ? `l-wa-lid-${lid}` : makeId('l-wa')),
    nombre: name || (tel && tel.startsWith('wa-lid-') ? 'WhatsApp sin número visible' : tel) || phone,
    telefono: tel,
    email: '',
    tag: 'lead',
    stage: 'nuevo',
    fecha: nowIso(),
    notas: text ? `Primer contacto por WhatsApp: ${text.slice(0, 250)}` : 'Primer contacto por WhatsApp'
  }
  const attempts = [{ ...base, fuente: 'whatsapp', origen: 'whatsapp' }, { ...base, fuente: 'whatsapp' }, base]
  for (const row of attempts) {
    try {
      const { data, error } = await db.from('crm_leads').insert(row).select().single()
      if (!error && data) {
        if (conv?.id) await db.from('crm_conversations').update({ lead_id: data.id }).eq('id', conv.id)
        return data
      }
    } catch {}
  }
  return null
}

async function loadHistory(db, convId) {
  try {
    const { data } = await db.from('crm_conv_messages')
      .select('role,content,created_at')
      .eq('conv_id', convId)
      .order('created_at', { ascending: true })
      .limit(60)
    return (data || [])
      .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clean(m.content), created_at: m.created_at }))
      .filter(m => m.content && !m.content.startsWith('[Sistema]'))
  } catch { return [] }
}

function normStatus(v = '') {
  const s = clean(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_')
  return ['activo','calificado','frio','no_interesado','requiere_revision'].includes(s) ? s : ''
}

async function sendWa(db, { instance: instanceFallback, number, text }) {
  const cfg = await getInstanceConfig(db, instanceFallback)
  const instance = cfg.instance
  const url = cfg.url
  const key = cfg.key
  const cleanNumber = clean(number).replace(/[^0-9]/g, '')
  const msg = clean(text)

  if (!url || !key || !instance || !cleanNumber || !msg) {
    console.error('[WA] send missing:', { hasUrl: !!url, hasKey: !!key, instance: instance || null, hasNumber: !!cleanNumber, hasText: !!msg })
    return { ok: false, error: 'missing_evolution_config_or_payload' }
  }

  const endpoint = `${url}/message/sendText/${encodeURIComponent(instance)}`
  const headers = { 'Content-Type': 'application/json', apikey: key }
  const payloads = [
    { number: cleanNumber, text: msg, delay: Number(process.env.EVOLUTION_SEND_DELAY || 250) },
    { number: cleanNumber, textMessage: { text: msg }, delay: Number(process.env.EVOLUTION_SEND_DELAY || 250) }
  ]

  let last = null
  for (const body of payloads) {
    try {
      const r = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) })
      const txt = await r.text().catch(() => '')
      last = { ok: r.ok, status: r.status, body: txt.slice(0, 500) }
      if (r.ok) {
        console.log('[WA] send ok:', { instance, number: cleanNumber.slice(-6), status: r.status })
        return last
      }
      console.error('[WA] send attempt failed:', { status: r.status, body: txt.slice(0, 300) })
    } catch (e) {
      last = { ok: false, error: e.message }
      console.error('[WA] send exception:', e.message)
    }
  }
  return last || { ok: false, error: 'send_failed' }
}

async function direct(res, db, b) {
  const to = clean(b.to || b.number || b.phone)
  const text = clean(b.mensaje || b.message || b.text)
  const result = await sendWa(db, { instance: clean(b.instance || b.instanceName), number: to, text })
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

async function answer(db, { conv, tel, phone, lid, instance, text }) {
  const ia = await readSetting(db, 'ia_config', {}) || {}
  if (ia.activo === false || conv.mode === 'humano') return { ok: true, skipped: ia.activo === false ? 'ia_off' : 'human_mode' }

  const history = await loadHistory(db, conv.id)
  console.log('[WA] calling agent:', { convId: conv.id, history: history.length })
  const result = await generateAgentResponse({
    message: text,
    conversationHistory: history,
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
  console.log('[WA] agent result:', { ok: result.ok, hasReply: !!reply, error: result.error || '', trace: result.trace || {} })
  if (!reply) return { ok: true, skipped: 'empty_reply', error: result.error || '' }

  if (await duplicate(db, conv.id, reply, 'assistant')) return { ok: true, skipped: 'duplicate_assistant_reply' }

  const sent = await sendWa(db, { instance, number: phone || lid, text: reply })

  // Para no mentir en el panel: si Evolution no confirma envío, NO guardamos el mensaje como enviado.
  if (!sent.ok) {
    console.error('[WA] reply generated but send failed:', sent)
    try { await db.from('crm_conversations').update({ updated_at: nowIso() }).eq('id', conv.id) } catch {}
    return { ok: true, replied: false, sendFailed: true, sendStatus: sent.status || 0, error: sent.error || sent.body || '' }
  }

  await saveMsg(db, conv.id, 'assistant', reply)

  const upd = { last_message: reply, updated_at: nowIso() }
  const allowedByHardRules = result?.trace?.derivationAllowedByHardRules === true
  const requestedStatus = normStatus(result.statusUpdate || '')
  if (allowedByHardRules && requestedStatus) upd.status = requestedStatus
  if (result.action === 'calificado') upd.status = 'calificado'
  if (allowedByHardRules && result.escalateToHuman === true) upd.mode = 'humano'

  try { await db.from('crm_conversations').update(upd).eq('id', conv.id) } catch (e) { console.error('[WA] update after reply:', e.message) }
  // Auto-crear leads para calificados sin agendar
  autoCreateLeads(db).catch(() => {})
  return { ok: true, replied: true, sendStatus: sent.status || 0 }
}


// Auto-crear leads para convs calificadas hace 2+ horas sin lead_id
async function autoCreateLeads(db) {
  try {
    const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const { data: pending } = await db.from('crm_conversations')
      .select('*').eq('status', 'calificado').is('lead_id', null).lt('updated_at', cutoff).limit(5)
    if (!pending?.length) return
    for (const conv of pending) {
      const { data: existing } = await db.from('crm_leads').select('id').eq('telefono', conv.telefono).limit(1)
      if (existing?.length) {
        await db.from('crm_conversations').update({ lead_id: existing[0].id }).eq('id', conv.id)
        continue
      }
      const now = new Date().toISOString()
      const newLead = {
        id: 'l-auto-' + Date.now() + '-' + conv.id.slice(-4),
        nombre: conv.nombre || conv.telefono, telefono: conv.telefono || '', email: '—', renta: '—',
        calificacion: '—', resumen: `Auto-creado desde WhatsApp. Último mensaje: ${(conv.last_message||'').slice(0,100)}`,
        tag: 'lead', stage: 'nuevo', origen: 'whatsapp_auto', fecha: now, stage_moved_at: now,
        creado_por: 'rabito', comments: [], stage_history: [{ stage: 'nuevo', date: now }]
      }
      const { data: lead, error } = await db.from('crm_leads').upsert(newLead).select().single()
      if (!error && lead) {
        await db.from('crm_conversations').update({ lead_id: lead.id }).eq('id', conv.id)
        console.log('[WA] Auto-lead:', conv.telefono, lead.id)
      }
    }
  } catch(e) { console.warn('[WA] autoCreateLeads error:', e.message) }
}

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, endpoint: 'api/whatsapp', mode: 'stable-v9-direct' })
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
    let lid = lidOf(jid)
    let phone = phoneOf(jid)
    const lidMarker = hasLidMarker(m)
    const pickedPhone = pickRealPhone(m, phone)
    if (pickedPhone && (!phone || phone.startsWith('386') || pickedPhone.startsWith('56'))) phone = pickedPhone
    // WhatsApp LID: Evolution/Baileys puede enviar identificadores internos que parecen +386...
    // No los mostramos como teléfono real; los guardamos como wa-lid-* para evitar clientes falsos de Eslovenia.
    if (phone && phone.startsWith('386') && (lidMarker || !pickedPhone || pickedPhone === phone)) {
      lid = lid || phone
      phone = ''
    }
    const tel = telOf(phone, lid)
    const text = textOf(m)
    const name = nameOf(m)
    const fromMe = fromMeOf(m)
    const id = msgId(m)

    console.log('[WA] inbound:', { tel, phone: phone ? phone.slice(-6) : '', hasLid: !!lid, lidMarker, jidType: jid.includes('@lid') ? 'lid' : 'phone', fromMe, hasText: !!text, id: id || '(no-id)' })

    if (!tel || jid.includes('@g.us') || jid.includes('@broadcast')) { results.push({ ok:true, skipped:'invalid_or_group' }); continue }
    if (!text) { results.push({ ok:true, skipped:'empty_message' }); continue }

    const conv = await findOrCreateConv(db, { tel, phone, lid, name, text, instance })

    if (fromMe) {
      await saveMsg(db, conv.id, 'assistant', text)
      try { await db.from('crm_conversations').update({ last_message: text, updated_at: nowIso() }).eq('id', conv.id) } catch {}
      results.push({ ok: true, saved: 'fromMe', convId: conv.id })
      continue
    }

    if (await duplicate(db, conv.id, text, 'user')) { results.push({ ok:true, skipped:'duplicate', convId: conv.id }); continue }
    await saveMsg(db, conv.id, 'user', text)
    await ensureLead(db, conv, { tel, phone, lid, name, text })

    const result = await answer(db, { conv, tel, phone, lid, instance, text })
    results.push({ ok:true, result, convId: conv.id })
  }

  return res.status(200).json({ ok: true, processed: true, results })
}
