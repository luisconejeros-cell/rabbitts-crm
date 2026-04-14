// api/agent.js — Rabito 100% guiado por el panel IA, conocimiento y feedback
// Backend puro para Vercel. No contiene guiones comerciales ni conversaciones pregrabadas.

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM_BLOCKED_PHRASES = [
  'alta demanda',
  'te respondo en unos minutos',
  'te respondo en algunos minutos',
  'estoy con alta demanda',
  'estoy ocupado',
  'estamos ocupados',
  'soy una ia',
  'soy inteligencia artificial',
  'como modelo de lenguaje',
  'no tengo acceso',
  'no puedo ayudarte',
  'responderé después',
  'te responderé después'
]

const SAFE_ACTIONS = new Set(['conversando', 'calificado', 'escalar', 'no_interesado'])
const SAFE_LEAD_KEYS = new Set([
  'nombre', 'email', 'telefono', 'renta', 'modelo', 'objetivo', 'ubicacion',
  'propiedades', 'experiencia', 'pie', 'agenda_link'
])

function cleanText(value = '') {
  return String(value ?? '').trim()
}

function normalize(text = '') {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function safeJsonParse(text, fallback = null) {
  try { return text ? JSON.parse(text) : fallback } catch (_) { return fallback }
}

function stripCodeFence(text = '') {
  return String(text || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim()
}

function parseAssistantJson(text = '') {
  const cleaned = stripCodeFence(text)
  const direct = safeJsonParse(cleaned)
  if (direct && typeof direct === 'object') return direct

  const match = cleaned.match(/\{[\s\S]*\}/)
  if (match) {
    const parsed = safeJsonParse(match[0])
    if (parsed && typeof parsed === 'object') return parsed
  }

  return { reply: cleaned, action: 'conversando', leadUpdate: {}, memoryUpdate: {} }
}

function containsBlockedPhrase(text = '', extraBlocked = []) {
  const base = normalize(text)
  const blocked = [...SYSTEM_BLOCKED_PHRASES, ...extraBlocked]
  return blocked.some(phrase => phrase && base.includes(normalize(phrase)))
}

function sanitizeHistory(history = []) {
  return (Array.isArray(history) ? history : [])
    .filter(item => item && item.role && item.content)
    .slice(-40)
    .map(item => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: cleanText(item.content)
    }))
    .filter(item => item.content)
}

function getRecentAssistantMessages(history = []) {
  return history
    .filter(item => item.role === 'assistant' && item.content)
    .slice(-8)
    .map(item => item.content)
}

function similarity(a = '', b = '') {
  const aw = new Set(normalize(a).split(/\W+/).filter(w => w.length > 3))
  const bw = new Set(normalize(b).split(/\W+/).filter(w => w.length > 3))
  if (!aw.size || !bw.size) return 0
  let common = 0
  for (const word of aw) if (bw.has(word)) common++
  return common / Math.max(aw.size, bw.size)
}

function isTooSimilarToRecentAssistant(reply = '', history = []) {
  const recent = getRecentAssistantMessages(history)
  return recent.some(prev => similarity(reply, prev) >= 0.72)
}

function extractEmail(text = '') {
  const match = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return match ? match[0] : ''
}

function formatCLP(value = 0) {
  const n = Number(value || 0)
  if (!n) return ''
  return '$' + n.toLocaleString('es-CL')
}

function parseMoney(text = '') {
  const raw = normalize(text).replace(/\$/g, '').replace(/\./g, '').replace(/,/g, '.')
  const million = raw.match(/\b(\d+(?:\.\d+)?)\s*(mm|millon|millones|m)\b/i)
  if (million) return Math.round(Number(million[1]) * 1000000)
  const thousand = raw.match(/\b(\d+(?:\.\d+)?)\s*(mil|k)\b/i)
  if (thousand) return Math.round(Number(thousand[1]) * 1000)
  const large = raw.match(/\b(\d{6,8})\b/)
  if (large) return Number(large[1])
  const contextual = raw.match(/\b(\d{3,5})\b/)
  if (contextual && /(gano|renta|sueldo|ingreso|mensual|liquido|liquida|capital|presupuesto|pie|ahorro)/.test(raw)) {
    const n = Number(contextual[1])
    if (n >= 100 && n <= 99999) return n * 1000
  }
  return 0
}

function deriveMinimalLeadUpdate(message = '', leadData = {}, agendaLink = '') {
  const update = {}
  const email = extractEmail(message)
  if (email) update.email = email

  const amount = parseMoney(message)
  if (amount) update.renta = formatCLP(amount)

  if (leadData?.telefono) update.telefono = cleanText(leadData.telefono)
  if (leadData?.nombre) update.nombre = cleanText(leadData.nombre)
  if (agendaLink) update.agenda_link = agendaLink

  return filterLeadUpdate(update)
}

