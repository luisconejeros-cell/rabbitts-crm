// ─── Rabbitts CRM — Proxy para Anthropic API ─────────────────────────────────
// Este archivo resuelve el error CORS al llamar a Anthropic desde el browser.
// La llamada pasa por este servidor en vez de ir directo desde el navegador.
//
// Vercel usa automáticamente el VITE_ANTHROPIC_KEY que ya configuraste.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })

  const ANTHROPIC_KEY = process.env.VITE_ANTHROPIC_KEY || process.env.ANTHROPIC_KEY

  if (!ANTHROPIC_KEY) {
    return res.status(500).json({
      error: 'API key de Anthropic no configurada.',
      hint: 'Ve a Vercel → Settings → Environment Variables → agrega VITE_ANTHROPIC_KEY'
    })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { conversation } = body

    if (!conversation) {
      return res.status(400).json({ error: 'Falta el campo conversation' })
    }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `Extrae datos del cliente de conversaciones inmobiliarias. Responde SOLO JSON sin backticks ni texto adicional:
{"nombre":"nombre completo o null","telefono":"teléfono con código de país o null","email":"email o null","renta":"presupuesto mensual con moneda o null","calificacion":"Alta/Media/Baja según capacidad e interés","resumen":"2-3 oraciones sobre la necesidad, interés y perfil del cliente"}`,
        messages: [{ role: 'user', content: `Conversación de WhatsApp:\n\n${conversation}` }]
      })
    })

    const data = await r.json()

    if (!r.ok) {
      console.error('Anthropic error:', data)
      return res.status(r.status).json({ error: 'Error de Anthropic', details: data })
    }

    const text = (data.content || []).find(b => b.type === 'text')?.text || '{}'
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim())

    return res.status(200).json({ success: true, data: parsed })

  } catch (err) {
    console.error('Extract error:', err)
    return res.status(500).json({ error: 'Error interno', details: err.message })
  }
}
