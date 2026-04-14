// api/agent-worker.js — Compatibilidad v6
// El webhook principal ya responde directo. Este archivo queda disponible para pruebas manuales.

import { createClient } from '@supabase/supabase-js'
import { generateAgentResponse } from './agent.js'

const clean = (v = '') => String(v ?? '').trim()
const nowIso = () => new Date().toISOString()

function sb() {
  const url = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const key = clean(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null
}

async function setting(db, key, fallback = null) {
  try { const { data } = await db.from('crm_settings').select('value').eq('key', key).single(); return data?.value ?? fallback } catch { return fallback }
}

async function loadConv(db, convId) {
  try { const { data } = await db.from('crm_conversations').select('*').eq('id', convId).single(); return data || null } catch { return null }
}

async function loadHistory(db, convId) {
  try {
    const { data } = await db.from('crm_conv_messages').select('role,content,created_at').eq('conv_id', convId).order('created_at', { ascending: true }).limit(40)
    return (data || []).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clean(m.content), created_at: m.created_at })).filter(m => m.content && !m.content.startsWith('[Sistema]'))
  } catch { return [] }
}

async function saveMsg(db, convId, role, content) {
  if (!convId || !clean(content)) return false
  try { const { error } = await db.from('crm_conv_messages').insert({ conv_id: convId, role, content: clean(content), created_at: nowIso() }); return !error } catch { return false }
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
  if (!url || !key || !instance || !number || !text) return { ok: false, error: 'missing_evolution_env_or_payload' }
  const r = await fetch(`${url}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key },
    body: JSON.stringify({ number: clean(number).replace(/[^0-9]/g, ''), text, delay: Number(process.env.EVOLUTION_SEND_DELAY || 350) })
  })
  return { ok: r.ok, status: r.status, body: await r.text().catch(() => '') }
}

export async function processConversation(payload = {}, opts = {}) {
  const db = opts.db || sb()
  if (!db) return { ok: false, error: 'supabase_env_missing' }
  const convId = clean(payload.convId)
  if (!convId) return { ok: false, error: 'missing_convId' }

  const conv = await loadConv(db, convId)
  if (!conv) return { ok: false, error: 'conv_not_found' }
  const ia = await setting(db, 'ia_config', {}) || {}
  if (ia.activo === false) return { ok: true, skipped: 'ia_off' }
  if (conv.mode === 'humano') return { ok: true, skipped: 'human_mode' }

  const history = await loadHistory(db, convId)
  const lastUser = [...history].reverse().find(m => m.role === 'user')
  const message = clean(payload.message || lastUser?.content || '')
  if (!message) return { ok: true, skipped: 'no_message' }

  const result = await generateAgentResponse({
    message,
    conversationHistory: history.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
    iaConfig: ia,
    leadData: { telefono: conv.telefono || payload.tel || '', nombre: conv.nombre || '', lead_id: conv.lead_id || '', conv_id: conv.id || '', status: conv.status || '', mode: conv.mode || '' }
  }, { db })

  const reply = clean(result.reply)
  if (!reply) return { ok: true, skipped: 'empty_reply', error: result.error || '' }

  const instance = await defaultInstance(db, payload.instance || conv.instanceName || '')
  const sent = await sendWa({ instance, number: payload.phone || conv.telefono, text: reply })
  await saveMsg(db, conv.id, 'assistant', reply)
  try { await db.from('crm_conversations').update({ last_message: reply, updated_at: nowIso() }).eq('id', conv.id) } catch {}
  return { ok: true, replied: sent.ok, sendStatus: sent.status || 0, convId }
}

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, endpoint: 'agent-worker', mode: 'compat-v6' })
  if (req.method !== 'POST') return res.status(405).json({ ok: false })
  const result = await processConversation(req.body || {})
  return res.status(200).json(result)
}
