// api/agent.js — Motor genérico de ventas guiado 100% por Panel IA + Cerebro + Feedback
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

function extractJsonBlock(text = '') {
  const src = stripCodeFence(text)
  const start = src.indexOf('{')
  if (start < 0) return ''
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < src.length; i++) {
    const ch = src[i]
    if (inString) {
      if (escaped) { escaped = false; continue }
      if (ch === '\\') { escaped = true; continue }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  return ''
}

function jsonStringValueFromKey(text = '', key = 'reply') {
  const src = String(text || '')
  const rx = new RegExp('"' + key + '"\\s*:\\s*"', 'i')
  const m = rx.exec(src)
  if (!m) return ''
  let i = m.index + m[0].length
  let out = ''
  let escaped = false
  for (; i < src.length; i++) {
    const ch = src[i]
    if (escaped) {
      out += '\\' + ch
      escaped = false
      continue
    }
    if (ch === '\\') { escaped = true; continue }
    if (ch === '"') break
    out += ch
  }
  try { return JSON.parse('"' + out + '"') } catch (_) { return out.replace(/\\n/g, '\n').replace(/\\"/g, '"') }
}

function normalizeAssistantObject(obj, raw = '') {
  if (!obj || typeof obj !== 'object') {
    const reply = jsonStringValueFromKey(raw, 'reply') || cleanText(raw)
    return { reply, action: 'conversando', leadUpdate: {}, memoryUpdate: {}, trace: {} }
  }

  if (typeof obj.reply === 'string') {
    const nestedText = stripCodeFence(obj.reply)
    if (nestedText.trim().startsWith('{')) {
      const nested = safeJsonParse(nestedText) || safeJsonParse(extractJsonBlock(nestedText))
      if (nested && typeof nested === 'object' && nested.reply) {
        return { ...obj, ...nested, reply: nested.reply }
      }
      const innerReply = jsonStringValueFromKey(nestedText, 'reply')
      if (innerReply) obj.reply = innerReply
    }
  } else if (obj.reply && typeof obj.reply === 'object') {
    const nested = obj.reply
    obj = { ...obj, ...nested, reply: nested.reply || nested.text || nested.message || '' }
  }

  return {
    reply: cleanText(obj.reply || obj.message || obj.text || ''),
    action: cleanText(obj.action || 'conversando'),
    escalateToHuman: obj.escalateToHuman === true || obj.derivarHumano === true || obj.human === true,
    statusUpdate: cleanText(obj.statusUpdate || obj.status || ''),
    derivationReason: cleanText(obj.derivationReason || ''),
    leadUpdate: obj.leadUpdate && typeof obj.leadUpdate === 'object' ? obj.leadUpdate : {},
    memoryUpdate: obj.memoryUpdate && typeof obj.memoryUpdate === 'object' ? obj.memoryUpdate : {},
    learningSuggestion: cleanText(obj.learningSuggestion || '')
  }
}

function parseAssistantJson(text = '') {
  const cleaned = stripCodeFence(text)
  const direct = safeJsonParse(cleaned)
  if (direct && typeof direct === 'object') return normalizeAssistantObject(direct, cleaned)

  const block = extractJsonBlock(cleaned)
  if (block) {
    const parsed = safeJsonParse(block)
    if (parsed && typeof parsed === 'object') return normalizeAssistantObject(parsed, cleaned)
  }

  const replyFromJsonish = jsonStringValueFromKey(cleaned, 'reply')
  if (replyFromJsonish) return normalizeAssistantObject({ reply: replyFromJsonish }, cleaned)
  if (cleaned.trim().startsWith('{')) return normalizeAssistantObject({ reply: '' }, cleaned)
  return normalizeAssistantObject({ reply: cleaned }, cleaned)
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
  const keys = ['ia_config', 'drive_content', 'rabito_knowledge', 'rabito_knowledge_chunks', 'ia_knowledge', 'agent_knowledge', 'agent_training', 'agent_rules']
  try {
    const { data, error } = await sb.from('crm_settings').select('key,value').in('key', keys)
    if (error || !Array.isArray(data)) return { text: '', map: {} }
    const map = {}
    const text = data.map(row => {
      map[row.key] = row.value
      const value = flattenConfigValue(row.value)
      return value ? `### ${row.key}\n${value}` : ''
    }).filter(Boolean).join('\n\n').slice(0, 35000)
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
    items.push(...value
      .filter(x => x && x.active !== false)
      .map(x => ({
        source: 'agent_training',
        msg_content: x.context || x.original || x.before || x.msg || x.situation || '',
        correction: x.improved || x.corrected || x.after || x.correction || x.regla || x.rule || x.text || '',
        feedback: x.reason || x.razon || x.feedback || x.explanation || '',
        created_at: x.created_at || x.createdAt
      })))
  } catch (_) {}

  const ranked = items
    .filter(item => cleanText(item.correction) || cleanText(item.feedback))
    .map(item => ({ ...item, score: Math.max(similarity(query, item.msg_content || ''), similarity(query, item.feedback || ''), similarity(query, item.correction || '')) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

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

async function retrieveKnowledge(sb = null, query = '', settingsText = '', settingsMap = {}) {
  let chunks = []

  // 1) Tabla nueva, si existe.
  if (sb) {
    try {
      const { data } = await sb.from('crm_knowledge_chunks')
        .select('id,doc_id,title,titulo,content,contenido,tags,producto,canal,activo,created_at')
        .or('activo.is.null,activo.eq.true')
        .limit(250)
      if (Array.isArray(data)) chunks.push(...data)
    } catch (_) {}
  }

  // 2) Fallback real del Panel IA: los chunks se guardan hoy en crm_settings.rabito_knowledge_chunks.
  const settingsChunks = Array.isArray(settingsMap?.rabito_knowledge_chunks?.chunks)
    ? settingsMap.rabito_knowledge_chunks.chunks
    : Array.isArray(settingsMap?.rabito_knowledge_chunks)
      ? settingsMap.rabito_knowledge_chunks
      : []

  if (settingsChunks.length) {
    chunks.push(...settingsChunks.map((c, idx) => ({
      id: c.id || `settings-chunk-${idx}`,
      doc_id: c.doc_id || c.docId || c.documentId || c.docName || c.nombre || 'settings-doc',
      title: c.title || c.titulo || c.docName || c.nombre || c.carpeta || 'Documento del panel',
      content: c.content || c.contenido || c.text || '',
      tags: c.tags || [c.carpeta, c.categoria].filter(Boolean).join(' '),
      producto: c.producto || c.categoria || '',
      canal: c.canal || '',
      activo: c.activo !== false,
      created_at: c.created_at || c.createdAt
    })))
  }

  const seen = new Set()
  chunks = chunks
    .filter(c => c && c.activo !== false && cleanText(c.content || c.contenido))
    .filter(c => {
      const key = `${c.doc_id || ''}-${c.id || ''}-${cleanText(c.content || c.contenido).slice(0, 120)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

  if (!chunks.length) {
    return { text: settingsText.slice(0, 35000), chunks: [] }
  }

  const ranked = chunks
    .map(c => ({ ...c, _score: scoreChunk(query, c) }))
    .sort((a, b) => b._score - a._score)

  const selected = ranked.filter(c => c._score > 0).slice(0, 6)
  const finalSelected = selected.length ? selected : ranked.slice(0, 4)

  const text = finalSelected.map((c, i) => {
    const title = cleanText(c.title || c.titulo || c.docName || `Documento ${i + 1}`)
    const content = cleanText(c.content || c.contenido || '').slice(0, 1800)
    return `### Fragmento ${i + 1}: ${title}\n${content}`
  }).join('\n\n').slice(0, 35000)

  return { text, chunks: finalSelected.map(c => ({ id: c.id, doc_id: c.doc_id, title: c.title || c.titulo, score: c._score || 0 })) }
}

function buildSystemPrompt({ iaConfig, panelBrain, knowledgeText, feedbackText, storedMemory, facts, agendaLink, history, message }) {
  const agentName = cleanText(iaConfig.nombreAgente || iaConfig.assistantName || iaConfig.agentName || iaConfig.nombre || 'Asistente')
  const blockedExtra = flattenConfigValue(iaConfig.frasesProhibidas || iaConfig.blockedPhrases || '')
  const recentAssistant = getRecentAssistantMessages(history).map((m, i) => `${i + 1}. ${m}`).join('\n') || 'Sin mensajes previos.'
  const derivationRulesText = getDerivationRulesText(iaConfig)
  const derivationRulesEnabled = hasExplicitDerivationRules(iaConfig)
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
- Reglas duras de derivación configuradas: ${derivationRulesEnabled ? 'sí' : 'no'}

REGLAS DURAS DE DERIVACIÓN / REVISIÓN DESDE PANEL IA:
${derivationRulesText || 'No hay reglas duras de derivación configuradas.'}

REGLAS CONDUCTUALES:
- Responde como humano por WhatsApp: natural, breve y útil.
- No repitas una pregunta si ya fue respondida directa o indirectamente.
- Si el cliente reclama repetición, discúlpate en una línea y avanza con lo ya dicho.
- Pregunta máximo UNA cosa por mensaje.
- Si el cliente pide agenda/link/humano y existe link de agenda, entrégalo sin seguir interrogando, salvo que el Panel IA exija un dato mínimo específico y ese dato no exista.
- Si falta información, pregunta el dato mínimo que el Panel IA indique. Si el Panel IA no indica campos mínimos, no inventes filtros.
- Si no tienes conocimiento suficiente para responder, usa el proceso indicado en el Panel IA. Si el Panel IA no indica proceso, pide una aclaración breve sin inventar.
- No puedes derivar a humano ni marcar revisión por iniciativa propia. Solo puedes hacerlo si las REGLAS DURAS DE DERIVACIÓN / REVISIÓN del Panel IA dicen explícitamente que esa situación debe derivarse.
- Aunque el cliente pida humano, si el Panel IA no tiene una regla dura para derivar, responde con lo aprendido y sigue conversando.
- No uses action "escalar" por dudas normales, preguntas incompletas, falta de contexto, errores del modelo o ausencia de conocimiento. En esos casos usa "conversando".
- No menciones que usas panel, memoria, prompt, documentos ni modelo.
- No inventes stock, precios, beneficios, condiciones, garantías, fechas ni disponibilidad.

FRASES PROHIBIDAS:
${[...SYSTEM_BLOCKED_PHRASES, blockedExtra].filter(Boolean).join('\n')}

RESPONDE SOLO JSON VÁLIDO, sin markdown:
{
  "reply": "respuesta visible para el cliente",
  "action": "conversando | calificado | escalar | no_interesado",
  "escalateToHuman": false,
  "statusUpdate": "",
  "derivationReason": "",
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
  const controller = new AbortController()
  const timeoutMs = Number(process.env.AGENT_TIMEOUT_MS || 9000)
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: Number(process.env.AGENT_MAX_TOKENS || 420),
        temperature: Number(process.env.AGENT_TEMPERATURE || 0.14),
        system: systemPrompt,
        messages
      })
    })
  } finally {
    clearTimeout(timer)
  }

  const text = await response.text()
  const data = safeJsonParse(text)
  if (!data) throw new Error(`Anthropic devolvió respuesta no JSON: ${text.slice(0, 180)}`)
  if (response.status === 529 || data?.error?.type === 'overloaded_error') {
    if (attempt <= 1) {
      await new Promise(resolve => setTimeout(resolve, 700))
      return callClaude({ anthropicKey, model, systemPrompt, messages, attempt: attempt + 1 })
    }
    throw new Error('Anthropic saturado')
  }
  if (!response.ok || data?.error) throw new Error(data?.error?.message || `Anthropic HTTP ${response.status}`)
  return data?.content?.[0]?.text || ''
}

function getPanelFallback(iaConfig = {}) {
  return cleanText(
    iaConfig.fallbackMessage ||
    iaConfig.mensajeFallback ||
    iaConfig.respuestaFallback ||
    iaConfig.fallback ||
    ''
  )
}

function getExtraBlockedPhrases(iaConfig = {}) {
  const values = [
    iaConfig.frasesProhibidas,
    iaConfig.blockedPhrases,
    iaConfig.frasesBloqueadas,
    iaConfig.noDecir,
    iaConfig.reglasEntrenamiento
  ]

  return values.flatMap(value => {
    if (!value) return []
    const lines = Array.isArray(value)
      ? value.map(flattenConfigValue)
      : typeof value === 'object'
        ? flattenConfigValue(value).split('\n')
        : String(value).split('\n')
    return lines
      .map(x => cleanText(x))
      .filter(x => x.length >= 4 && x.length <= 180)
      .filter(x => /no decir|prohibid|bloquead|nunca digas|evitar|no uses|frase/i.test(x) ? true : x.split(' ').length <= 8)
  })
}


function getDerivationRulesText(iaConfig = {}) {
  return flattenConfigValue({
    reglasDuras: iaConfig.reglasDuras,
    reglasDerivacion: iaConfig.reglasDerivacion,
    derivacionHumano: iaConfig.derivacionHumano,
    reglasRevision: iaConfig.reglasRevision,
    humanRules: iaConfig.humanRules,
    reviewRules: iaConfig.reviewRules,
    reglas: iaConfig.reglas,
    reglasRabito: iaConfig.reglasRabito,
    instrucciones: iaConfig.instrucciones
  })
}

function hasExplicitDerivationRules(iaConfig = {}) {
  const txt = normalize(getDerivationRulesText(iaConfig))
  return /(derivar|derivacion|humano|persona|asesor|ejecutivo|revision|requiere revision|escalar|transferir|pausar ia|tomar control)/.test(txt)
}

function normalizeStatusUpdate(value = '') {
  const v = normalize(value).replace(/s+/g, '_')
  const map = {
    activo: 'activo',
    active: 'activo',
    calificado: 'calificado',
    qualified: 'calificado',
    frio: 'frio',
    cold: 'frio',
    no_interesado: 'no_interesado',
    requiere_revision: 'requiere_revision',
    revision: 'requiere_revision'
  }
  return map[v] || ''
}


function escapeRegExp(text = '') {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function removeBlockedPhrases(text = '', blocked = []) {
  let out = cleanText(text)
  if (!out) return ''

  const allBlocked = blocked
    .map(x => cleanText(x))
    .filter(x => x.length >= 4)

  // Primero quitamos frases exactas sin matar toda la respuesta.
  for (const phrase of allBlocked) {
    const rx = new RegExp(escapeRegExp(phrase), 'ig')
    out = out.replace(rx, '')
  }

  // Luego quitamos oraciones que todavía contengan una frase prohibida normalizada.
  const parts = out
    .split(/(?<=[.!?¿?])\s+|\n+/)
    .map(x => cleanText(x))
    .filter(Boolean)

  const safeParts = parts.filter(part => !containsBlockedPhrase(part, allBlocked))
  const cleaned = (safeParts.length ? safeParts.join(' ') : out)
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/^[,.;:\-\s]+/, '')
    .trim()

  return cleaned
}

function sanitizeReply(reply = '', { iaConfig = {}, history = [] } = {}) {
  const extraBlocked = getExtraBlockedPhrases(iaConfig)
  const allBlocked = [...SYSTEM_BLOCKED_PHRASES, ...extraBlocked]
  let out = cleanText(reply)
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .replace(/\*\*/g, '')
    .trim()

  if (!out) return ''

  // Si llegó un JSON completo como texto, extraemos solo el campo reply.
  if (out.trim().startsWith('{')) {
    const parsed = parseAssistantJson(out)
    out = cleanText(parsed.reply || '')
    if (!out) return ''
  }

  // Antes se anulaba TODA la respuesta si tenía una frase prohibida.
  // Eso dejaba a Rabito mudo y WhatsApp terminaba marcando revisión.
  // Ahora limpiamos la frase/oración prohibida y conservamos el resto útil.
  out = removeBlockedPhrases(out, allBlocked)

  out = out
    .replace(/\bcomo modelo de lenguaje\b/gi, '')
    .replace(/\bsoy una ia\b/gi, '')
    .replace(/\bsoy inteligencia artificial\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!out) return ''

  // Última limpieza defensiva: si aún quedó una frase prohibida, la quitamos de nuevo.
  if (containsBlockedPhrase(out, allBlocked)) out = removeBlockedPhrases(out, allBlocked)
  if (!out) return ''

  const maxLength = Number(iaConfig.maxCaracteresRespuesta || iaConfig.replyMaxLength || 700) || 700
  if (out.length > maxLength) out = out.slice(0, Math.max(120, maxLength - 30)).replace(/\s+\S*$/, '') + '...'
  return out
}

async function repairReplyWithModel({ anthropicKey, model, systemPrompt, messages, badReply, iaConfig, history }) {
  const repairPrompt = `${systemPrompt}\n\nLa respuesta anterior fue inválida porque repetía, usaba una frase prohibida o no obedecía el entrenamiento. Genera una nueva respuesta usando SOLO el Panel IA, documentos, feedback y datos de conversación. No uses la respuesta inválida.\n\nRespuesta inválida:\n${cleanText(badReply).slice(0, 1000)}`

  try {
    const raw = await callClaude({ anthropicKey, model, systemPrompt: repairPrompt, messages })
    const parsed = parseAssistantJson(raw)
    const fixed = sanitizeReply(parsed.reply, { iaConfig, history })
    return { parsed, reply: fixed }
  } catch (_) {
    return { parsed: null, reply: '' }
  }
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
  const effectiveIaConfig = { ...(settings.map.ia_config || {}), ...iaConfig }
  const agendaLink = getAgendaLink(effectiveIaConfig, settings.text)
  const panelBrain = buildPanelBrain(effectiveIaConfig)
  const facts = conversationFacts(safeHistory, message, leadData)
  const [feedback, memory, knowledge] = await Promise.all([
    loadFeedback(sb, [message, facts].join('\n')),
    loadMemory(sb, leadData),
    retrieveKnowledge(sb, [message, facts, panelBrain].join('\n'), settings.text, settings.map)
  ])

  const localUpdate = inferGenericFields(message, leadData, agendaLink)
  const systemPrompt = buildSystemPrompt({
    iaConfig: effectiveIaConfig,
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
    let parsed = parseAssistantJson(rawText)
    let reply = sanitizeReply(parsed.reply, { iaConfig: effectiveIaConfig, history: safeHistory })

    if (!reply && process.env.AGENT_ENABLE_REPAIR === 'true') {
      const repaired = await repairReplyWithModel({
        anthropicKey: ANTHROPIC_KEY,
        model: ANTHROPIC_MODEL,
        systemPrompt,
        messages,
        badReply: parsed.reply || rawText,
        iaConfig: effectiveIaConfig,
        history: safeHistory
      })
      if (repaired.reply) {
        parsed = repaired.parsed || parsed
        reply = repaired.reply
      }
    }

    const panelFallback = getPanelFallback(effectiveIaConfig)
    if (!reply && panelFallback) reply = sanitizeReply(panelFallback, { iaConfig: effectiveIaConfig, history: safeHistory })

    const derivationRulesEnabled = hasExplicitDerivationRules(effectiveIaConfig)
    const requestedHuman = parsed.escalateToHuman === true || parsed.derivarHumano === true || parsed.human === true
    const requestedStatus = normalizeStatusUpdate(parsed.statusUpdate || parsed.status || '')
    const explicitHuman = derivationRulesEnabled && requestedHuman
    let actionOut = SAFE_ACTIONS.has(parsed.action) ? parsed.action : 'conversando'
    if (!derivationRulesEnabled && actionOut === 'escalar') actionOut = 'conversando'
    if (actionOut === 'escalar' && !explicitHuman && requestedStatus !== 'requiere_revision') actionOut = 'conversando'
    const statusUpdate = derivationRulesEnabled ? requestedStatus : ''
    const leadUpdate = sanitizeObject({ ...localUpdate, ...(parsed.leadUpdate || {}) })

    await saveMemory(sb, leadData, parsed.memoryUpdate)

    return res.status(200).json({
      ok: true,
      reply,
      action: reply ? actionOut : 'conversando',
      escalateToHuman: !!explicitHuman,
      statusUpdate,
      derivationReason: derivationRulesEnabled ? cleanText(parsed.derivationReason || '') : '',
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
        derivationRulesConfigured: derivationRulesEnabled,
        derivationAllowedByHardRules: !!(derivationRulesEnabled && (explicitHuman || statusUpdate === 'requiere_revision')),
        requestedStatusUpdate: requestedStatus || '',
        ...(debug ? { knowledgeChunks: knowledge.chunks } : {})
      }
    })
  } catch (error) {
    const panelFallback = getPanelFallback(effectiveIaConfig || iaConfig)
    const reply = panelFallback ? sanitizeReply(panelFallback, { iaConfig: effectiveIaConfig || iaConfig, history: safeHistory }) : ''
    return res.status(200).json({
      ok: true,
      reply,
      action: 'conversando',
      escalateToHuman: false,
      leadUpdate: localUpdate,
      fallback: true,
      noHardcodedClientReply: !reply,
      error: error?.message || 'agent_error',
      trace: { genericEngine: true, fallback: true, hardcodedBusiness: false, derivationAllowedByHardRules: false }
    })
  }
}
