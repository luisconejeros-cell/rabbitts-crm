// api/agent.js — Motor genérico de ventas guiado por Panel IA + Cerebro + Feedback
// No contiene guiones, productos, rubros ni conversaciones pregrabadas.
// El agente aprende desde: iaConfig, crm_settings, documentos/chunks, feedback y memoria por contacto.

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
  'te responderé después',
  'para avanzar bien, dime cuál es el dato principal que quieres resolver ahora',
  'para ayudarte bien necesito partir por esto'
]

const SAFE_ACTIONS = new Set(['conversando', 'calificado', 'escalar', 'no_interesado'])
const DENY_UPDATE_KEYS = new Set(['id', 'created_at', 'updated_at', 'password', 'token', 'secret', 'api_key', 'apikey', 'key'])

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
  return { reply: cleaned, action: 'conversando', leadUpdate: {}, memoryUpdate: {}, trace: {} }
}

function containsBlockedPhrase(text = '', extraBlocked = []) {
  const base = normalize(text)
  const blocked = [...SYSTEM_BLOCKED_PHRASES, ...extraBlocked]
  return blocked.some(phrase => phrase && base.includes(normalize(phrase)))
}

function sanitizeHistory(history = []) {
  return (Array.isArray(history) ? history : [])
    .filter(item => item && item.role && item.content)
    .slice(-50)
    .map(item => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: cleanText(item.content).slice(0, 2500)
    }))
    .filter(item => item.content)
}

function getRecentAssistantMessages(history = []) {
  return history
    .filter(item => item.role === 'assistant' && item.content)
    .slice(-10)
    .map(item => item.content)
}

function words(text = '') {
  return normalize(text)
    .split(/[^a-z0-9ñ]+/i)
    .filter(w => w.length > 2)
}

function similarity(a = '', b = '') {
  const aw = new Set(words(a).filter(w => w.length > 3))
  const bw = new Set(words(b).filter(w => w.length > 3))
  if (!aw.size || !bw.size) return 0
  let common = 0
  for (const word of aw) if (bw.has(word)) common++
  return common / Math.max(aw.size, bw.size)
}

function isTooSimilarToRecentAssistant(reply = '', history = []) {
  const recent = getRecentAssistantMessages(history)
  return recent.some(prev => similarity(reply, prev) >= 0.68)
}

function extractEmail(text = '') {
  const match = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return match ? match[0] : ''
}

function extractPhone(text = '') {
  const raw = String(text || '')
  const match = raw.match(/(?:\+?\d[\d\s().-]{7,}\d)/)
  return match ? match[0].replace(/[^+\d]/g, '') : ''
}

function parseAmount(text = '') {
  const raw = normalize(text).replace(/\$/g, '').replace(/\./g, '').replace(/,/g, '.')
  const million = raw.match(/\b(\d+(?:\.\d+)?)\s*(mm|millon|millones)\b/i)
  if (million) return Math.round(Number(million[1]) * 1000000)
  const thousand = raw.match(/\b(\d+(?:\.\d+)?)\s*(mil|k)\b/i)
  if (thousand) return Math.round(Number(thousand[1]) * 1000)
  const large = raw.match(/\b(\d{6,12})\b/)
  if (large) return Number(large[1])
  return 0
}

function formatAmount(value = 0) {
  const n = Number(value || 0)
  if (!n) return ''
  return '$' + n.toLocaleString('es-CL')
}

function inferGenericFields(message = '', leadData = {}, agendaLink = '') {
  const update = {}
  const email = extractEmail(message)
  const phone = extractPhone(message)
  const amount = parseAmount(message)
  if (email) update.email = email
  if (phone) update.telefono = phone
  if (amount) update.monto_detectado = formatAmount(amount)
  if (agendaLink) update.agenda_link = agendaLink

  for (const [k, v] of Object.entries(leadData || {})) {
    if (v && !DENY_UPDATE_KEYS.has(String(k).toLowerCase())) update[k] = v
  }
  return sanitizeObject(update)
}

function sanitizeObject(obj = {}, maxKeys = 40) {
  const out = {}
  for (const [rawKey, rawValue] of Object.entries(obj || {}).slice(0, maxKeys)) {
    const key = cleanText(rawKey).replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 60)
    if (!key || DENY_UPDATE_KEYS.has(key.toLowerCase())) continue
    if (rawValue == null || rawValue === '') continue
    if (typeof rawValue === 'object') {
      const txt = flattenConfigValue(rawValue).slice(0, 1200)
      if (txt) out[key] = txt
      continue
    }
    const value = cleanText(rawValue).slice(0, 1200)
    if (value && value.toLowerCase() !== 'null' && value.toLowerCase() !== 'undefined') out[key] = value
  }
  return out
}