function filterLeadUpdate(update = {}) {
  const out = {}
  for (const [key, value] of Object.entries(update || {})) {
    if (!SAFE_LEAD_KEYS.has(key)) continue
    const v = cleanText(value)
    if (v && v.toLowerCase() !== 'x' && v.toLowerCase() !== 'null') out[key] = v
  }
  return out
}

function getAgendaLink(iaConfig = {}) {
  return cleanText(
    iaConfig.agendaLink ||
    iaConfig.linkAgenda ||
    iaConfig.urlAgenda ||
    iaConfig.calendlyLink ||
    process.env.DEFAULT_AGENDA_LINK ||
    ''
  )
}

function flattenConfigValue(value, depth = 0) {
  if (value == null || value === '') return ''
  if (depth > 3) return ''

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return cleanText(value)
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 80)
      .map(item => flattenConfigValue(item, depth + 1))
      .filter(Boolean)
      .join('\n')
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => !['file', 'base64', 'image', 'logo', 'avatar'].includes(key))
      .slice(0, 80)
      .map(([key, val]) => {
        const inner = flattenConfigValue(val, depth + 1)
        return inner ? `${key}: ${inner}` : ''
      })
      .filter(Boolean)
      .join('\n')
  }

  return ''
}

function buildPanelBrain(iaConfig = {}) {
  const preferredOrder = [
    'nombreAgente', 'assistantName', 'personalidad', 'tono', 'rol',
    'productosRabito', 'productos', 'catalogo', 'servicios', 'oferta',
    'pasosRabito', 'pasos', 'procesoVenta', 'flujo', 'guion',
    'reglasRabito', 'reglas', 'reglasEntrenamiento', 'instrucciones',
    'objecionesRabito', 'objeciones', 'faq', 'preguntasFrecuentes',
    'entrenamiento', 'respuestasGuardadas', 'documentos', 'driveFiles'
  ]

  const used = new Set()
  const blocks = []

  for (const key of preferredOrder) {
    if (!(key in iaConfig)) continue
    used.add(key)
    const value = flattenConfigValue(iaConfig[key])
    if (value) blocks.push(`### ${key}\n${value}`)
  }

  for (const [key, value] of Object.entries(iaConfig || {})) {
    if (used.has(key)) continue
    if (['activo', 'enabled', 'createdAt', 'updatedAt'].includes(key)) continue
    const txt = flattenConfigValue(value)
    if (txt) blocks.push(`### ${key}\n${txt}`)
  }

  return blocks.join('\n\n').slice(0, 70000)
}

function summarizeConversationFacts(history = [], currentMessage = '', leadData = {}) {
  const facts = []
  const messages = [...history, { role: 'user', content: currentMessage }]

  if (leadData?.nombre) facts.push(`Nombre registrado: ${leadData.nombre}`)
  if (leadData?.telefono) facts.push(`Teléfono registrado: ${leadData.telefono}`)
  if (leadData?.email) facts.push(`Email registrado: ${leadData.email}`)
  if (leadData?.renta) facts.push(`Renta/presupuesto registrado: ${leadData.renta}`)
  if (leadData?.modelo) facts.push(`Modelo/interés registrado: ${leadData.modelo}`)
  if (leadData?.objetivo) facts.push(`Objetivo registrado: ${leadData.objetivo}`)
  if (leadData?.ubicacion) facts.push(`Ubicación registrada: ${leadData.ubicacion}`)

  const fullUserText = messages
    .filter(m => m.role === 'user')
    .map(m => m.content)
    .join('\n')

  const email = extractEmail(fullUserText)
  if (email) facts.push(`Email mencionado en conversación: ${email}`)
  const money = parseMoney(fullUserText)
  if (money) facts.push(`Monto/renta/presupuesto mencionado: ${formatCLP(money)}`)

  const lastUserMessages = messages
    .filter(m => m.role === 'user')
    .slice(-8)
    .map(m => `Cliente: ${cleanText(m.content).slice(0, 500)}`)

  return [...facts, ...lastUserMessages].filter(Boolean).join('\n') || 'Sin datos consolidados.'
}

function detectUserComplaint(message = '') {
  const n = normalize(message)
  return /(preguntas lo mismo|otra vez|de nuevo|a cada rato|no entiendes|eres penca|malo|wn|weon|weón|funciona mal)/.test(n)
}

