// api/whatsapp-signup.js — Embedded Signup: intercambia código/token de Meta por token de larga duración
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { userToken, phoneNumberId, wabaId, nombre, verifyToken } = req.body

  if (!userToken || !phoneNumberId) {
    return res.status(400).json({ error: 'Faltan userToken o phoneNumberId' })
  }

  const APP_ID     = process.env.VITE_META_APP_ID
  const APP_SECRET = process.env.META_APP_SECRET
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY

  try {
    // ── 1. Intercambiar user token por token de 60 días ──────────────────────
    let longToken = userToken
    if (APP_ID && APP_SECRET) {
      const exchangeUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${APP_ID}&client_secret=${APP_SECRET}&fb_exchange_token=${userToken}`
      const exchangeRes  = await fetch(exchangeUrl)
      const exchangeData = await exchangeRes.json()
      if (exchangeData.access_token) {
        longToken = exchangeData.access_token
      }
    }

    // ── 2. Obtener datos del número desde Meta ────────────────────────────────
    const phoneRes  = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}?fields=display_phone_number,verified_name,code_verification_status`, {
      headers: { 'Authorization': `Bearer ${longToken}` }
    })
    const phoneData = await phoneRes.json()

    if (phoneData.error) {
      return res.status(400).json({ error: 'Error al consultar Meta', detail: phoneData.error.message })
    }

    // ── 3. Construir objeto número ────────────────────────────────────────────
    const safeVerify = verifyToken || 'rabbitts_' + Math.random().toString(36).slice(2, 10)
    const newNum = {
      id:          'wa-' + Date.now(),
      nombre:      nombre || phoneData.verified_name || ('WhatsApp ' + (phoneData.display_phone_number || phoneNumberId)),
      numero:      phoneData.display_phone_number || '',
      phoneId:     phoneNumberId,
      wabaId:      wabaId || '',
      token:       longToken,
      verifyToken: safeVerify,
      activo:      true,
      createdAt:   new Date().toISOString()
    }

    // ── 4. Guardar en Supabase (merge con lista existente) ────────────────────
    const existingRes  = await fetch(`${SUPABASE_URL}/rest/v1/crm_settings?key=eq.wa_numeros&select=value`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    })
    const existingData = await existingRes.json()
    const existing     = existingData?.[0]?.value || []

    // Reemplaza si el phoneId ya existe, agrega si es nuevo
    const updated = [...existing.filter(n => n.phoneId !== phoneNumberId), newNum]

    await fetch(`${SUPABASE_URL}/rest/v1/crm_settings`, {
      method:  'POST',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({ key: 'wa_numeros', value: updated })
    })

    return res.status(200).json({ success: true, numero: newNum })

  } catch (err) {
    console.error('whatsapp-signup error:', err)
    return res.status(500).json({ error: err.message })
  }
}
