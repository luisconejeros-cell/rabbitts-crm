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

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL
  const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY
  const sbHeaders = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`
  }

  const { message, conversationHistory = [], iaConfig = {}, leadData = {} } = req.body
  if (!message) return res.status(400).json({ error: 'No message provided' })

  // 1. Personalidad y guion
  const personalidad   = iaConfig.personalidad || 'Eres Rabito, asistente de ventas de Rabbitts Capital.'
  const guion          = iaConfig.guion || ''
  const calendly       = iaConfig.calendlyLink || 'https://calendly.com/agenda-rabbittscapital/60min'
  const rentaMin       = iaConfig.rentaMinima || 1500000
  const rentaMinPareja = iaConfig.rentaMinimaPareja || 2000000

  // 2. Entrenamiento con razon
  const entrenamiento = (iaConfig.entrenamiento || [])
    .map(p => {
      let entry = `PREGUNTA: ${p.pregunta}\nRESPUESTA CORRECTA: ${p.respuesta}`
      if (p.razon) entry += `\nPOR QUE: ${p.razon}`
      return entry
    }).join('\n\n---\n\n')

  // 3. Drive - contenido REAL desde Supabase
  let driveContext = ''
  if (iaConfig.driveConectado && SUPABASE_URL && SUPABASE_KEY) {
    try {
      const driveRes = await fetch(
        `${SUPABASE_URL}/rest/v1/crm_settings?key=eq.drive_content&select=value`,
        { headers: sbHeaders }
      )
      const driveData = await driveRes.json()
      const driveInfo = driveData?.[0]?.value
      if (driveInfo?.files?.length > 0) {
        const syncedAt = driveInfo.synced_at ? new Date(driveInfo.synced_at).toLocaleString('es-CL') : 'desconocida'
        driveContext = `\n\nBASE DE CONOCIMIENTO (sincronizado: ${syncedAt}):\n` +
          driveInfo.files.map(f => `### ${f.name}\n${f.content}`).join('\n\n---\n\n')
      } else {
        driveContext = '\n\n[Drive conectado pero sin documentos sincronizados. Ir a IA > Drive > Sincronizar.]'
      }
    } catch (e) { console.warn('Drive fetch error:', e.message) }
  }

  // 4. System prompt completo
  const systemPrompt = `${personalidad}

GUION DE VENTAS:
${guion}

LINK CALENDLY: ${calendly}
RENTA MINIMA INDIVIDUAL: $${rentaMin.toLocaleString('es-CL')}
RENTA MINIMA EN PAREJA: $${rentaMinPareja.toLocaleString('es-CL')}
${driveContext}

${entrenamiento ? `EJEMPLOS DE ENTRENAMIENTO (sigue estos patrones exactamente):
${entrenamiento}` : ''}

CONTEXTO DEL LEAD:
${leadData.nombre ? 'Nombre: ' + leadData.nombre : 'Lead nuevo'}
${leadData.renta ? 'Renta: ' + leadData.renta : ''}
${leadData.propiedades ? 'Propiedades: ' + leadData.propiedades : ''}
${leadData.modelo ? 'Modelo: ' + leadData.modelo : ''}

Al final de tu respuesta incluye si aplica:
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
        max_tokens: 1500,
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
    console.error('Agent error:', error.message)
    return res.status(500).json({ error: error.message })
  }
}