function getAgendaLink(iaConfig = {}, settingsKnowledge = '') {
  const direct = cleanText(
    iaConfig.agendaLink ||
    iaConfig.linkAgenda ||
    iaConfig.urlAgenda ||
    iaConfig.calendlyLink ||
    process.env.DEFAULT_AGENDA_LINK ||
    ''
  )
  if (direct) return direct
  const match = String(settingsKnowledge || '').match(/https?:\/\/[^\s)\]"']+/i)
  return match ? match[0] : ''
}

function flattenConfigValue(value, depth = 0) {
  if (value == null || value === '') return ''
  if (depth > 4) return ''

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return cleanText(value)

  if (Array.isArray(value)) {
    return value
      .slice(0, 120)
      .map(item => flattenConfigValue(item, depth + 1))
      .filter(Boolean)
      .join('\n')
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => !['file', 'base64', 'image', 'logo', 'avatar', 'metaToken', 'apiKey', 'password'].includes(key))
      .slice(0, 120)
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
    'nombreAgente', 'assistantName', 'agentName', 'nombre',
    'personalidad', 'tono', 'rol', 'identidad',
    'oferta', 'productos', 'productosRabito', 'servicios', 'catalogo', 'promesa',
    'procesoVenta', 'pasos', 'pasosRabito', 'flujo', 'guion',
    'reglas', 'reglasRabito', 'reglasEntrenamiento', 'instrucciones', 'frasesProhibidas',
    'objeciones', 'objecionesRabito', 'faq', 'preguntasFrecuentes',
    'entrenamiento', 'respuestasGuardadas', 'cerebroDocs', 'documentos', 'driveFiles'
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
    if (['activo', 'enabled', 'createdAt', 'updatedAt', 'metaToken', 'metaVerifyToken'].includes(key)) continue
    const txt = flattenConfigValue(value)
    if (txt) blocks.push(`### ${key}\n${txt}`)
  }

  return blocks.join('\n\n').slice(0, 65000)
}

function conversationFacts(history = [], currentMessage = '', leadData = {}) {
  const userMsgs = [...history, { role: 'user', content: currentMessage }]
    .filter(m => m.role === 'user')
    .slice(-12)
    .map((m, i) => `Cliente ${i + 1}: ${cleanText(m.content).slice(0, 800)}`)

  const leadFacts = Object.entries(leadData || {})
    .filter(([, v]) => v)
    .slice(0, 30)
    .map(([k, v]) => `${k}: ${cleanText(v).slice(0, 500)}`)

  const full = [...userMsgs, ...leadFacts].join('\n')
  return full || 'Sin datos previos.'
}

function detectComplaint(message = '') {
  const n = normalize(message)
  return /(preguntas lo mismo|otra vez|de nuevo|a cada rato|no entiendes|no entendiste|estas repitiendo|estás repitiendo|loop|malo|penca|wn|weon|weón|funciona mal)/.test(n)
}

function detectHumanOrAgenda(message = '') {
  const n = normalize(message)
  return /(agenda|agendar|reunion|reunión|llamada|videollamada|humano|persona|asesor|ejecutivo|vendedor|link|calendario|horario|reservar|coordinar)/.test(n)
}

