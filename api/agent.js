// api/agent.js — Motor genérico guiado por Panel IA + Cerebro + Feedback
// No contiene guiones comerciales, productos ni conversaciones pregrabadas.

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
  'nombre', 'email', 'telefono', 'presupuesto', 'monto', 'renta', 'objetivo', 'producto',
  'servicio', 'modelo', 'ubicacion', 'experiencia', 'estado', 'agenda_link', 'observacion'
])

function cleanText(value = '') {
  return String(value ?? '').replace(/\u0000/g, '').trim()
}

function normalize(text = '') {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ\s@.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(text = '') {
  const stop = new Set('para pero porque como cuando donde cual que quien con sin una uno unos unas del los las por mas menos esto esta este ese esa sus tus mis ya si no al el la de en y o u a es son soy ser fue fui ha han hay un se te me le lo les mi tu su muy ahi aqui bien mal ok hola gracias'.split(' '))
  return normalize(text)
    .split(/\s+/)
    .filter(w => w.length >= 3 && !stop.has(w))
    .slice(0, 1200)
}

function safeJsonParse(text, fallback = null) {
  try { return text ? JSON.parse(text) : fallback } catch (_) { return fallback }
}

function stripCodeFence(text = '') {
  return String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
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
  return { reply: cleaned, action: 'conversando', leadUpdate: {}, memoryUpdate: {}, learningSuggestion: '' }
}

function hashKey(value = '') {
  let h = 5381
  const s = normalize(value)
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i)
  return Math.abs(h >>> 0).toString(36)
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
    .map(item => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: cleanText(item.content).slice(0, 1500) }))
    .filter(item => item.content)
}

function getRecentAssistantMessages(history = []) {
  return history.filter(item => item.role === 'assistant' && item.content).slice(-8).map(item => item.content)
}

function similarity(a = '', b = '') {
  const aw = new Set(tokenize(a))
  const bw = new Set(tokenize(b))
  if (!aw.size || !bw.size) return 0
  let common = 0
  for (const word of aw) if (bw.has(word)) common++
  return common / Math.max(aw.size, bw.size)
}

function isTooSimilarToRecentAssistant(reply = '', history = []) {
  return getRecentAssistantMessages(history).some(prev => similarity(reply, prev) >= 0.72)
}

function extractEmail(text = '') {
  const match = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return match ? match[0] : ''
}