function detectUserWantsHumanOrAgenda(message = '') {
  const n = normalize(message)
  return /(agenda|agendar|reunion|reunión|llamada|humano|persona|asesor|ejecutivo|link|calendario|horario)/.test(n)
}

async function getSupabaseClient() {
  const SB_URL = cleanText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const SB_KEY = cleanText(process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  if (!SB_URL || !SB_KEY) return null

  const { createClient } = await import('@supabase/supabase-js')
  return createClient(SB_URL, SB_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

async function loadSettingsKnowledge(sb = null) {
  if (!sb) return ''

  const keys = [
    'ia_config',
    'drive_content',
    'rabito_knowledge',
    'ia_knowledge',
    'agent_knowledge',
    'agent_training',
    'agent_rules'
  ]

  try {
    const { data, error } = await sb.from('crm_settings').select('key,value').in('key', keys)
    if (error || !Array.isArray(data)) return ''

    return data
      .map(row => {
        const value = flattenConfigValue(row.value)
        return value ? `### ${row.key}\n${value}` : ''
      })
      .filter(Boolean)
      .join('\n\n')
      .slice(0, 70000)
  } catch (_) {
    return ''
  }
}

async function loadFeedbackLearnings(sb = null) {
  if (!sb) return ''

  try {
    const { data, error } = await sb
      .from('crm_conv_feedback')
      .select('msg_content,feedback,correction,created_at')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error || !Array.isArray(data)) return ''

    return data
      .filter(item => cleanText(item.correction) || cleanText(item.feedback))
      .map((item, idx) => {
        const original = cleanText(item.msg_content).slice(0, 450)
        const correction = cleanText(item.correction || item.feedback).slice(0, 700)
        return `Aprendizaje ${idx + 1}: cuando ocurra algo parecido a "${original}", aplicar esta corrección: "${correction}"`
      })
      .join('\n')
      .slice(0, 50000)
  } catch (_) {
    return ''
  }
}

async function loadConversationMemory(sb = null, leadData = {}) {
  if (!sb) return ''
  const key = cleanText(leadData.telefono || leadData.email || leadData.nombre)
  if (!key) return ''

  try {
    const { data, error } = await sb
      .from('crm_ai_memory')
      .select('value,updated_at')
      .eq('key', key)
      .order('updated_at', { ascending: false })
      .limit(1)

    if (error || !data?.length) return ''
    return flattenConfigValue(data[0].value).slice(0, 20000)
  } catch (_) {
    return ''
  }
}

async function saveConversationMemory(sb = null, leadData = {}, memoryUpdate = {}) {
  if (!sb || !memoryUpdate || typeof memoryUpdate !== 'object') return
  const key = cleanText(leadData.telefono || leadData.email || leadData.nombre)
  if (!key) return

  try {
    await sb.from('crm_ai_memory').upsert({
      key,
      value: memoryUpdate,
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' })
  } catch (_) {
    // La tabla es opcional. Si no existe, el agente sigue funcionando.
  }
}

function buildSystemPrompt({ iaConfig, panelBrain, settingsKnowledge, feedbackLearnings, storedMemory, conversationFacts, agendaLink, history, message }) {
  const agentName = cleanText(iaConfig.nombreAgente || iaConfig.assistantName || iaConfig.agentName || 'Rabito')
  const blockedExtra = flattenConfigValue(iaConfig.frasesProhibidas || iaConfig.blockedPhrases || '')
  const recentAssistant = getRecentAssistantMessages(history).map((m, i) => `${i + 1}. ${m}`).join('\n') || 'Sin mensajes previos del asistente.'
  const complaint = detectUserComplaint(message)
  const wantsAgenda = detectUserWantsHumanOrAgenda(message)

  return `Eres ${agentName}. Tu comportamiento se define SOLO por el panel de IA, la base de conocimiento, el feedback aprendido y la conversación actual.

REGLA PRINCIPAL:
No tienes un guion comercial fijo dentro del código. No vendas propiedades, seguros, cursos, software ni ningún producto específico a menos que eso esté explícitamente enseñado en el panel, conocimiento o conversación.

FUENTES DE VERDAD, EN ESTE ORDEN:
1. Mensaje actual del cliente.
2. Datos ya dichos en la conversación.
3. Panel de IA.
4. Base de conocimiento/documentos.
5. Feedback y correcciones aprendidas.
6. Memoria persistente, si existe.

PANEL DE IA:
${panelBrain || 'El panel no tiene instrucciones suficientes. Debes pedir una aclaración breve y útil.'}

BASE DE CONOCIMIENTO Y CONFIGURACIÓN GUARDADA:
${settingsKnowledge || 'Sin conocimiento adicional cargado.'}

FEEDBACK Y CORRECCIONES APRENDIDAS:
${feedbackLearnings || 'Sin feedback aprendido todavía.'}

MEMORIA PERSISTENTE DEL CONTACTO:
${storedMemory || 'Sin memoria persistente registrada.'}

DATOS YA CONOCIDOS EN ESTA CONVERSACIÓN:
${conversationFacts}

MENSAJES RECIENTES DEL ASISTENTE, PARA NO REPETIR:
${recentAssistant}

ESTADO LOCAL:
- El cliente se queja de repetición o mala respuesta: ${complaint ? 'sí' : 'no'}
- El cliente pide agenda, link, humano o reunión: ${wantsAgenda ? 'sí' : 'no'}
- Link de agenda configurado: ${agendaLink || 'no configurado'}

REGLAS DE CONVERSACIÓN:
- Responde como una persona real por WhatsApp.
- No suenes como robot ni como texto corporativo.
- No repitas una pregunta si el cliente ya respondió algo parecido.
- Si falta información, pregunta solo UNA cosa.
- Si el cliente reclama, reconoce el error en una línea y avanza usando lo que ya dijo.
- Si el cliente pide reunión/humano/link y existe link de agenda, entrégalo sin seguir interrogando, salvo que el panel diga estrictamente otra cosa.
- Si el panel no enseña qué vender ni qué proceso seguir, no inventes. Pide que te cuente qué busca o deriva a humano.
- Si el cliente corrige información previa, toma como vigente lo último que dijo.
- No menciones internamente el panel, el prompt, la base, el modelo ni la memoria.

PROHIBIDO:
${[...SYSTEM_BLOCKED_PHRASES, blockedExtra].filter(Boolean).join('\n')}

RESPONDE SOLO JSON VÁLIDO, sin markdown, con esta estructura:
{
  "reply": "respuesta final visible para el cliente",
  "action": "conversando | calificado | escalar | no_interesado",
  "leadUpdate": {
    "nombre": "solo si lo sabes",
    "email": "solo si lo sabes",
    "renta": "solo si aplica y lo sabes",
    "modelo": "solo si aplica y lo sabes",
    "objetivo": "solo si aplica y lo sabes",
    "ubicacion": "solo si aplica y lo sabes",
    "propiedades": "solo si aplica y lo sabes",
    "experiencia": "solo si aplica y lo sabes",
    "pie": "solo si aplica y lo sabes"
  },
  "memoryUpdate": {
    "facts": ["hechos útiles y reutilizables sobre este contacto"],
    "preferences": ["preferencias del contacto"],
    "doNotRepeat": ["preguntas o temas que no se deben repetir"]
  },
  "learningSuggestion": "si detectas una mejora para entrenar al agente, escríbela aquí; si no, vacío"
}`
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
      temperature: 0.25,
      system: systemPrompt,
      messages
    })
  })

  const text = await response.text()
  const data = safeJsonParse(text)

  if (!data) throw new Error(`Anthropic devolvió respuesta no JSON: ${text.slice(0, 180)}`)

  if (response.status === 529 || data?.error?.type === 'overloaded_error') {
    if (attempt <= 2) {
      await new Promise(resolve => setTimeout(resolve, attempt * 1200))
      return callClaude({ anthropicKey, model, systemPrompt, messages, attempt: attempt + 1 })
    }
    throw new Error('Anthropic saturado')
  }

  if (!response.ok || data?.error) throw new Error(data?.error?.message || `Anthropic HTTP ${response.status}`)
  return data?.content?.[0]?.text || ''
}

