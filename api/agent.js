// api/agent.js — Rabito Vambe-style Plus
// Agente comercial conversacional para Rabbitts Capital.
// Backend puro para Vercel. No pegar JSX/HTML en este archivo.

const DEFAULT_CALENDLY = 'https://calendly.com/agenda-rabbittscapital/60min'
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

const ALLOWED_LEAD_KEYS = new Set(['nombre', 'renta', 'modelo', 'email'])

const FORBIDDEN_PHRASES = [
  'alta demanda',
  'te respondo en unos minutos',
  'te respondo en algunos minutos',
  'estoy con alta demanda',
  'estoy ocupado',
  'estamos ocupados',
  'cuando pueda',
  'soy una ia',
  'soy inteligencia artificial',
  'como modelo de lenguaje',
  'no tengo acceso',
  'no puedo ayudarte',
  'no puedo ayudar',
  'no tengo la capacidad',
  'mis capacidades',
  'mis limitaciones',
  'debes esperar',
  'un ejecutivo te respondera',
  'un ejecutivo te responderá',
  'en breve te contacto',
  'más tarde te respondo',
  'mas tarde te respondo'
]

const ROBOTIC_PATTERNS = [
  /como\s+asistente\s+virtual/i,
  /como\s+modelo\s+de\s+lenguaje/i,
  /no\s+puedo\s+proporcionar/i,
  /no\s+tengo\s+informaci[oó]n\s+suficiente/i,
  /lamento\s+la\s+confusi[oó]n/i,
  /gracias\s+por\s+tu\s+consulta/i,
  /es\s+importante\s+destacar\s+que/i,
  /te\s+recomiendo\s+consultar\s+con\s+un\s+profesional/i
]

