// api/agent.js — Rabito AI Agent for Rabbitts Capital
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })

  const ANTHROPIC_KEY = process.env.VITE_ANTHROPIC_KEY || process.env.ANTHROPIC_KEY
  if (!ANTHROPIC_KEY) {
    return res.status(500).json({
      error: 'API key no configurada. Ve a Vercel → Settings → Environment Variables → agrega VITE_ANTHROPIC_KEY'
    })
  }

  const { message, conversationHistory = [], iaConfig = {}, leadData = {} } = req.body
  if (!message) return res.status(400).json({ error: 'No message provided' })

  // Drive context if connected
  let driveContext = ''
  if (iaConfig.driveConectado && iaConfig.driveUrl) {
    driveContext = `\nBASE DE CONOCIMIENTO EN DRIVE: ${iaConfig.driveUrl}\nTienes documentos con info de proyectos, precios y condiciones de Rabbitts Capital. Cuando el cliente pregunte por proyectos especificos, indica que tienes informacion detallada disponible.`
  }

  const personalidad = iaConfig.personalidad || 'Eres Rabito, asistente de ventas de Rabbitts Capital.'
  const guion = iaConfig.guion || ''
  const calendly = iaConfig.calendlyLink || 'https://calendly.com/agenda-rabbittscapital/60min'
  const rentaMin = iaConfig.rentaMinima || 1500000
  const rentaMinPareja = iaConfig.rentaMinimaPareja || 2000000
  const entrenamiento = (iaConfig.entrenamiento || [])
    .map(p => `P: ${p.pregunta}\nR: ${p.respuesta}`).join('\n\n')

  const systemPrompt = `${personalidad}

${guion}

LINK CALENDLY: ${calendly}
RENTA MINIMA INDIVIDUAL: $${rentaMin.toLocaleString('es-CL')}
RENTA MINIMA CON PAREJA: $${rentaMinPareja.toLocaleString('es-CL')}
${driveContext}

CONOCIMIENTO BASE:
${entrenamiento}

CONTEXTO LEAD:
${leadData.nombre ? 'Nombre: ' + leadData.nombre : 'Lead nuevo'}
${leadData.renta ? 'Renta: ' + leadData.renta : ''}
${leadData.propiedades ? 'Propiedades: ' + leadData.propiedades : ''}
${leadData.modelo ? 'Modelo: ' + leadData.modelo : ''}

Al final del mensaje incluye si aplica:
[DATOS: nombre=X, renta=X, propiedades=X, modelo=X]
[ACCION: calificado] o [ACCION: no_interesado] o [ACCION: escalar]`

  const messages = [
    ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message }
  ]

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: systemPrompt,
        messages
      })
    })
    const data = await response.json()
    if (data.error) throw new Error(data.error.message)

    let reply = data.content?.[0]?.text || ''
    let action = null
    let leadUpdate = {}

    const am = reply.match(/\[ACCION:\s*([^\]]+)\]/)
    if (am) { action = am[1].trim(); reply = reply.replace(am[0], '').trim() }
    const dm = reply.match(/\[DATOS:\s*([^\]]+)\]/)
    if (dm) {
      dm[1].split(',').forEach(pair => {
        const [k, v] = pair.split('=').map(s => s.trim())
        if (k && v && v !== 'X') leadUpdate[k] = v
      })
      reply = reply.replace(dm[0], '').trim()
    }
    return res.status(200).json({ reply, action, leadUpdate })
  } catch (error) {
    return res.status(500).json({ error: error.message })
  }
}
