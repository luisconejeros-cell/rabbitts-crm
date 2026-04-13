// api/waDiag.js — Diagnóstico webhook WhatsApp
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY

  const h = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  }

  const results = {}

  // 1. Test SELECT crm_conversations
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/crm_conversations?limit=1`, { headers: h })
    const body = await r.text()
    results.select_conversations = { status: r.status, ok: r.ok, body: body.slice(0,200) }
  } catch(e) { results.select_conversations = { error: e.message } }

  // 2. Test INSERT crm_conversations con UUID real
  const testId = crypto.randomUUID ? crypto.randomUUID() : 'test-' + Date.now()
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/crm_conversations`, {
      method: 'POST',
      headers: { ...h, 'Prefer': 'return=representation' },
      body: JSON.stringify({
        id: testId,
        telefono: '+56999000001',
        nombre: 'TEST_DIAG',
        mode: 'ia',
        status: 'activo',
        instanceName: 'test',
        last_message: 'test diag',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    })
    const body = await r.text()
    results.insert_conversation = { status: r.status, ok: r.ok, body: body.slice(0,300) }

    // 3. Si insertó, borrar el test
    if (r.ok) {
      const del = await fetch(`${SUPABASE_URL}/rest/v1/crm_conversations?id=eq.${testId}`, {
        method: 'DELETE', headers: h
      })
      results.delete_test = { status: del.status }
    }
  } catch(e) { results.insert_conversation = { error: e.message } }

  // 4. Test SELECT crm_conv_messages
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/crm_conv_messages?limit=1`, { headers: h })
    const body = await r.text()
    results.select_messages = { status: r.status, ok: r.ok, body: body.slice(0,200) }
  } catch(e) { results.select_messages = { error: e.message } }

  // 5. Test columns — intentar INSERT con solo id para ver qué columnas faltan
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/crm_conversations?select=id,telefono,nombre,mode,status,instanceName,last_message,created_at,updated_at&limit=1`, { headers: h })
    const body = await r.text()
    results.columns_check = { status: r.status, ok: r.ok, body: body.slice(0,200) }
  } catch(e) { results.columns_check = { error: e.message } }

  // 6. Verificar env vars
  results.env = {
    supabase_url: SUPABASE_URL ? SUPABASE_URL.slice(0,40) + '...' : 'MISSING',
    supabase_key: SUPABASE_KEY ? SUPABASE_KEY.slice(0,20) + '...' : 'MISSING',
    crypto_uuid: typeof crypto !== 'undefined' && !!crypto.randomUUID
  }

  return res.status(200).json(results)
}