function cleanText(value = '') {
  return String(value || '').trim()
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeForCheck(text = '') {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function containsForbiddenReply(text = '') {
  const t = normalizeForCheck(text)
  return FORBIDDEN_PHRASES.some(phrase => t.includes(normalizeForCheck(phrase)))
}

function looksRobotic(text = '') {
  return ROBOTIC_PATTERNS.some(pattern => pattern.test(text || ''))
}

function removeAgentMetadata(reply = '') {
  return String(reply || '')
    .replace(/\[ACCION:[\s\S]*?\]/gi, '')
    .replace(/\[DATOS:[\s\S]*?\]/gi, '')
    .replace(/\[MEMORIA:[\s\S]*?\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function safeJsonParse(text, fallback = null) {
  try { return text ? JSON.parse(text) : fallback } catch (_) { return fallback }
}

function onlyAllowedLeadUpdate(update = {}) {
  const clean = {}
  for (const [key, value] of Object.entries(update || {})) {
    const k = cleanText(key)
    const v = cleanText(value)
    if (ALLOWED_LEAD_KEYS.has(k) && v && v.toLowerCase() !== 'x') clean[k] = v
  }
  return clean
}

function extractActionAndData(rawReply = '') {
  let reply = String(rawReply || '').trim()
  let action = 'conversando'
  const leadUpdate = {}

  const actionMatch = reply.match(/\[ACCION:\s*([^\]]+)\]/i)
  if (actionMatch) {
    action = cleanText(actionMatch[1]).toLowerCase()
    reply = reply.replace(actionMatch[0], '').trim()
  }

  const dataMatch = reply.match(/\[DATOS:\s*([^\]]+)\]/i)
  if (dataMatch) {
    dataMatch[1].split(',').forEach(pair => {
      const [rawKey, ...rest] = pair.split('=')
      const key = cleanText(rawKey)
      const value = cleanText(rest.join('='))
      if (key && value && value.toLowerCase() !== 'x') leadUpdate[key] = value
    })
    reply = reply.replace(dataMatch[0], '').trim()
  }

  if (!['calificado', 'escalar', 'no_interesado', 'conversando'].includes(action)) {
    action = 'conversando'
  }

  return { reply: removeAgentMetadata(reply), action, leadUpdate: onlyAllowedLeadUpdate(leadUpdate) }
}

function parseMoneyToNumber(text = '') {
  const raw = normalizeForCheck(text)
    .replace(/\$/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')

  const millionMatch = raw.match(/(\d+(?:\.\d+)?)\s*(m|mm|millon|millones)/i)
  if (millionMatch) return Math.round(Number(millionMatch[1]) * 1000000)

  const numberMatch = raw.match(/\b(\d{6,8})\b/)
  if (numberMatch) return Number(numberMatch[1])

  return 0
}

function formatCLP(n = 0) {
  if (!n) return ''
  return '$' + Number(n).toLocaleString('es-CL')
}

function getFirstName(name = '') {
  const cleaned = cleanText(name)
  if (!cleaned || cleaned.startsWith('+')) return ''
  return cleaned.split(/\s+/)[0]
}

function inferLocalIntent(message = '', conversationHistory = []) {
  const m = normalizeForCheck(message)
  const lastAssistant = [...conversationHistory]
    .reverse()
    .find(item => item?.role === 'assistant')?.content || ''
  const lastA = normalizeForCheck(lastAssistant)

  if (/\b(si|sí|dale|ok|okay|perfecto|ya|agendemos|agenda|llamame|llámame|llamada|reunion|reunión)\b/i.test(message)) {
    if (lastA.includes('agendar') || lastA.includes('calendly') || lastA.includes('calendario') || lastA.includes('llamada') || lastA.includes('reunion')) return 'acepta_agendar'
    return 'afirmacion'
  }

  if (m.includes('precio') || m.includes('valor') || m.includes('cuanto') || m.includes('cuánto') || m.includes('uf')) return 'precio'
  if (m.includes('renta corta') || m.includes('airbnb') || m.includes('booking') || m.includes('diaria')) return 'renta_corta'
  if (m.includes('renta') || m.includes('sueldo') || m.includes('gano') || m.includes('ingreso') || m.includes('liquido') || m.includes('líquido')) return 'renta'
  if (m.includes('credito') || m.includes('crédito') || m.includes('hipotecario') || m.includes('banco') || m.includes('preaprob')) return 'credito'
  if (m.includes('iva') || m.includes('27 bis') || m.includes('dfl2') || m.includes('impuesto') || m.includes('tribut')) return 'tributario'
  if (m.includes('paraguay') || m.includes('florida') || m.includes('orlando') || m.includes('miami') || m.includes('chile')) return 'pais'
  if (m.includes('humano') || m.includes('ejecutivo') || m.includes('asesor') || m.includes('luis') || m.includes('persona')) return 'humano'
  if (m.includes('no me interesa') || m.includes('no quiero') || m.includes('dejen de escribir') || m.includes('eliminar')) return 'no_interesado'
  if (m.includes('hola') || m.includes('buenas') || m.includes('buenos dias') || m.includes('buenos días') || m.includes('buenas tardes')) return 'saludo'
  return 'general'
}

function deriveLeadUpdateFromMessage(message = {}) {
  const text = String(message || '')
  const n = normalizeForCheck(text)
  const update = {}

  const income = parseMoneyToNumber(text)
  if (income) update.renta = formatCLP(income)

  if (n.includes('renta corta') || n.includes('airbnb') || n.includes('booking')) update.modelo = 'renta_corta'
  else if (n.includes('renta tradicional') || n.includes('arriendo tradicional')) update.modelo = 'renta_tradicional'
  else if (n.includes('vivir') || n.includes('habitacional')) update.modelo = 'vivir'
  else if (n.includes('retiro') || n.includes('jubilacion') || n.includes('jubilación')) update.modelo = 'retiro_inmobiliario'
  else if (n.includes('multicredito') || n.includes('multicrédito') || n.includes('varios departamentos')) update.modelo = 'multicredito'

  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  if (emailMatch) update.email = emailMatch[0]

  return onlyAllowedLeadUpdate(update)
}

function buildMemorySummary(leadData = {}, conversationHistory = []) {
  const all = conversationHistory.map(m => m.content).join(' \n ')
  const n = normalizeForCheck(all)
  const items = []

  if (leadData?.nombre) items.push(`Nombre conocido: ${leadData.nombre}`)
  if (leadData?.telefono) items.push(`Teléfono: ${leadData.telefono}`)
  if (leadData?.renta) items.push(`Renta ya informada: ${leadData.renta}`)
  if (leadData?.modelo) items.push(`Modelo/interés registrado: ${leadData.modelo}`)

  if (n.includes('renta corta') || n.includes('airbnb') || n.includes('booking')) items.push('Interés detectado: renta corta')
  if (n.includes('renta tradicional')) items.push('Interés detectado: renta tradicional')
  if (n.includes('iva') || n.includes('27 bis')) items.push('Tema detectado: recuperación de IVA / 27 bis')
  if (n.includes('dfl2')) items.push('Tema detectado: DFL2')
  if (n.includes('paraguay')) items.push('País detectado: Paraguay')
  if (n.includes('florida') || n.includes('miami') || n.includes('orlando')) items.push('País detectado: Florida / USA')
  if (n.includes('chile') || n.includes('santiago')) items.push('País/mercado detectado: Chile')
  if (n.includes('agendar') || n.includes('llamada') || n.includes('reunion')) items.push('El cliente ya mostró apertura a llamada/reunión')

  return [...new Set(items)].join('\n') || 'Sin memoria comercial suficiente todavía.'
}

function buildSafeFallback(message = '', leadData = {}, calendly = DEFAULT_CALENDLY, conversationHistory = []) {
  const intent = inferLocalIntent(message, conversationHistory)
  const name = getFirstName(leadData?.nombre)
  const saludo = name ? `${name}, ` : ''
  const calendarLine = calendly ? `\n${calendly}` : ''

  if (intent === 'acepta_agendar') {
    return `${saludo}perfecto. Agendemos y revisamos tu caso con números reales: renta, crédito, pie y proyectos que calcen contigo.${calendarLine}`.trim()
  }

  if (intent === 'afirmacion') {
    return `${saludo}buenísimo. Para avanzar bien, dime una cosa: ¿buscas invertir para renta corta, renta tradicional o comprar para vivir?`.trim()
  }

  if (intent === 'precio') {
    return `${saludo}depende del proyecto, entrega y estrategia. Para no tirarte un número al aire, ¿lo buscas para renta corta, renta tradicional o para vivir?`.trim()
  }

  if (intent === 'renta_corta') {
    return `${saludo}para renta corta hay que revisar edificio, reglamento, demanda real, costos y ocupación anual. ¿Estás mirando Santiago centro u otra comuna?`.trim()
  }

  if (intent === 'renta') {
    const income = parseMoneyToNumber(message)
    if (income >= 1500000) {
      return `${saludo}con ${formatCLP(income)} líquido ya podemos revisar alternativas. ¿Comprarías solo o complementarías renta con pareja/familia?`.trim()
    }
    return `${saludo}perfecto. Para orientarte bien, ¿esa renta es individual o estás pensando complementar con pareja/familia?`.trim()
  }

  if (intent === 'credito') {
    return `${saludo}lo clave es revisar renta, deuda actual, pie y timing de entrega. ¿Ya tienes preaprobación o aún no has evaluado crédito?`.trim()
  }

  if (intent === 'tributario') {
    return `${saludo}eso hay que estructurarlo bien, porque DFL2, IVA 27 bis y renta corta no aplican igual en todos los casos. ¿Ya tienes propiedades a tu nombre?`.trim()
  }

  if (intent === 'pais') {
    return `${saludo}trabajamos oportunidades en Chile y también alternativas internacionales como Florida y Paraguay. ¿Qué país te interesa evaluar primero?`.trim()
  }

  if (intent === 'humano') {
    return `${saludo}claro. Te dejo avanzado el diagnóstico y lo puede tomar el equipo. ¿Quieres que agendemos una llamada?${calendarLine}`.trim()
  }

  if (intent === 'no_interesado') {
    return `${saludo}perfecto, no te molesto más. Si más adelante quieres evaluar una inversión inmobiliaria con números reales, me escribes por acá.`.trim()
  }

  if (intent === 'saludo') {
    return `Hola${name ? ' ' + name : ''}. Soy Rabito de Rabbitts Capital. Para orientarte bien, ¿buscas invertir para renta corta, renta tradicional o comprar para vivir?`.trim()
  }

  return `${saludo}te entiendo. Para ayudarte bien necesito partir por esto: ¿estás buscando invertir para generar renta o comprar para vivir?`.trim()
}

function sanitizeConversationHistory(conversationHistory = []) {
  return (Array.isArray(conversationHistory) ? conversationHistory : [])
    .filter(item => item?.role && item?.content)
    .slice(-28)
    .map(item => {
      const role = item.role === 'assistant' ? 'assistant' : 'user'
      let content = cleanText(item.content)

      if (role === 'assistant' && containsForbiddenReply(content)) {
        content = 'Mensaje técnico omitido. Rabito continuó disponible y mantuvo la conversación comercial.'
      }

      return { role, content }
    })
    .filter(item => item.content)
}

function stripDuplicateGreeting(out = '', safeHistory = []) {
  const hasPreviousAssistant = safeHistory.some(m => m.role === 'assistant')
  if (!hasPreviousAssistant) return out

  return out
    .replace(/^hola\s+[a-záéíóúñ]+[,!\.\s]+/i, '')
    .replace(/^hola[,!\.\s]+/i, '')
    .trim()
}

function sanitizeFinalReply(reply = '', message = '', leadData = {}, calendly = DEFAULT_CALENDLY, conversationHistory = []) {
  let out = removeAgentMetadata(reply)
    .replace(/\*\*/g, '')
    .replace(/^[\s"']+|[\s"']+$/g, '')
    .trim()

  if (!out || containsForbiddenReply(out) || looksRobotic(out)) {
    out = buildSafeFallback(message, leadData, calendly, conversationHistory)
  }

  const replacements = [
    [/hola\s*👋\s*estoy con alta demanda.*$/gi, 'Hola. Estoy aquí. Cuéntame, ¿buscas invertir para renta corta, renta tradicional o comprar para vivir?'],
    [/estoy con alta demanda.*$/gi, 'Estoy aquí. Cuéntame qué estás buscando y te oriento.'],
    [/te respondo en unos minutos\.?/gi, 'te respondo ahora.'],
    [/soy una ia/gi, 'soy Rabito, el asistente comercial de Rabbitts Capital'],
    [/soy inteligencia artificial/gi, 'soy Rabito, el asistente comercial de Rabbitts Capital'],
    [/como modelo de lenguaje[^\.]*\.?/gi, ''],
    [/no tengo acceso[^\.]*\.?/gi, '']
  ]

  for (const [pattern, replacement] of replacements) {
    out = out.replace(pattern, replacement).trim()
  }

  if (containsForbiddenReply(out) || looksRobotic(out)) {
    out = buildSafeFallback(message, leadData, calendly, conversationHistory)
  }

  out = stripDuplicateGreeting(out, conversationHistory)

  // WhatsApp natural: máximo 5 líneas, máximo 850 caracteres.
  const lines = out.split('\n').map(line => line.trim()).filter(Boolean)
  if (lines.length > 5) out = lines.slice(0, 5).join('\n')
  if (out.length > 850) out = out.slice(0, 820).replace(/\s+\S*$/, '') + '...'

  return out.trim()
}

async function loadKnowledgeContext(iaConfig = {}) {
  const blocks = []

  if (Array.isArray(iaConfig.driveFiles) && iaConfig.driveFiles.length) {
    const txt = iaConfig.driveFiles
      .filter(file => file?.content || file?.text)
      .slice(0, 8)
      .map(file => `📄 ${file.name || 'Documento'}:\n${String(file.content || file.text || '').slice(0, 8000)}`)
      .join('\n\n───────────\n\n')
    if (txt) blocks.push('═══ DOCUMENTOS CARGADOS EN CONFIGURACIÓN ═══\n' + txt)
  }

  const SB_URL = cleanText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const SB_KEY = cleanText(process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  if (!SB_URL || !SB_KEY) return blocks.join('\n\n')

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(SB_URL, SB_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    const keys = ['drive_content', 'rabito_knowledge', 'ia_knowledge']
    const { data, error } = await sb
      .from('crm_settings')
      .select('key,value')
      .in('key', keys)

    if (error) {
      console.warn('[Agent] Knowledge config error:', error.message)
      return blocks.join('\n\n')
    }

    for (const row of data || []) {
      const value = row?.value
      if (!value) continue

      if (row.key === 'drive_content' && Array.isArray(value.files)) {
        const txt = value.files
          .slice(0, 10)
          .map(file => `📄 ${file.name || 'Documento'}:\n${String(file.content || '').slice(0, 9000)}`)
          .join('\n\n───────────\n\n')
        if (txt) blocks.push('═══ BASE DE CONOCIMIENTO INTERNA ═══\n' + txt)
      }

      if ((row.key === 'rabito_knowledge' || row.key === 'ia_knowledge') && Array.isArray(value.items)) {
        const txt = value.items
          .filter(item => item?.title || item?.content)
          .slice(0, 20)
          .map(item => `• ${item.title || 'Regla'}: ${String(item.content || '').slice(0, 2500)}`)
          .join('\n')
        if (txt) blocks.push(`═══ ${row.key.toUpperCase()} ═══\n${txt}`)
      }
    }
  } catch (error) {
    console.warn('[Agent] Knowledge error:', error.message)
  }

  return blocks.join('\n\n')
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
      max_tokens: 900,
      temperature: 0.38,
      system: systemPrompt,
      messages
    })
  })

  const text = await response.text()
  const data = safeJsonParse(text)

  if (!data) throw new Error(`Anthropic devolvió respuesta no JSON: ${text.slice(0, 180)}`)

  if (response.status === 529 || data?.error?.type === 'overloaded_error') {
    if (attempt <= 2) {
      await sleep(attempt * 1200)
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
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
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
  const data = safeJsonParse(textBody)

  if (!data) throw new Error(`Anthropic devolvió respuesta no JSON: ${textBody.slice(0, 180)}`)
  if (!response.ok || data?.error) throw new Error(data?.error?.message || 'Error extrayendo documento')

  const text = data?.content?.[0]?.text || ''
  console.log('[Agent] Extracted', text.length, 'chars from', fileName || 'documento')
  return text
}

function buildLeadContext(leadData = {}) {
  return [
    leadData.nombre ? `Nombre: ${leadData.nombre}` : 'Nombre: desconocido',
    leadData.telefono ? `Teléfono: ${leadData.telefono}` : '',
    leadData.renta ? `Renta declarada: ${leadData.renta}` : 'Renta: no informada',
    leadData.modelo ? `Modelo/interés: ${leadData.modelo}` : '',
    leadData.status ? `Estado conversación: ${leadData.status}` : ''
  ].filter(Boolean).join('\n')
}

function buildTrainingBlocks(iaConfig = {}) {
  if (!Array.isArray(iaConfig.entrenamiento)) return ''

  return iaConfig.entrenamiento
    .filter(item => item?.pregunta && item?.respuesta)
    .slice(0, 60)
    .map((item, index) => {
      let block = `[${index + 1}] SI EL CLIENTE PREGUNTA O DICE ALGO SIMILAR A: "${item.pregunta}"\nRESPONDE CON ESTA IDEA: "${item.respuesta}"`
      if (item.razon) block += `\nCONTEXTO: ${item.razon}`
      return block
    })
    .join('\n\n')
}

function getSystemPrompt({ iaConfig, calendly, rentaMin, rentaMinPareja, entrenamientoBlocks, knowledgeContext, memorySummary, leadData, currentIntent }) {
  const personalidad = cleanText(iaConfig.personalidad || 'Eres Rabito, asistente comercial de Rabbitts Capital Chile.')
  const guion = cleanText(iaConfig.guion)

  return `${personalidad}

═══ MODO RABITO — ESTILO VAMBE, PERO PARA RABBITTS ═══
Funcionas como un asistente comercial conversacional de WhatsApp: rápido, natural, con memoria de conversación y orientado a cerrar reunión. No das discursos. No pareces bot. Avanzas la conversación de forma simple.

No finjas ser Luis ni otra persona del equipo. Si preguntan qué eres, responde: "Soy Rabito, el asistente comercial de Rabbitts Capital". Si no preguntan, no lo menciones.

═══ OBJETIVO PRINCIPAL ═══
1. Entender si el cliente quiere invertir o comprar para vivir.
2. Detectar interés: renta corta, renta tradicional, plusvalía, retiro, Chile, Paraguay, Florida u otro.
3. Calificar con pocas preguntas: renta, pie/ahorros, comuna/país, timing y si compra solo o con renta complementaria.
4. Si existe interés real, llevar a llamada/reunión.
5. Mantener siempre la conversación activa. Nunca suenes caído, saturado o robótico.

═══ CRITERIOS DE CALIFICACIÓN ═══
Califica si cumple AL MENOS UNO:
- Renta individual igual o superior a $${rentaMin.toLocaleString('es-CL')} mensuales.
- Renta en pareja/familiar igual o superior a $${rentaMinPareja.toLocaleString('es-CL')} mensuales combinados.
- Tiene pie, ahorros o capacidad de inversión.
- Quiere comprar dentro de los próximos 6 meses.
- Pregunta por proyecto, precio, condiciones, crédito o rentabilidad.

No descartes rápido. Si falta información, pregunta solo una cosa.

═══ FLUJO COMERCIAL OBLIGATORIO ═══
${guion || `- Si saluda: responde cálido y pregunta objetivo.
- Si pregunta algo general: responde breve y termina con una pregunta útil.
- Si pregunta precio/proyecto: pide objetivo o comuna antes de dar números exactos si no están en contexto.
- Si dice "sí", "dale", "ok" o acepta avanzar: ofrece agendar.
- Si entrega renta o capacidad: valida y pregunta si compra solo o con renta complementaria.
- Si ya hay 3 mensajes positivos: invita a reunión.`}

═══ ESTILO HUMANO PARA WHATSAPP ═══
- Mensajes de 1 a 4 líneas.
- Máximo una pregunta por mensaje.
- Tono chileno, comercial, claro, cercano y seguro.
- No uses lenguaje corporativo pesado.
- No repitas exactamente respuestas anteriores.
- No hables como chatbot.
- No uses listas largas salvo que el cliente las pida.
- No prometas rentabilidades garantizadas.
- No inventes precios, stock ni condiciones si no están en contexto.
- Evita emojis. Solo usa uno si ayuda mucho y no se ve infantil.

═══ PROHIBIDO ABSOLUTO ═══
Nunca escribas ni insinúes:
- "alta demanda"
- "te respondo en unos minutos"
- "estoy ocupado"
- "no tengo acceso"
- "no puedo ayudarte"
- "soy una IA"
- "como modelo de lenguaje"
- "consulta con un profesional" como salida genérica
Si hay error, incertidumbre o falta información, respondes igual con una pregunta útil.

═══ CUÁNDO AGENDAR ═══
Usa esta URL cuando corresponda: ${calendly}
Invita con naturalidad, por ejemplo:
"Perfecto. Agendemos y revisamos tu caso con números reales: renta, crédito, pie y proyectos que calcen contigo.\n${calendly}"

═══ MEMORIA COMERCIAL DE ESTA CONVERSACIÓN ═══
${memorySummary}

═══ LEAD ACTUAL ═══
${buildLeadContext(leadData)}

Intención detectada localmente: ${currentIntent}
${knowledgeContext ? `\n${knowledgeContext}` : ''}

═══ ENTRENAMIENTO CARGADO EN CRM ═══
${entrenamientoBlocks || 'Sin entrenamiento específico cargado. Usa el criterio comercial Rabbitts.'}

═══ FORMATO INTERNO OBLIGATORIO ═══
Al final de tu respuesta agrega estas líneas internas. El cliente NO las verá:
[ACCION: calificado] si invitaste a reunión o el cliente cumple criterio.
[ACCION: escalar] si pide hablar con humano, reclamo o caso complejo.
[ACCION: no_interesado] si dice claramente que no quiere seguir.
[ACCION: conversando] si todavía estás calificando.

[DATOS: nombre=X, renta=X, modelo=X]
Solo usa datos realmente entregados por el cliente. Si no hay datos nuevos, usa X.`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' })

  const ANTHROPIC_KEY = cleanText(process.env.ANTHROPIC_KEY || process.env.VITE_ANTHROPIC_KEY)
  const ANTHROPIC_MODEL = cleanText(process.env.ANTHROPIC_MODEL || DEFAULT_MODEL)

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
      const text = await extractDocument({ anthropicKey: ANTHROPIC_KEY, file, mediaType, fileName })
      return res.status(200).json({ ok: true, text })
    } catch (error) {
      console.error('[Agent] Extract error:', error.message)
      return res.status(200).json({ ok: false, error: error.message, text: '' })
    }
  }

  if (!message) {
    return res.status(400).json({ ok: false, error: 'No message' })
  }

  const calendly = cleanText(iaConfig.calendlyLink || DEFAULT_CALENDLY)
  const rentaMin = Number(iaConfig.rentaMinima) || 1500000
  const rentaMinPareja = Number(iaConfig.rentaMinimaPareja) || 2000000
  const entrenamientoBlocks = buildTrainingBlocks(iaConfig)
  const safeHistory = sanitizeConversationHistory(conversationHistory)
  const currentIntent = inferLocalIntent(message, safeHistory)
  const localUpdate = deriveLeadUpdateFromMessage(message)
  const memorySummary = buildMemorySummary({ ...leadData, ...localUpdate }, [...safeHistory, { role: 'user', content: String(message) }])
  const knowledgeContext = await loadKnowledgeContext(iaConfig)

  const systemPrompt = getSystemPrompt({
    iaConfig,
    calendly,
    rentaMin,
    rentaMinPareja,
    entrenamientoBlocks,
    knowledgeContext,
    memorySummary,
    leadData: { ...leadData, ...localUpdate },
    currentIntent
  })

  const messages = [
    ...safeHistory,
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
    const finalReply = sanitizeFinalReply(parsed.reply, message, { ...leadData, ...localUpdate }, calendly, safeHistory)
    const leadUpdate = onlyAllowedLeadUpdate({ ...localUpdate, ...parsed.leadUpdate })

    let finalAction = parsed.action || 'conversando'
    if (currentIntent === 'no_interesado') finalAction = 'no_interesado'
    if (currentIntent === 'humano') finalAction = 'escalar'
    if (currentIntent === 'acepta_agendar') finalAction = 'calificado'

    console.log('[Agent] intent:', currentIntent, '| action:', finalAction, '| leadUpdate:', JSON.stringify(leadUpdate))

    return res.status(200).json({
      ok: true,
      reply: finalReply,
      action: finalAction,
      leadUpdate,
      memory: memorySummary
    })
  } catch (error) {
    console.error('[Agent] Error:', error?.stack || error?.message || error)

    return res.status(200).json({
      ok: true,
      reply: buildSafeFallback(message, { ...leadData, ...localUpdate }, calendly, safeHistory),
      action: currentIntent === 'humano' ? 'escalar' : currentIntent === 'no_interesado' ? 'no_interesado' : 'conversando',
      leadUpdate: localUpdate,
      fallback: true,
      error: error?.message || 'agent_error'
    })
  }
}
