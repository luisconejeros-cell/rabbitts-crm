// api/agent-worker.js — compatibilidad v9
// El flujo principal ahora responde desde api/whatsapp.js de forma directa.
// Este endpoint queda disponible para pruebas o integraciones antiguas.

import { createClient } from '@supabase/supabase-js'
import { generateAgentResponse } from './agent.js'

const clean = (v = '') => String(v ?? '').trim()
const nowIso = () => new Date().toISOString()

function sb() {
  const url = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const key = clean(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null
}

async function history(db, convId) {
  try {
    const { data } = await db.from('crm_conv_messages')
      .select('role,content,created_at')
      .eq('conv_id', convId)
      .order('created_at', { ascending: true })
      .limit(60)
    return (data || []).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clean(m.content) })).filter(m => m.content)
  } catch { return [] }
}

export async function processConversation({ convId, message = '' } = {}) {
  const db = sb()
  if (!db || !convId) return { ok:false, error:'missing_db_or_convId' }
  const { data: conv } = await db.from('crm_conversations').select('*').eq('id', convId).single()
  const hist = await history(db, convId)
  const lastUser = clean(message) || [...hist].reverse().find(m => m.role === 'user')?.content || ''
  const ia = await db.from('crm_settings').select('value').eq('key', 'ia_config').single().then(r => r.data?.value || {}).catch(() => ({}))
  return generateAgentResponse({
    message: lastUser,
    conversationHistory: hist,
    iaConfig: ia,
    leadData: { telefono: conv?.telefono || '', nombre: conv?.nombre || '', conv_id: convId, status: conv?.status || '', mode: conv?.mode || '' }
  }, { db })
}

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).json({ ok:true, endpoint:'api/agent-worker', mode:'compat-v9' })
  if (req.method !== 'POST') return res.status(405).json({ ok:false })
  const result = await processConversation(req.body || {})
  return res.status(200).json(result)
}