function formatAmount(value = 0) {
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
  const large = raw.match(/\b(\d{6,9})\b/)
  if (large) return Number(large[1])
  const contextual = raw.match(/\b(\d{3,5})\b/)
  if (contextual && /(gano|renta|sueldo|ingreso|mensual|liquido|liquida|capital|presupuesto|pie|ahorro|tengo|dispongo|monto)/.test(raw)) {
    const n = Number(contextual[1])
    if (n >= 100 && n <= 99999) return n * 1000
  }
  return 0
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

function deriveLeadUpdate(message = '', leadData = {}, agendaLink = '') {
  const update = {}
  const email = extractEmail(message)
  if (email) update.email = email
  const amount = parseMoney(message)
  if (amount) {
    update.presupuesto = formatAmount(amount)
    update.monto = formatAmount(amount)
  }
  if (leadData?.telefono) update.telefono = cleanText(leadData.telefono)
  if (leadData?.nombre) update.nombre = cleanText(leadData.nombre)
  if (leadData?.email) update.email = cleanText(leadData.email)
  if (agendaLink) update.agenda_link = agendaLink
  return filterLeadUpdate(update)
}

function getAgendaLink(iaConfig = {}, settings = {}) {
  const fromConfig = cleanText(
    iaConfig.agendaLink || iaConfig.linkAgenda || iaConfig.urlAgenda || iaConfig.calendlyLink || ''
  )
  if (fromConfig) return fromConfig
  const allSettings = JSON.stringify(settings || {})
  const match = allSettings.match(/https?:\/\/[^\s"'<>]+/i)
  return cleanText(match?.[0] || process.env.DEFAULT_AGENDA_LINK || '')
}

function flattenConfigValue(value, depth = 0) {
  if (value == null || value === '') return ''
  if (depth > 3) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return cleanText(value)
  if (Array.isArray(value)) return value.slice(0, 120).map(item => flattenConfigValue(item, depth + 1)).filter(Boolean).join('\n')
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([key]) => !['file', 'base64', 'image', 'logo', 'avatar', 'content'].includes(key))
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

function buildPanelContext(iaConfig = {}) {
  const sections = [
    ['Identidad y personalidad', ['nombre', 'nombreAgente', 'assistantName', 'personalidad', 'tono', 'rol']],
    ['Oferta / producto / servicio', ['productosRabito', 'productos', 'catalogo', 'servicios', 'oferta', 'queVendes']],
    ['Proceso de venta', ['pasosRabito', 'pasos', 'procesoVenta', 'flujo', 'guion', 'comoVendes']],
    ['Reglas duras', ['reglasRabito', 'reglas', 'reglasEntrenamiento', 'instrucciones', 'frasesProhibidas']],
    ['Objeciones y FAQs', ['objecionesRabito', 'objeciones', 'faq', 'preguntasFrecuentes', 'entrenamiento']],
    ['Agenda y derivación', ['agendaLink', 'linkAgenda', 'urlAgenda', 'calendlyLink']]
  ]
  const out = []
  const used = new Set(['cerebroDocs', 'driveFiles', 'driveContent', 'metaToken', 'metaPhoneId', 'metaWabaId'])
  for (const [title, keys] of sections) {
    const rows = []
    for (const key of keys) {
      used.add(key)
      if (!(key in iaConfig)) continue
      const value = flattenConfigValue(iaConfig[key])
      if (value) rows.push(`${key}: ${value}`)
    }
    if (rows.length) out.push(`### ${title}\n${rows.join('\n')}`)
  }
  return out.join('\n\n').slice(0, 45000)
}

function splitIntoChunks(text = '', meta = {}) {
  const cleaned = cleanText(text).replace(/\r/g, '').replace(/\n{3,}/g, '\n\n')
  if (!cleaned) return []
  const chunks = []
  const size = 1200
  const overlap = 160
  let index = 0
  for (let start = 0; start < cleaned.length && chunks.length < 500; start += (size - overlap)) {
    const content = cleaned.slice(start, start + size).trim()
    if (content.length < 80) continue
    chunks.push({
      id: `${meta.docId || 'doc'}-${index}`,
      docId: meta.docId || 'doc',
      docName: meta.docName || meta.name || 'Documento',
      carpeta: meta.carpeta || meta.folder || 'General',
      categoria: meta.categoria || meta.category || 'General',
      order: index,
      content
    })
    index++
  }
  return chunks
}

function extractChunksFromSources({ settings = {}, iaConfig = {} }) {
  const chunks = []
  const seen = new Set()
  const push = (chunk) => {
    const content = cleanText(chunk?.content)
    if (!content) return
    const id = cleanText(chunk.id || `${chunk.docName || 'doc'}-${chunk.order || chunks.length}`)
    const fingerprint = normalize(`${chunk.docName || ''} ${content.slice(0, 180)}`)
    if (seen.has(fingerprint)) return
    seen.add(fingerprint)
    chunks.push({ ...chunk, id, content })
  }

  const storedChunks = settings?.rabito_knowledge_chunks?.chunks || settings?.rabito_knowledge_chunks?.value?.chunks
  if (Array.isArray(storedChunks)) storedChunks.forEach(push)

  const driveFiles = settings?.drive_content?.files || settings?.drive_content?.value?.files
  if (Array.isArray(driveFiles)) {
    for (const file of driveFiles) {
      splitIntoChunks(file.content || file.text || '', {
        docId: file.id || file.name,
        docName: file.name || file.nombre || 'Documento',
        carpeta: file.carpeta || file.folder || 'General',
        categoria: file.categoria || file.category || 'General'
      }).forEach(push)
    }
  }

  const docs = Array.isArray(iaConfig.cerebroDocs) ? iaConfig.cerebroDocs : []
  for (const doc of docs) {
    splitIntoChunks(doc.content || doc.text || '', {
      docId: doc.id || doc.nombre,
      docName: doc.nombre || doc.name || 'Documento',
      carpeta: doc.carpeta || doc.folder || 'General',
      categoria: doc.categoria || doc.category || 'General'
    }).forEach(push)
  }

  return chunks.slice(0, 2500)
}

function scoreChunk(queryTokens, chunk = {}) {
  const text = normalize(`${chunk.docName || ''} ${chunk.carpeta || ''} ${chunk.categoria || ''} ${chunk.content || ''}`)
  if (!text) return 0
  let score = 0
  const unique = new Set(queryTokens)
  for (const token of unique) {
    if (text.includes(token)) score += token.length > 5 ? 2.2 : 1
  }
  const contentNorm = normalize(chunk.content || '')
  const firstHits = [...unique].filter(t => contentNorm.slice(0, 280).includes(t)).length
  score += firstHits * 0.8
  return score
}

function rankKnowledgeChunks({ message, history, leadData, memory, chunks }) {
  const query = [
    message,
    JSON.stringify(leadData || {}),
    flattenConfigValue(memory || ''),
    history.filter(h => h.role === 'user').slice(-4).map(h => h.content).join('\n')
  ].join('\n')
  const qTokens = tokenize(query)
  if (!qTokens.length || !Array.isArray(chunks) || !chunks.length) return []
  return chunks
    .map(chunk => ({ ...chunk, score: scoreChunk(qTokens, chunk) }))
    .filter(chunk => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
}

function detectUserComplaint(message = '') {
  const n = normalize(message)
  return /(preguntas lo mismo|otra vez|de nuevo|a cada rato|no entiendes|eres penca|malo|wn|weon|weon|funciona mal|no es coherente|no sirve|sigues preguntando|repetir)/.test(n)
}

function detectUserWantsHumanOrAgenda(message = '') {
  const n = normalize(message)
  return /(agenda|agendar|reunion|reunion|llamada|humano|persona|asesor|ejecutivo|link|calendario|horario|quiero hablar|contactame|contacto)/.test(n)
}

function detectNoInterest(message = '') {
  const n = normalize(message)
  return /(no me interesa|chao|adios|no quiero|dejalo|despues veo|no gracias)/.test(n)
}

async function getSupabaseClient() {
  const SB_URL = cleanText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const SB_KEY = cleanText(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  if (!SB_URL || !SB_KEY) return null
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function loadSettings(sb = null) {
  if (!sb) return {}
  const keys = [
    'ia_config', 'drive_content', 'rabito_knowledge', 'rabito_knowledge_chunks',
    'ia_knowledge', 'agent_knowledge', 'agent_training', 'agent_rules'
  ]
  try {
    const { data, error } = await sb.from('crm_settings').select('key,value').in('key', keys)
    if (error || !Array.isArray(data)) return {}
    const out = {}
    for (const row of data) out[row.key] = row.value
    return out
  } catch (_) { return {} }
}

async function loadFeedbackLearnings(sb = null, message = '', history = [], settings = {}) {
  const query = `${message}\n${history.filter(h => h.role === 'user').slice(-4).map(h => h.content).join('\n')}`
  const items = []

  // Aprendizajes permanentes guardados desde el panel/modal de feedback
  const persistent = settings?.agent_training?.items || settings?.agent_training?.value?.items || []
  if (Array.isArray(persistent)) {
    for (const item of persistent) {
      if (item?.active === false) continue
      const improved = cleanText(item.improved || item.correction || item.respuesta || '')
      const reason = cleanText(item.reason || item.razon || '')
      const context = cleanText(item.context || item.original || item.pregunta || '')
      if (!improved && !reason) continue
      items.push({
        original: context.slice(0, 500),
        correction: `${reason ? 'Regla: ' + reason + '\n' : ''}${improved ? 'Respuesta modelo: ' + improved : ''}`.slice(0, 1100),
        created_at: item.created_at || item.fecha || '',
        source: 'agent_training',
        score: Math.max(0.75, similarity(query, `${context} ${reason} ${improved}`))
      })
    }
  }

  if (sb) {
    try {
      const { data, error } = await sb
        .from('crm_conv_feedback')
        .select('msg_content,feedback,correction,created_at')
        .order('created_at', { ascending: false })
        .limit(120)
      if (!error && Array.isArray(data)) {
        for (const item of data) {
          if (!cleanText(item.correction) && !cleanText(item.feedback)) continue
          items.push({
            original: cleanText(item.msg_content).slice(0, 500),
            correction: cleanText(item.correction || item.feedback).slice(0, 900),
            created_at: item.created_at,
            source: 'crm_conv_feedback',
            score: similarity(query, `${item.msg_content || ''} ${item.feedback || ''} ${item.correction || ''}`)
          })
        }
      }
    } catch (_) {}
  }

  return items
    .filter(item => item.correction)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
}

function getMemoryKey(leadData = {}) {
  return cleanText(leadData.telefono || leadData.email || leadData.nombre || leadData.id || '')
}

async function loadConversationMemory(sb = null, leadData = {}) {
  if (!sb) return {}
  const rawKey = getMemoryKey(leadData)
  if (!rawKey) return {}
  const hashed = `ai_memory_${hashKey(rawKey)}`

  try {
    const { data, error } = await sb.from('crm_ai_memory').select('value,updated_at').eq('key', rawKey).order('updated_at', { ascending: false }).limit(1)
    if (!error && data?.length) return data[0].value || {}
  } catch (_) {}

  try {
    const { data, error } = await sb.from('crm_settings').select('value').eq('key', hashed).single()
    if (!error && data?.value) return data.value || {}
  } catch (_) {}

  return {}
}

function mergeMemory(oldMemory = {}, update = {}, leadUpdate = {}) {
  const merged = { ...(oldMemory || {}) }
  merged.fields = { ...(merged.fields || {}), ...(leadUpdate || {}), ...(update.fields || {}) }
  for (const key of ['facts', 'preferences', 'doNotRepeat', 'objections', 'interests']) {
    const prev = Array.isArray(merged[key]) ? merged[key] : []
    const next = Array.isArray(update[key]) ? update[key] : []
    merged[key] = [...new Set([...prev, ...next].map(cleanText).filter(Boolean))].slice(-60)
  }
  merged.last_update = new Date().toISOString()
  return merged
}

async function saveConversationMemory(sb = null, leadData = {}, memoryUpdate = {}, leadUpdate = {}, oldMemory = {}) {
  if (!sb) return null
  const rawKey = getMemoryKey({ ...leadData, ...leadUpdate })
  if (!rawKey) return null
  const merged = mergeMemory(oldMemory, memoryUpdate, leadUpdate)
  const hashed = `ai_memory_${hashKey(rawKey)}`

  try {
    await sb.from('crm_ai_memory').upsert({ key: rawKey, value: merged, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  } catch (_) {}

  try {
    await sb.from('crm_settings').upsert({ key: hashed, value: merged })
  } catch (_) {}

  return merged
}

function summarizeConversationFacts(history = [], currentMessage = '', leadData = {}, memory = {}) {
  const facts = []
  const messages = [...history, { role: 'user', content: currentMessage }]
  const fields = { ...(memory?.fields || {}), ...(leadData || {}) }
  for (const [k, v] of Object.entries(fields)) {
    if (v) facts.push(`${k}: ${cleanText(v)}`)
  }
  const fullUserText = messages.filter(m => m.role === 'user').map(m => m.content).join('\n')
  const email = extractEmail(fullUserText)
  if (email) facts.push(`email mencionado: ${email}`)
  const money = parseMoney(fullUserText)
  if (money) facts.push(`monto/presupuesto mencionado: ${formatAmount(money)}`)
  const recent = messages.filter(m => m.role === 'user').slice(-8).map(m => `Cliente: ${cleanText(m.content).slice(0, 500)}`)
  return [...new Set([...facts, ...(memory?.facts || []), ...recent])].filter(Boolean).join('\n') || 'Sin datos consolidados.'
}

function buildKnowledgeContext(chunks = []) {
  if (!chunks.length) return 'No se encontraron fragmentos relevantes para este mensaje.'
  return chunks.map((c, i) => `Fragmento ${i + 1} — ${c.docName || 'Documento'} / ${c.carpeta || 'General'} / ${c.categoria || 'General'}\n${cleanText(c.content).slice(0, 1400)}`).join('\n\n')
}

function buildFeedbackContext(items = []) {
  if (!items.length) return 'Sin correcciones relevantes para este mensaje.'
  return items.map((item, i) => `Corrección ${i + 1}: cuando ocurra algo parecido a "${item.original}", responde siguiendo esto: "${item.correction}"`).join('\n')
}

function buildSystemPrompt({ iaConfig, panelContext, knowledgeContext, feedbackContext, memory, conversationFacts, agendaLink, history, message, trace }) {
  const agentName = cleanText(iaConfig.nombreAgente || iaConfig.assistantName || iaConfig.agentName || iaConfig.nombre || 'Asistente')
  const extraBlocked = flattenConfigValue(iaConfig.frasesProhibidas || iaConfig.blockedPhrases || '')
  const recentAssistant = getRecentAssistantMessages(history).map((m, i) => `${i + 1}. ${m}`).join('\n') || 'Sin mensajes previos del asistente.'
  const complaint = detectUserComplaint(message)
  const wantsAgenda = detectUserWantsHumanOrAgenda(message)
  const noInterest = detectNoInterest(message)

  return `Eres ${agentName}, un agente comercial conversacional.

TU IDENTIDAD Y TU FORMA DE VENDER NO VIENEN DEL CÓDIGO.
Vienen exclusivamente del Panel IA, documentos, reglas guardadas, feedback y conversación.

PROHIBICIÓN CRÍTICA:
No puedes usar productos, ciudades, precios, condiciones, promesas, campañas ni guiones que no estén en las fuentes de verdad entregadas abajo. Si el panel no enseña un producto o proceso, no lo inventes.

FUENTES DE VERDAD, EN ORDEN:
1. Mensaje actual del cliente y datos ya dichos.
2. Memoria estructurada del contacto.
3. Panel IA.
4. Fragmentos relevantes del Cerebro/documentos.
5. Feedback y correcciones aprendidas.
6. Historial reciente para evitar repetición.

PANEL IA:
${panelContext || 'Panel incompleto. Debes responder breve y pedir una aclaración útil, o derivar si corresponde.'}

FRAGMENTOS RELEVANTES DEL CEREBRO:
${knowledgeContext}

FEEDBACK APRENDIDO RELEVANTE:
${feedbackContext}

MEMORIA ESTRUCTURADA DEL CONTACTO:
${flattenConfigValue(memory).slice(0, 12000) || 'Sin memoria persistente registrada.'}

DATOS YA CONOCIDOS EN ESTA CONVERSACIÓN:
${conversationFacts}

MENSAJES RECIENTES DEL ASISTENTE — NO REPETIR:
${recentAssistant}

ESTADO DETECTADO:
- Cliente molesto o reclama repetición: ${complaint ? 'sí' : 'no'}
- Cliente pide agenda/link/humano/reunión: ${wantsAgenda ? 'sí' : 'no'}
- Cliente parece no interesado o se despide: ${noInterest ? 'sí' : 'no'}
- Link de agenda configurado: ${agendaLink || 'no configurado'}

REGLAS DE COMPORTAMIENTO:
- Responde como persona real por WhatsApp: claro, natural y corto.
- No menciones que usas panel, prompt, chunks, memoria o modelo.
- No repitas preguntas ya respondidas ni vuelvas al inicio del flujo.
- Si el cliente corrige algo, manda la última información.
- Si falta información, pide solo UNA cosa y explica por qué sirve.
- Si el cliente reclama repetición, reconoce el error en una línea y avanza con lo ya disponible.
- Si el cliente pide agendar o hablar con una persona y hay link de agenda, entrégalo sin interrogar de más, salvo que el Panel IA indique una condición estricta.
- Si el cliente insulta, mantén calma, no discutas, pide disculpas breve y avanza o deriva.
- Si no sabes, dilo de forma útil y ofrece el siguiente paso.
- No prometas resultados, disponibilidad, precios, stock ni condiciones que no estén en el Cerebro.

FRASES PROHIBIDAS:
${[...SYSTEM_BLOCKED_PHRASES, extraBlocked].filter(Boolean).join('\n')}

RESPONDE SOLO JSON VÁLIDO, sin markdown:
{
  "reply": "respuesta final visible para el cliente",
  "action": "conversando | calificado | escalar | no_interesado",
  "leadUpdate": {
    "nombre": "solo si lo sabes",
    "email": "solo si lo sabes",
    "telefono": "solo si lo sabes",
    "presupuesto": "solo si aplica y lo sabes",
    "objetivo": "solo si aplica y lo sabes",
    "producto": "solo si aplica y lo sabes",
    "servicio": "solo si aplica y lo sabes",
    "ubicacion": "solo si aplica y lo sabes",
    "experiencia": "solo si aplica y lo sabes"
  },
  "memoryUpdate": {
    "fields": {"campo": "valor útil"},
    "facts": ["hechos útiles del contacto"],
    "preferences": ["preferencias"],
    "doNotRepeat": ["preguntas o temas que no debes repetir"]
  },
  "learningSuggestion": "si detectas una regla que debería guardarse, escríbela; si no, vacío"
}`
}

async function callClaude({ anthropicKey, model, systemPrompt, messages, attempt = 1 }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
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

function buildEmergencyReply({ iaConfig, message, agendaLink, history, panelContext }) {
  if (detectNoInterest(message)) return 'Entiendo. No te molesto más por ahora. Si más adelante quieres retomarlo, me escribes y seguimos desde ahí.'
  if (detectUserWantsHumanOrAgenda(message) && agendaLink) return `Dale, avancemos por reunión para verlo bien. Agenda aquí:\n${agendaLink}`
  if (detectUserComplaint(message)) return 'Tienes razón, no te voy a repetir lo mismo. Tomo lo que ya me dijiste y avanzo desde ahí. ¿Prefieres que sigamos por aquí o lo vemos con una persona del equipo?'
  if (!panelContext) return 'Estoy activo, pero todavía me falta contexto en el panel para responder bien. Cuéntame qué necesitas resolver y te oriento con lo que tenga disponible.'
  return 'Entiendo. Para avanzar bien, dime cuál es el dato principal que quieres resolver ahora.'
}

function sanitizeReply(reply = '', { iaConfig = {}, message = '', agendaLink = '', history = [], panelContext = '' } = {}) {
  const extraBlocked = Array.isArray(iaConfig.frasesProhibidas) ? iaConfig.frasesProhibidas : String(iaConfig.frasesProhibidas || '').split('\n')
  let out = cleanText(reply).replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').replace(/\*\*/g, '').trim()
  if (!out || containsBlockedPhrase(out, extraBlocked) || isTooSimilarToRecentAssistant(out, history)) {
    out = buildEmergencyReply({ iaConfig, message, agendaLink, history, panelContext })
  }
  out = out.replace(/\bcomo modelo de lenguaje\b/gi, '').replace(/\bsoy una ia\b/gi, '').replace(/\bsoy inteligencia artificial\b/gi, '').replace(/\s{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  const maxLength = Number(iaConfig.maxCaracteresRespuesta || iaConfig.replyMaxLength || 900) || 900
  if (out.length > maxLength) out = out.slice(0, Math.max(120, maxLength - 40)).replace(/\s+\S*$/, '') + '...'
  return out
}

async function extractDocument({ anthropicKey, file, mediaType }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'pdfs-2024-09-25' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: mediaType, data: file } },
        { type: 'text', text: 'Extrae todo el texto útil de este documento. No resumas. Mantén títulos, tablas en texto y datos importantes.' }
      ] }]
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
  const { message, conversationHistory = [], iaConfig = {}, leadData = {}, action, file, mediaType } = body

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
  const mergedIaConfig = { ...(settings?.ia_config || {}), ...(iaConfig || {}) }
  const agendaLink = getAgendaLink(mergedIaConfig, settings)
  const oldMemory = await loadConversationMemory(sb, leadData)
  const feedbackItems = await loadFeedbackLearnings(sb, message, safeHistory, settings)
  const chunks = extractChunksFromSources({ settings, iaConfig: mergedIaConfig })
  const relevantChunks = rankKnowledgeChunks({ message, history: safeHistory, leadData, memory: oldMemory, chunks })
  const panelContext = buildPanelContext(mergedIaConfig)
  const knowledgeContext = buildKnowledgeContext(relevantChunks)
  const feedbackContext = buildFeedbackContext(feedbackItems)
  const conversationFacts = summarizeConversationFacts(safeHistory, message, leadData, oldMemory)
  const leadUpdateFromMessage = deriveLeadUpdate(message, leadData, agendaLink)

  const trace = {
    panelLoaded: Boolean(panelContext),
    chunksAvailable: chunks.length,
    chunksUsed: relevantChunks.map(c => ({ id: c.id, docName: c.docName, categoria: c.categoria, score: Number(c.score?.toFixed?.(2) || c.score || 0) })),
    feedbackUsed: feedbackItems.map(f => ({ score: Number(f.score?.toFixed?.(2) || f.score || 0), source: f.source || 'feedback', correction: f.correction.slice(0, 180) })),
    agendaConfigured: Boolean(agendaLink),
    memoryLoaded: Boolean(Object.keys(oldMemory || {}).length)
  }

  const systemPrompt = buildSystemPrompt({
    iaConfig: mergedIaConfig,
    panelContext,
    knowledgeContext,
    feedbackContext,
    memory: oldMemory,
    conversationFacts,
    agendaLink,
    history: safeHistory,
    message,
    trace
  })

  const messages = [...safeHistory, { role: 'user', content: String(message) }]

  try {
    const rawText = await callClaude({ anthropicKey: ANTHROPIC_KEY, model: ANTHROPIC_MODEL, systemPrompt, messages })
    const parsed = parseAssistantJson(rawText)
    const finalReply = sanitizeReply(parsed.reply, { iaConfig: mergedIaConfig, message, agendaLink, history: safeHistory, panelContext })
    const actionOut = SAFE_ACTIONS.has(parsed.action) ? parsed.action : (detectNoInterest(message) ? 'no_interesado' : 'conversando')
    const leadUpdate = filterLeadUpdate({ ...leadUpdateFromMessage, ...(parsed.leadUpdate || {}) })
    const memory = await saveConversationMemory(sb, { ...leadData, ...leadUpdate }, parsed.memoryUpdate || {}, leadUpdate, oldMemory)

    return res.status(200).json({
      ok: true,
      reply: finalReply,
      action: actionOut,
      leadUpdate,
      memory: memory || parsed.memoryUpdate || {},
      learningSuggestion: cleanText(parsed.learningSuggestion || ''),
      trace
    })
  } catch (error) {
    const fallbackReply = sanitizeReply('', { iaConfig: mergedIaConfig, message, agendaLink, history: safeHistory, panelContext })
    const actionOut = detectNoInterest(message) ? 'no_interesado' : (detectUserWantsHumanOrAgenda(message) && agendaLink ? 'escalar' : 'conversando')
    return res.status(200).json({
      ok: true,
      reply: fallbackReply,
      action: actionOut,
      leadUpdate: leadUpdateFromMessage,
      fallback: true,
      error: error?.message || 'agent_error',
      trace
    })
  }
}
