// api/watest.js — prueba INSERT en crm_conversations (borrar después)
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const SB_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  const SB_KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()
  
  if (!SB_URL || !SB_KEY) return res.status(200).json({ error: 'env missing' })
  
  const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } })
  const testId = 'watest-' + Date.now()
  const result = {}

  // Prueba 1: INSERT con campos exactos del CRM
  const { data: d1, error: e1 } = await sb.from('crm_conversations').insert({
    id: testId, telefono: '+56999888777', nombre: 'TEST AUTO',
    mode: 'ia', status: 'activo', last_message: 'test',
    lead_id: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  }).select().single()
  
  result.insert_full = e1 ? { ok: false, error: e1.message, code: e1.code, hint: e1.hint, details: e1.details } : { ok: true, id: d1?.id }

  // Si funcionó, borrar el test
  if (!e1) await sb.from('crm_conversations').delete().eq('id', testId)

  // Prueba 2: SELECT para ver estructura de la tabla
  const { data: cols, error: e2 } = await sb.from('crm_conversations').select('*').limit(1)
  result.columns = e2 ? { error: e2.message } : { ok: true, fields: cols?.[0] ? Object.keys(cols[0]) : [] }

  // Prueba 3: SELECT de crm_conv_messages
  const { data: msgs, error: e3 } = await sb.from('crm_conv_messages').select('*').limit(1)
  result.messages_table = e3 ? { error: e3.message } : { ok: true, fields: msgs?.[0] ? Object.keys(msgs[0]) : ['(vacía)'] }

  return res.status(200).json(result)
}
