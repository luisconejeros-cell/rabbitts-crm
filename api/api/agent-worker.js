// api/agent-worker.js — worker de respuestas IA para WhatsApp
import { createClient } from '@supabase/supabase-js'

const clean = (v = '') => String(v ?? '').trim()
const nowIso = () => new Date().toISOString()
const sleep = ms => new Promise(r => setTimeout(r, ms))

function sb() {
  const url = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const key = clean(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
function baseUrl(req) {
  const configured = clean(process.env.PUBLIC_BASE_URL || process.env.APP_URL || process.env.CRM_URL)
  if (configured) return configured.replace(/\/$/, '')
  const host = req.headers['x-forwarded-host'] || req.headers.host
  const proto = req.headers['x-forwarded-proto'] || 'https'
  return host ? `${proto}://${host}` : 'https://crm.rabbittscapital.com'
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
  const value = { token: Math.random().toString(36).slice(2), until: Date.now() + 45000 }
  await upsertSetting(db, key, value)
  await sleep(80)
  const check = await setting(db, key, null)
  return check?.token === value.token
}
async function loadConv(db, convId) { try { const { data } = await db.from('crm_conversations').select('*').eq('id', convId).single(); return data || null } catch { return null } }
async function loadHistory(db, convId) {
  try {
    const { data } = await db.from('crm_conv_messages').select('role,content,created_at').eq('conv_id', convId).order('created_at', { ascending: true }).limit(60)
    return (data || []).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clean(m.content), created_at: m.created_at })).filter(m => m.content && !m.content.startsWith('[Sistema]'))
  } catch { return [] }
}
function pendingUser(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'assistant') return null
    if (history[i].role === 'user') return history[i]
  }
  return null
}
function parseJSON(t) { try { return JSON.parse(t) } catch { return null } }
function extractReply(v) {
  if (!v) return ''
  if (typeof v === 'object') return extractReply(v.reply || v.message || v.text || '')
  const text = clean(v)
  if (!text) return ''
  if (text.startsWith('{')) {
    const obj = parseJSON(text)
    if (obj) return extractReply(obj.reply || obj.message || obj.text || '')
    const m = text.match(/"reply"\s*:\s*"([\s\S]*?)"\s*,/i) || text.match(/"reply"\s*:\s*"([\s\S]*?)"\s*}/i)
    return m ? m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : ''
  }
  return text
}
async function saveMsg(db, convId, role, content) {
  if (!convId || !content) return
  try { await db.from('crm_conv_messages').insert({ conv_id: convId, role, content: clean(content), created_at: nowIso() }) } catch {}
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
  const key = clean(process.env.EVOLUTION_API_KEY || process.env.EVO_KEY || 'rabbitts2024')
  if (!url || !key || !instance || !number || !text) return { ok: false, status: 0 }
  const r = await fetch(`${url}/message/sendText/${instance}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key }, body: JSON.stringify({ number: clean(number).replace(/[^0-9]/g, ''), text, delay: 250 }) })
  return { ok: r.ok, status: r.status }
}
function normStatus(v = '') {
  const s = String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, '_')
  return ['activo','calificado','frio','no_interesado','requiere_revision'].includes(s) ? s : ''
}
export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ok: true, endpoint: 'agent-worker' })
  if (req.method !== 'POST') return res.status(405).json({ ok: false })
  const db = sb(); if (!db) return res.status(200).json({ ok: false, error: 'supabase_env_missing' })
  const { convId, phone, instance } = req.body || {}
  if (!convId) return res.status(200).json({ ok: false, error: 'missing_convId' })
  const lockKey = `agent_lock_${convId}`
  if (!(await acquireLock(db, convId))) return res.status(200).json({ ok: true, skipped: 'locked' })
  try {
    await sleep(Number(process.env.AGENT_BATCH_DELAY_MS || 1200))
    const conv = await loadConv(db, convId); if (!conv) return res.status(200).json({ ok: false, error: 'conv_not_found' })
    const ia = await setting(db, 'ia_config', {}) || {}
    if (ia.activo === false || conv.mode === 'humano') return res.status(200).json({ ok: true, skipped: ia.activo === false ? 'ia_off' : 'human_mode' })
    const history = await loadHistory(db, convId)
    const pending = pendingUser(history)
    if (!pending?.content) return res.status(200).json({ ok: true, skipped: 'already_answered' })
    const r = await fetch(`${baseUrl(req)}/api/agent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: pending.content, conversationHistory: history.slice(0, -1).map(m => ({ role: m.role, content: m.content })), iaConfig: ia, leadData: { telefono: conv.telefono || '', nombre: conv.nombre || '', lead_id: conv.lead_id || '', conv_id: conv.id || '', status: conv.status || '', mode: conv.mode || '' } }) })
    const raw = await r.text()
    const data = parseJSON(raw) || { reply: raw }
    const reply = extractReply(data.reply)
    if (!reply) return res.status(200).json({ ok: true, skipped: 'agent_no_reply' })
    const inst = await defaultInstance(db, instance || conv.instanceName || '')
    const sent = await sendWa({ instance: inst, number: phone || conv.telefono, text: reply })
    await saveMsg(db, conv.id, 'assistant', reply)
    const upd = { last_message: reply, updated_at: nowIso() }
    const hard = data?.trace?.derivationAllowedByHardRules === true
    const requested = normStatus(data?.statusUpdate || '')
    if (hard && requested) upd.status = requested
    if (data?.action === 'calificado') upd.status = 'calificado'
    if (hard && (data?.escalateToHuman || data?.derivarHumano || data?.human)) upd.mode = 'humano'
    try { await db.from('crm_conversations').update(upd).eq('id', conv.id) } catch {}
    return res.status(200).json({ ok: true, replied: sent.ok, sendStatus: sent.status })
  } catch (e) {
    console.error('[agent-worker]', e)
    return res.status(200).json({ ok: false, error: e.message })
  } finally { await deleteSetting(db, lockKey) }
}