async function getSupabaseClient() {
  const SB_URL = cleanText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const SB_KEY = cleanText(process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  if (!SB_URL || !SB_KEY) return null
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function loadSettings(sb = null) {
  if (!sb) return { text: '', map: {} }
  const keys = ['ia_config', 'drive_content', 'rabito_knowledge', 'ia_knowledge', 'agent_knowledge', 'agent_training', 'agent_rules']
  try {
    const { data, error } = await sb.from('crm_settings').select('key,value').in('key', keys)
    if (error || !Array.isArray(data)) return { text: '', map: {} }
    const map = {}
    const text = data.map(row => {
      map[row.key] = row.value
      const value = flattenConfigValue(row.value)
      return value ? `### ${row.key}\n${value}` : ''
    }).filter(Boolean).join('\n\n').slice(0, 60000)
    return { text, map }
  } catch (_) {
    return { text: '', map: {} }
  }
}

async function loadFeedback(sb = null, query = '') {
  if (!sb) return { text: '', items: [] }
  const items = []

  try {
    const { data } = await sb.from('crm_conv_feedback')
      .select('msg_content,feedback,correction,created_at')
      .order('created_at', { ascending: false })
      .limit(120)
    if (Array.isArray(data)) items.push(...data.map(x => ({ source: 'crm_conv_feedback', ...x })))
  } catch (_) {}

  try {
    const { data } = await sb.from('crm_settings').select('value').eq('key', 'agent_training').single()
    const value = Array.isArray(data?.value) ? data.value : Array.isArray(data?.value?.items) ? data.value.items : []
    items.push(...value.map(x => ({ source: 'agent_training', msg_content: x.original || x.before || x.msg || '', correction: x.corrected || x.after || x.correction || x.regla || x.text || '', feedback: x.reason || x.razon || x.feedback || '', created_at: x.created_at || x.createdAt })))
  } catch (_) {}

  const ranked = items
    .filter(item => cleanText(item.correction) || cleanText(item.feedback))
    .map(item => ({ ...item, score: Math.max(similarity(query, item.msg_content || ''), similarity(query, item.feedback || ''), similarity(query, item.correction || '')) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 18)

  const text = ranked.map((item, idx) => {
    const original = cleanText(item.msg_content).slice(0, 450)
    const feedback = cleanText(item.feedback).slice(0, 450)
    const correction = cleanText(item.correction).slice(0, 900)
    return `Aprendizaje ${idx + 1}:\nSituación original: ${original || 'no especificada'}\nMotivo/regla: ${feedback || 'no especificado'}\nRespuesta o regla correcta: ${correction}`
  }).join('\n\n').slice(0, 35000)

  return { text, items: ranked }
}

async function loadMemory(sb = null, leadData = {}) {
  if (!sb) return ''
  const key = cleanText(leadData.telefono || leadData.phone || leadData.email || leadData.nombre || leadData.name)
  if (!key) return ''
  try {
    const { data, error } = await sb.from('crm_ai_memory')
      .select('value,updated_at')
      .eq('key', key)
      .order('updated_at', { ascending: false })
      .limit(1)
    if (error || !data?.length) return ''
    return flattenConfigValue(data[0].value).slice(0, 20000)
  } catch (_) { return '' }
}

async function saveMemory(sb = null, leadData = {}, memoryUpdate = {}) {
  if (!sb || !memoryUpdate || typeof memoryUpdate !== 'object') return
  const key = cleanText(leadData.telefono || leadData.phone || leadData.email || leadData.nombre || leadData.name)
  if (!key) return
  try {
    await sb.from('crm_ai_memory').upsert({ key, value: memoryUpdate, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  } catch (_) {}
}

function scoreChunk(query = '', chunk = {}) {
  const qWords = words(query).filter(w => w.length > 2)
  const txt = normalize([chunk.title, chunk.titulo, chunk.tags, chunk.producto, chunk.canal, chunk.content, chunk.contenido].filter(Boolean).join(' '))
  if (!qWords.length || !txt) return 0
  let score = 0
  for (const w of qWords) {
    if (txt.includes(w)) score += w.length > 4 ? 2 : 1
  }
  return score
}

async function retrieveKnowledge(sb = null, query = '', settingsText = '') {
  if (!sb) return { text: settingsText.slice(0, 25000), chunks: [] }
  let chunks = []

  try {
    const { data } = await sb.from('crm_knowledge_chunks')
      .select('id,doc_id,title,titulo,content,contenido,tags,producto,canal,activo,created_at')
      .or('activo.is.null,activo.eq.true')
      .limit(600)
    if (Array.isArray(data)) chunks = data
  } catch (_) {}

  if (!chunks.length) {
    return { text: settingsText.slice(0, 35000), chunks: [] }
  }

  const ranked = chunks
    .map(c => ({ ...c, _score: scoreChunk(query, c) }))
    .filter(c => c._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 8)

  const selected = ranked.length ? ranked : chunks.slice(0, 5)
  const text = selected.map((c, i) => {
    const title = cleanText(c.title || c.titulo || `Documento ${i + 1}`)
    const content = cleanText(c.content || c.contenido || '').slice(0, 2500)
    return `### Fragmento ${i + 1}: ${title}\n${content}`
  }).join('\n\n')

  return { text, chunks: selected.map(c => ({ id: c.id, doc_id: c.doc_id, title: c.title || c.titulo, score: c._score || 0 })) }
}

function buildSystemPrompt({ iaConfig, panelBrain, knowledgeText, feedbackText, storedMemory, facts, agendaLink, history, message }) {
  const agentName = cleanText(iaConfig.nombreAgente || iaConfig.assistantName || iaConfig.agentName || iaConfig.nombre || 'Asistente')
  const blockedExtra = flattenConfigValue(iaConfig.frasesProhibidas || iaConfig.blockedPhrases || '')
  const recentAssistant = getRecentAssistantMessages(history).map((m, i) => `${i + 1}. ${m}`).join('\n') || 'Sin mensajes previos.'
  const complaint = detectComplaint(message)
  const wantsAgenda = detectHumanOrAgenda(message)

  return `Eres ${agentName}. Eres un motor genérico de atención y ventas.

NO TIENES PRODUCTOS, RUBROS, GUIONES, PRECIOS, REQUISITOS NI PROCESOS PROPIOS DENTRO DEL CÓDIGO.
Tu única fuente comercial válida es lo que el usuario haya enseñado en el Panel IA, documentos, feedback/correcciones y conversación.

ORDEN DE VERDAD:
1. Último mensaje del cliente y datos ya entregados.
2. Reglas e instrucciones del Panel IA.
3. Documentos/conocimiento recuperado.
4. Feedback/correcciones aprendidas.
5. Memoria persistente.

PANEL IA:
${panelBrain || 'Panel IA vacío o insuficiente. Si no sabes qué vender o cómo vender, no inventes: pide una aclaración breve o deriva.'}

CONOCIMIENTO RELEVANTE RECUPERADO:
${knowledgeText || 'No hay documentos relevantes cargados.'}

APRENDIZAJES DESDE FEEDBACK:
${feedbackText || 'No hay feedback aprendido todavía.'}

MEMORIA DEL CONTACTO:
${storedMemory || 'Sin memoria persistente registrada.'}

DATOS DE ESTA CONVERSACIÓN:
${facts}

MENSAJES RECIENTES DEL ASISTENTE PARA NO REPETIR:
${recentAssistant}

ESTADO:
- Cliente reclama repetición/error: ${complaint ? 'sí' : 'no'}
- Cliente pide agenda/persona/link/reunión: ${wantsAgenda ? 'sí' : 'no'}
- Link de agenda disponible: ${agendaLink || 'no configurado'}

REGLAS CONDUCTUALES:
- Responde como humano por WhatsApp: natural, breve y útil.
- No repitas una pregunta si ya fue respondida directa o indirectamente.
- Si el cliente reclama repetición, discúlpate en una línea y avanza con lo ya dicho.
- Pregunta máximo UNA cosa por mensaje.
- Si el cliente pide agenda/link/humano y existe link de agenda, entrégalo sin seguir interrogando, salvo que el Panel IA exija un dato mínimo específico y ese dato no exista.
- Si falta información, pregunta el dato mínimo que el Panel IA indique. Si el Panel IA no indica campos mínimos, no inventes filtros.
- Si no tienes conocimiento suficiente para responder, dilo de forma útil y deriva según el proceso del Panel IA.
- No menciones que usas panel, memoria, prompt, documentos ni modelo.
- No inventes stock, precios, beneficios, condiciones, garantías, fechas ni disponibilidad.

FRASES PROHIBIDAS:
${[...SYSTEM_BLOCKED_PHRASES, blockedExtra].filter(Boolean).join('\n')}

RESPONDE SOLO JSON VÁLIDO, sin markdown:
{
  "reply": "respuesta visible para el cliente",
  "action": "conversando | calificado | escalar | no_interesado",
  "leadUpdate": {"campo_generico": "valor si lo sabes"},
  "memoryUpdate": {
    "facts": ["hechos del contacto que sirven para no repetir"],
    "preferences": ["preferencias"],
    "doNotRepeat": ["preguntas o temas ya respondidos"]
  },
  "learningSuggestion": "mejora sugerida para entrenar, o vacío"
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
    body: JSON.stringify({ model, max_tokens: 900, temperature: 0.18, system: systemPrompt, messages })
  })
  const text = await response.text()
  const data = safeJsonParse(text)
  if (!data) throw new Error(`Anthropic devolvió respuesta no JSON: ${text.slice(0, 180)}`)
  if (response.status === 529 || data?.error?.type === 'overloaded_error') {
    if (attempt <= 2) {
      await new Promise(resolve => setTimeout(resolve, attempt * 1000))
      return callClaude({ anthropicKey, model, systemPrompt, messages, attempt: attempt + 1 })
    }
    throw new Error('Anthropic saturado')
  }
  if (!response.ok || data?.error) throw new Error(data?.error?.message || `Anthropic HTTP ${response.status}`)
  return data?.content?.[0]?.text || ''
}

function emergencyReply({ iaConfig, message, agendaLink }) {
  if (detectHumanOrAgenda(message) && agendaLink) return `Dale, puedes agendar aquí:\n${agendaLink}`
  if (detectComplaint(message)) return 'Tienes razón, no voy a repetir lo mismo. Tomo lo anterior y avanzo desde ahí.'
  const hasPanel = !!buildPanelBrain(iaConfig)
  if (!hasPanel) return 'Estoy acá. Para responder bien, primero necesito que me enseñen qué debo vender y cómo debo venderlo en el Panel IA.'
  return 'Estoy acá. Revisemos esto paso a paso para ayudarte bien.'
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
    out = emergencyReply({ iaConfig, message, agendaLink })
  }

  out = out
    .replace(/\bcomo modelo de lenguaje\b/gi, '')
    .replace(/\bsoy una ia\b/gi, '')
    .replace(/\bsoy inteligencia artificial\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const maxLength = Number(iaConfig.maxCaracteresRespuesta || iaConfig.replyMaxLength || 700) || 700
  if (out.length > maxLength) out = out.slice(0, Math.max(120, maxLength - 30)).replace(/\s+\S*$/, '') + '...'
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
  if (!ANTHROPIC_KEY) return res.status(500).json({ ok: false, error: 'ANTHROPIC_KEY no configurada en Vercel' })

  const body = req.body || {}
  const { message, conversationHistory = [], iaConfig = {}, leadData = {}, action, file, mediaType, debug = false } = body

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
  const sb = await getSupabaseClient()
  const settings = await loadSettings(sb)
  const agendaLink = getAgendaLink(iaConfig, settings.text)
  const panelBrain = buildPanelBrain({ ...(settings.map.ia_config || {}), ...iaConfig })
  const facts = conversationFacts(safeHistory, message, leadData)
  const [feedback, memory, knowledge] = await Promise.all([
    loadFeedback(sb, [message, facts].join('\n')),
    loadMemory(sb, leadData),
    retrieveKnowledge(sb, [message, facts, panelBrain].join('\n'), settings.text)
  ])

  const localUpdate = inferGenericFields(message, leadData, agendaLink)
  const systemPrompt = buildSystemPrompt({
    iaConfig,
    panelBrain,
    knowledgeText: knowledge.text,
    feedbackText: feedback.text,
    storedMemory: memory,
    facts,
    agendaLink,
    history: safeHistory,
    message
  })

  const messages = [...safeHistory, { role: 'user', content: String(message) }]

  try {
    const rawText = await callClaude({ anthropicKey: ANTHROPIC_KEY, model: ANTHROPIC_MODEL, systemPrompt, messages })
    const parsed = parseAssistantJson(rawText)
    const reply = sanitizeReply(parsed.reply, { iaConfig, message, agendaLink, history: safeHistory })
    const actionOut = SAFE_ACTIONS.has(parsed.action) ? parsed.action : 'conversando'
    const leadUpdate = sanitizeObject({ ...localUpdate, ...(parsed.leadUpdate || {}) })

    await saveMemory(sb, leadData, parsed.memoryUpdate)

    return res.status(200).json({
      ok: true,
      reply,
      action: actionOut,
      leadUpdate,
      memory: parsed.memoryUpdate || {},
      learningSuggestion: cleanText(parsed.learningSuggestion || ''),
      trace: {
        panelUsed: !!panelBrain,
        agendaConfigured: !!agendaLink,
        feedbackUsed: feedback.items?.length || 0,
        knowledgeChunksUsed: knowledge.chunks?.length || 0,
        genericEngine: true,
        hardcodedBusiness: false,
        ...(debug ? { knowledgeChunks: knowledge.chunks } : {})
      }
    })
  } catch (error) {
    const reply = sanitizeReply('', { iaConfig, message, agendaLink, history: safeHistory })
    return res.status(200).json({
      ok: true,
      reply,
      action: detectHumanOrAgenda(message) && agendaLink ? 'escalar' : 'conversando',
      leadUpdate: localUpdate,
      fallback: true,
      error: error?.message || 'agent_error',
      trace: { genericEngine: true, fallback: true }
    })
  }
}
