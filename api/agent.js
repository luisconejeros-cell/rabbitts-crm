// api/agent.js — Rabito: Agente de ventas Rabbitts Capital
// Backend puro para Vercel. No pegar JSX/HTML en este archivo.

function cleanText(value = '') {
  return String(value || '').trim()
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function extractActionAndData(rawReply = '') {
  let reply = String(rawReply || '').trim()
  let action = 'conversando'
  const leadUpdate = {}

  const actionMatch = reply.match(/\[ACCION:\s*([^\]]+)\]/i)
  if (actionMatch) {
    action = actionMatch[1].trim().toLowerCase()
    reply = reply.replace(actionMatch[0], '').trim()
  }

  const dataMatch = reply.match(/\[DATOS:\s*([^\]]+)\]/i)
  if (dataMatch) {
    dataMatch[1].split(',').forEach(pair => {
      const [rawKey, ...rest] = pair.split('=')
      const key = cleanText(rawKey)
      const value = cleanText(rest.join('='))
      if (key && value && value.toLowerCase() !== 'x') {
        leadUpdate[key] = value
      }
    })
    reply = reply.replace(dataMatch[0], '').trim()
  }

  reply = reply.replace(/\n{3,}/g, '\n\n').trim()

  return { reply, action, leadUpdate }
}

async function loadDriveContext(iaConfig = {}) {
  const SB_URL = cleanText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const SB_KEY = cleanText(process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY)

  if (!iaConfig.driveConectado || !SB_URL || !SB_KEY) return ''

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(SB_URL, SB_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    const { data, error } = await sb
      .from('crm_settings')
      .select('value')
      .eq('key', 'drive_content')
      .single()

    if (error) {
      console.warn('[Agent] Drive config error:', error.message)
      return ''
    }

    const drive = data?.value
    if (!drive?.files?.length) return ''

    return '\n\n═══ BASE DE CONOCIMIENTO (Google Drive) ═══\n' +
      drive.files
        .map(file => `📄 ${file.name}:\n${file.content}`)
        .join('\n\n───────────\n\n')
  } catch (error) {
    console.warn('[Agent] Drive error:', error.message)
    return ''
  }
}

async function callClaude({ anthropicKey, model, systemPrompt, messages, attempt = 1 }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages
    })
  })

  let data = null
  const text = await response.text()

  try {
    data = text ? JSON.parse(text) : null
  } catch (_) {
    throw new Error(`Anthropic devolvió respuesta no JSON: ${text.slice(0, 180)}`)
  }

  if (response.status === 529 || data?.error?.type === 'overloaded_error') {
    if (attempt <= 2) {
      await sleep(attempt * 1500)
      return callClaude({ anthropicKey, model, systemPrompt, messages, attempt: attempt + 1 })
    }
    throw new Error('Anthropic saturado')
  }

  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || `Anthropic HTTP ${response.status}`)
  }

  return data
}