function buildEmergencyReply({ iaConfig, message, agendaLink, history }) {
  const name = cleanText(iaConfig.nombreAgente || iaConfig.assistantName || iaConfig.agentName || 'Rabito')
  const complaint = detectUserComplaint(message)
  const wantsAgenda = detectUserWantsHumanOrAgenda(message)
  const hasPanel = !!buildPanelBrain(iaConfig)

  if (wantsAgenda && agendaLink) {
    return `Dale, avancemos por reunión para verlo bien. Agenda aquí:\n${agendaLink}`
  }

  if (complaint) {
    return 'Tienes razón, no te voy a repetir lo mismo. Tomo lo que ya me dijiste y avancemos desde ahí. ¿Qué quieres resolver ahora?'
  }

  if (!hasPanel) {
    return `Estoy aquí. Para responder bien, necesito que primero me enseñen en el panel qué debe vender ${name} y qué proceso debe seguir.`
  }

  const lastUser = [...history, { role: 'user', content: message }]
    .filter(m => m.role === 'user')
    .slice(-1)[0]?.content || ''

  return `Entiendo. Sobre eso: ${cleanText(lastUser).slice(0, 120)}. Cuéntame el dato clave que falta para orientarte mejor.`
}

function sanitizeReply(reply = '', { iaConfig = {}, message = '', agendaLink = '', history = [] } = {}) {
  const extraBlocked = Array.isArray(iaConfig.frasesProhibidas)
    ? iaConfig.frasesProhibidas
    : String(iaConfig.frasesProhibidas || '').split('\n')

  let out = cleanText(reply)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .replace(/\*\*/g, '')
    .trim()

  if (!out || containsBlockedPhrase(out, extraBlocked) || isTooSimilarToRecentAssistant(out, history)) {
    out = buildEmergencyReply({ iaConfig, message, agendaLink, history })
  }

  out = out
    .replace(/\bcomo modelo de lenguaje\b/gi, '')
    .replace(/\bsoy una ia\b/gi, '')
    .replace(/\bsoy inteligencia artificial\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const maxLength = Number(iaConfig.maxCaracteresRespuesta || iaConfig.replyMaxLength || 900) || 900
  if (out.length > maxLength) out = out.slice(0, Math.max(120, maxLength - 40)).replace(/\s+\S*$/, '') + '...'

  return out
}

async function extractDocument({ anthropicKey, file, mediaType }) {
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
          { type: 'text', text: 'Extrae y devuelve TODO el texto de este documento exactamente como aparece, sin resumir.' }
        ]
      }]
    })
  })

  const textBody = await response.text()
  const data = safeJsonParse(textBody)
  if (!data) throw new Error(`Anthropic devolvió respuesta no JSON: ${textBody.slice(0, 180)}`)
  if (!response.ok || data?.error) throw new Error(data?.error?.message || 'Error extrayendo documento')
  return data?.content?.[0]?.text || ''
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
    mediaType
  } = body

  if (action === 'extract' && file) {
    try {
      const text = await extractDocument({ anthropicKey: ANTHROPIC_KEY, file, mediaType })
      return res.status(200).json({ ok: true, text })
    } catch (error) {
      return res.status(200).json({ ok: false, error: error.message, text: '' })
    }
  }

  if (!message) return res.status(400).json({ ok: false, error: 'No message' })

  const safeHistory = sanitizeHistory(conversationHistory)
  const agendaLink = getAgendaLink(iaConfig)
  const sb = await getSupabaseClient()

  const [settingsKnowledge, feedbackLearnings, storedMemory] = await Promise.all([
    loadSettingsKnowledge(sb),
    loadFeedbackLearnings(sb),
    loadConversationMemory(sb, leadData)
  ])

  const panelBrain = buildPanelBrain(iaConfig)
  const conversationFacts = summarizeConversationFacts(safeHistory, message, leadData)
  const leadUpdateFromMessage = deriveMinimalLeadUpdate(message, leadData, agendaLink)

  const systemPrompt = buildSystemPrompt({
    iaConfig,
    panelBrain,
    settingsKnowledge,
    feedbackLearnings,
    storedMemory,
    conversationFacts,
    agendaLink,
    history: safeHistory,
    message
  })

  const messages = [
    ...safeHistory,
    { role: 'user', content: String(message) }
  ]

  try {
    const rawText = await callClaude({
      anthropicKey: ANTHROPIC_KEY,
      model: ANTHROPIC_MODEL,
      systemPrompt,
      messages
    })

    const parsed = parseAssistantJson(rawText)
    const finalReply = sanitizeReply(parsed.reply, { iaConfig, message, agendaLink, history: safeHistory })
    const actionOut = SAFE_ACTIONS.has(parsed.action) ? parsed.action : 'conversando'
    const leadUpdate = filterLeadUpdate({ ...leadUpdateFromMessage, ...(parsed.leadUpdate || {}) })

    await saveConversationMemory(sb, leadData, parsed.memoryUpdate)

    return res.status(200).json({
      ok: true,
      reply: finalReply,
      action: actionOut,
      leadUpdate,
      memory: parsed.memoryUpdate || {},
      learningSuggestion: cleanText(parsed.learningSuggestion || '')
    })
  } catch (error) {
    const fallbackReply = sanitizeReply('', { iaConfig, message, agendaLink, history: safeHistory })

    return res.status(200).json({
      ok: true,
      reply: fallbackReply,
      action: detectUserWantsHumanOrAgenda(message) && agendaLink ? 'escalar' : 'conversando',
      leadUpdate: leadUpdateFromMessage,
      fallback: true,
      error: error?.message || 'agent_error'
    })
  }
}
