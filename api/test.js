// api/test.js — diagnóstico de conexión (borrar después de diagnosticar)
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  const SB_URL = process.env.VITE_SUPABASE_URL || ''
  const SB_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''

  const result = {
    env: {
      VITE_SUPABASE_URL:    SB_URL ? SB_URL.slice(0,40)+'...' : '❌ NO CONFIGURADA',
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? '✅ configurada ('+process.env.SUPABASE_SERVICE_KEY.slice(-6)+')' : '❌ NO CONFIGURADA',
      VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ? '✅ configurada' : '❌ NO CONFIGURADA',
      VITE_ANTHROPIC_KEY:   process.env.VITE_ANTHROPIC_KEY ? '✅ configurada' : '❌ NO CONFIGURADA',
    },
    supabase: null,
    error: null
  }

  if (!SB_URL || !SB_KEY) {
    result.error = 'Faltan variables de entorno - configúralas en Vercel → Settings → Environment Variables'
    return res.status(200).json(result)
  }

  try {
    const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } })
    const { data, error, count } = await sb.from('crm_conversations').select('*', { count: 'exact', head: true })
    if (error) {
      result.supabase = { ok: false, error: error.message, code: error.code, hint: error.hint }
    } else {
      result.supabase = { ok: true, total_conversations: count }
      // Test insert
      const testId = 'test-diag-' + Date.now()
      const { error: ie } = await sb.from('crm_conversations').insert({
        id: testId, telefono: '+56999000000', nombre: 'TEST', mode: 'ia', status: 'activo',
        last_message: 'test', created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      })
      if (ie) {
        result.supabase.insert_test = { ok: false, error: ie.message, code: ie.code, hint: ie.hint }
      } else {
        result.supabase.insert_test = { ok: true }
        await sb.from('crm_conversations').delete().eq('id', testId)
      }
    }
  } catch(e) {
    result.error = e.message
    result.cause = e.cause?.code || null
  }

  return res.status(200).json(result)
}