async function extractDocument({ anthropicKey, file, mediaType, fileName }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'pdfs-2024-09-25'
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: mediaType, data: file } },
          { type: 'text', text: 'Extrae y devuelve TODO el texto de este documento exactamente como aparece, sin resúmenes ni comentarios. Solo el texto completo.' }
        ]
      }]
    })
  })

  const textBody = await response.text()
  let data = null

  try {
    data = textBody ? JSON.parse(textBody) : null
  } catch (_) {
    throw new Error(`Anthropic devolvió respuesta no JSON: ${textBody.slice(0, 180)}`)
  }

  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || 'Error extrayendo documento')
  }

  const text = data?.content?.[0]?.text || ''
  console.log('[Agent] Extracted', text.length, 'chars from', fileName || 'documento')
  return text
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' })

  const ANTHROPIC_KEY = cleanText(process.env.ANTHROPIC_KEY || process.env.VITE_ANTHROPIC_KEY)
  const ANTHROPIC_MODEL = cleanText(process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001')

  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ ok: false, error: 'ANTHROPIC_KEY no configurada en Vercel' })
  }

  const body = req.body || {}
  const {
    message,
    conversationHistory = [],
    iaConfig = {},
    leadData = {},
    action,
    file,
    mediaType,
    fileName
  } = body

  if (action === 'extract' && file) {
    try {
      const text = await extractDocument({
        anthropicKey: ANTHROPIC_KEY,
        file,
        mediaType,
        fileName
      })

      return res.status(200).json({ ok: true, text })
    } catch (error) {
      console.error('[Agent] Extract error:', error.message)
      return res.status(200).json({ ok: false, error: error.message, text: '' })
    }
  }

  if (!message) {
    return res.status(400).json({ ok: false, error: 'No message' })
  }

  const personalidad = cleanText(iaConfig.personalidad || 'Eres Rabito, agente de ventas de Rabbitts Capital Chile.')
  const guion = cleanText(iaConfig.guion)
  const calendly = cleanText(iaConfig.calendlyLink || 'https://calendly.com/agenda-rabbittscapital/60min')
  const rentaMin = Number(iaConfig.rentaMinima) || 1500000
  const rentaMinPareja = Number(iaConfig.rentaMinimaPareja) || 2000000

  const entrenamientoBlocks = Array.isArray(iaConfig.entrenamiento)
    ? iaConfig.entrenamiento
        .filter(item => item?.pregunta && item?.respuesta)
        .map((item, index) => {
          let block = `[${index + 1}] CUANDO te pregunten: "${item.pregunta}"\nRESPONDE ASÍ: "${item.respuesta}"`
          if (item.razon) block += `\nPOR QUÉ: ${item.razon}`
          return block
        })
        .join('\n\n')
    : ''

  const driveContext = await loadDriveContext(iaConfig)

  const leadContext = [
    leadData.nombre ? `Nombre: ${leadData.nombre}` : 'Nombre: desconocido',
    leadData.renta ? `Renta declarada: ${leadData.renta}` : 'Renta: no informada',
    leadData.modelo ? `Modelo de interés: ${leadData.modelo}` : '',
    leadData.telefono ? `Teléfono: ${leadData.telefono}` : ''
  ].filter(Boolean).join('\n')

  const systemPrompt = `${personalidad}

═══ QUIÉN ERES ═══
Eres Rabito, agente de ventas de Rabbitts Capital. Tu misión es CALIFICAR leads y AGENDAR reuniones con los que califican. Eres amable, directo y conocedor del mercado inmobiliario chileno. Escribes en WhatsApp: mensajes cortos, conversacionales, sin asteriscos ni emojis en exceso.

═══ CRITERIOS DE CALIFICACIÓN ═══
Un lead CALIFICA si cumple AL MENOS UNO:
- Renta individual igual o superior a $${rentaMin.toLocaleString('es-CL')} mensuales
- Renta en pareja igual o superior a $${rentaMinPareja.toLocaleString('es-CL')} mensuales combinados
- Tiene pie disponible o ahorros para inversión
- Tiene interés real en comprar en los próximos 6 meses

Un lead NO CALIFICA si:
- Renta muy por debajo del mínimo y sin pie
- Solo está explorando sin intención real de compra
- No tiene capacidad crediticia evidente

═══ FLUJO DE CONVERSACIÓN ═══
${guion || `1. Saludo cálido y presentación breve
2. Descubrir necesidad: qué busca, si es para vivir o invertir
3. Calificar: preguntar renta, situación financiera y urgencia
4. Si califica, invitar a reunión por Calendly
5. Si no califica, responder dudas y mantener relación`}

═══ CUÁNDO INVITAR A REUNIÓN ═══
Invita a agendar cuando:
- El lead confirma renta suficiente
- Muestra interés concreto en un proyecto
- Pregunta por precios, ubicaciones o condiciones específicas
- Lleva 3 o más mensajes de intercambio positivo
- Dice que quiere avanzar o conocer más

Cuando invites usa esta URL: ${calendly}
Ejemplo: "Te comparto mi calendario para que elijas el horario que te acomode 📅 ${calendly}"

═══ LEAD ACTUAL ═══
${leadContext}
${driveContext}

═══ ENTRENAMIENTO ESPECÍFICO ═══
${entrenamientoBlocks || 'Sin entrenamiento específico cargado aún. Usa el guion general.'}

═══ INSTRUCCIONES FINALES ═══
1. Sigue el entrenamiento específico arriba. Tiene prioridad sobre tus respuestas naturales.
2. Haz máximo una pregunta por mensaje.
3. Si ya tienes suficiente información para calificar, califica y actúa.
4. Cuando el lead califica, no sigas preguntando. Invita a la reunión.
5. Mensajes cortos: máximo 2 a 4 líneas para WhatsApp.
6. Nunca menciones que eres IA a menos que te pregunten directamente.

Al final de cada respuesta añade en una línea separada, que será eliminada antes de enviar al cliente:
[ACCION: calificado] si ya califica y lo invitaste a reunión
[ACCION: no_interesado] si claramente no está interesado
[ACCION: escalar] si pide hablar con humano o la situación es compleja
[ACCION: conversando] si seguimos calificando

[DATOS: nombre=X, renta=X, modelo=X] actualiza solo los datos que obtengas en este mensaje`

  const messages = [
    ...conversationHistory
      .filter(item => item?.role && item?.content)
      .map(item => ({
        role: item.role === 'assistant' ? 'assistant' : 'user',
        content: String(item.content)
      })),
    { role: 'user', content: String(message) }
  ]

  try {
    const data = await callClaude({
      anthropicKey: ANTHROPIC_KEY,
      model: ANTHROPIC_MODEL,
      systemPrompt,
      messages
    })

    const rawReply = data?.content?.[0]?.text || ''
    const parsed = extractActionAndData(rawReply)

    console.log('[Agent] action:', parsed.action, '| leadUpdate:', JSON.stringify(parsed.leadUpdate))

    return res.status(200).json({
      ok: true,
      reply: parsed.reply,
      action: parsed.action,
      leadUpdate: parsed.leadUpdate
    })
  } catch (error) {
    console.error('[Agent] Error:', error?.stack || error?.message || error)

    return res.status(200).json({
      ok: false,
      reply: 'Hola 👋 Estoy con alta demanda en este momento. Te respondo en unos minutos.',
      action: 'conversando',
      leadUpdate: {},
      error: error?.message || 'agent_error'
    })
  }
}
