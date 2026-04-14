// api/agent-worker.js — Procesador directo de respuestas WhatsApp
// Exporta processConversation() para que api/whatsapp.js lo ejecute sin fetch interno.

import { createClient } from '@supabase/supabase-js'
import { generateAgentResponse } from './agent.js'

const clean = (v = '') => String(v ?? '').trim()
const nowIso = () => new Date().toISOString()
const sleep = ms => new Promise(r => setTimeout(r, ms))

function sb() {
  const url = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const key = clean(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null
}

async function setting(db, key, fallback = null) {
  try { const { data } = await db.from('crm_settings').select('value').eq('key', key).single(); return data?.value ?? fallback } catch { return fallback }
}
async function upsertSetting(db, key, value) { try { await db.from('crm_settings').upsert({ key, value }, { onConflict: 'key' }) } catch {} }
async function deleteSetting(db, key) { try { await db.from('crm_settings').delete().eq('key', key) } catch {} }

async function acquireLock(db, convId) {
  const key = `agent_lock_${convId}`
  const current = await setting(db, key, null)
  if (current?.until && Number(current.until) > Date.now()) return false
  const value = { token: Math.random().toString(36).slice(2), until: Date.now() + Number(process.env.AGENT_LOCK_MS || 30000) }
  await upsertSetting(db, key, value)
  await sleep(50)
  const check = await setting(db, key, null)
  return check?.token === value.token
}

async function loadConv(db, convId) {
  try { const { data } = await db.from('crm_conversations').select('*').eq('id', convId).single(); return data || null } catch { return null }
}

async function loadHistory(db, convId) {
  try {
    const { data } = await db.from('crm_conv_messages').select('role,content,created_at').eq('conv_id', convId).order('created_at', { ascending: true }).limit(80)
    return (data || []).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clean(m.content), created_at: m.created_at })).filter(m => m.content && !m.content.startsWith('[Sistema]'))
  } catch { return [] }
}

function pendingText(history = []) {
  const items = Array.isArray(history) ? history : []
  let lastAssistant = -1
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].role === 'assistant') { lastAssistant = i; break }
  }
  const pending = items.slice(lastAssistant + 1).filter(m => m.role === 'user' && clean(m.content))
  if (!pending.length) return ''
  return pending.slice(-6).map(m => clean(m.content)).join('\n')
}

async function saveMsg(db, convId, role, content) {
  if (!convId || !content) return false
  try {
    const { error } = await db.from('crm_conv_messages').insert({ conv_id: convId, role, content: clean(content), created_at: nowIso() })
    return !error
  } catch { return false }
}

async function updateConv(db, convId, patch) {
  try { await db.from('crm_conversations').update({ ...patch, updated_at: nowIso() }).eq('id', convId) } catch {}
}

async function defaultInstance(db, fallback = '') {
  if (fallback) return fallback
  const nums = await setting(db, 'wa_numeros', [])
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
    console.error('[agent-worker] sendWa missing', { hasUrl: !!url, hasKey: !!key, instance, hasNumber: !!number, hasText: !!text })
    return { ok: false, status: 0, error: 'missing_evolution_env_or_payload' }
  }
  try {
    const r = await fetch(`${url}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({ number: clean(number).replace(/[^0-9]/g, ''), text, delay: Number(process.env.EVOLUTION_SEND_DELAY || 250) })
    })
    const body = await r.text().catch(() => '')
    if (!r.ok) console.error('[agent-worker] sendWa failed', r.status, body.slice(0, 300))
    return { ok: r.ok, status: r.status, body: body.slice(0, 400) }
  } catch (e) {
    console.error('[agent-worker] sendWa exception', e.message)
    return { ok: false, status: 0, error: e.message }
  }
}

function normStatus(v = '') {
  const s = String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, '_')
  return ['activo','calificado','frio','no_interesado','requiere_revision'].includes(s) ? s : ''
}

export async function processConversation(payload = {}, opts = {}) {
  const db = opts.db || sb()
  if (!db) return { ok: false, error: 'supabase_env_missing' }
  const convId = clean(payload.convId)
  if (!convId) return { ok: false, error: 'missing_convId' }
  console.log('[agent-worker] start', { convId, phone: payload.phone, instance: payload.instance })

  const lockKey = `agent_lock_${convId}`
  const locked = await acquireLock(db, convId)
  if (!locked) {
    console.log('[agent-worker] locked', convId)
    return { ok: true, skipped: 'locked' }
  }

  try {
    await sleep(Number(process.env.AGENT_BATCH_DELAY_MS || 700))
    const conv = await loadConv(db, convId)
    if (!conv) return { ok: false, error: 'conv_not_found' }
    const ia = await setting(db, 'ia_config', {}) || {}
    if (ia.activo === false) return { ok: true, skipped: 'ia_off' }
    if (conv.mode === 'humano') return { ok: true, skipped: 'human_mode' }

    const history = await loadHistory(db, convId)
    const message = pendingText(history)
    if (!message) return { ok: true, skipped: 'already_answered_or_no_pending_user' }

    const result = await generateAgentResponse({
      message,
      conversationHistory: history.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
      iaConfig: ia,
      leadData: {
        telefono: conv.telefono || payload.tel || '',
        nombre: conv.nombre || '',
        lead_id: conv.lead_id || '',
        conv_id: conv.id || '',
        status: conv.status || '',
        mode: conv.mode || ''
      }
    }, { db })

    const reply = clean(result.reply)
    if (!reply) {
      console.error('[agent-worker] no reply', { convId, error: result.error, trace: result.trace })
      return { ok: true, skipped: 'agent_no_reply', error: result.error || '' }
    }

    const instance = await defaultInstance(db, payload.instance || conv.instanceName || '')
    const sent = await sendWa({ instance, number: payload.phone || conv.telefono, text: reply })
    await saveMsg(db, conv.id, 'assistant', reply)

    const upd = { last_message: reply }
    const allowedByHardRules = result?.trace?.derivationAllowedByHardRules === true
    const requestedStatus = normStatus(result.statusUpdate || '')
    if (allowedByHardRules && requestedStatus) upd.status = requestedStatus
    if (result.action === 'calificado') upd.status = 'calificado'
    if (allowedByHardRules && result.escalateToHuman === true) upd.mode = 'humano'
    await updateConv(db, conv.id, upd)

    console.log('[agent-worker] done', { convId, sent: sent.ok, status: sent.status })
    return { ok: true, replied: sent.ok, sendStatus: sent.status, convId }
  } catch (e) {
    console.error('[agent-worker] error', e)
    return { ok: false, error: e.message || 'worker_error' }
  } finally {
    await deleteSetting(db, lockKey)
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, endpoint: 'agent-worker', mode: 'direct-export' })
  if (req.method !== 'POST') return res.status(405).json({ ok: false })
  const result = await processConversation(req.body || {})
  return res.status(200).json(result)
}
