// api/agent.js — Rabito Engine genérico estable v9
// Rol: generar SOLO la respuesta visible usando Panel IA + documentos + feedback + memoria.
// No contiene negocio pregrabado. No deriva a humano/revisión salvo regla dura del panel.

import { createClient } from '@supabase/supabase-js'

const DEFAULT_MODEL = 'claude-3-5-haiku-20241022'
const clean = (v = '') => String(v ?? '').trim()
const nowIso = () => new Date().toISOString()

const BUILTIN_BLOCKED = [
  '[Sistema]',
  'Rabito no generó respuesta visible',
  'Estoy acá. Revisemos esto paso a paso para ayudarte bien.',
  'Para avanzar bien, dime cuál es el dato principal que quieres resolver ahora.',
  'Para ayudarte bien necesito partir por esto',
  'alta demanda',
  'te respondo en unos minutos',
  'soy una IA',
  'soy inteligencia artificial',
  'como modelo de lenguaje',
  'no tengo acceso al panel',
]

function sb() {
  const url = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const key = clean(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null
}

function normalize(text = '') {
  return clean(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
}

function words(text = '') {
  return normalize(text).split(/[^a-z0-9ñ]+/i).filter(w => w.length > 2)
}

function flatten(value, depth = 0) {
  if (value == null || value === '') return ''
  if (depth > 5) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return clean(value)
  if (Array.isArray(value)) return value.slice(0, 200).map(v => flatten(v, depth + 1)).filter(Boolean).join('\n')
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([k]) => !/password|token|secret|apikey|api_key|base64|image|file/i.test(k))
      .slice(0, 200)
      .map(([k, v]) => {
        const txt = flatten(v, depth + 1)
        return txt ? `${k}: ${txt}` : ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function safeJson(text, fallback = null) {
  try { return text ? JSON.parse(text) : fallback } catch { return fallback }
}

function stripFence(text = '') {
  return clean(text).replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
}

function extractJson(text = '') {
  const src = stripFence(text)
  const start = src.indexOf('{')
  if (start < 0) return ''
  let depth = 0, inStr = false, esc = false
  for (let i = start; i < src.length; i++) {
    const ch = src[i]
    if (inStr) {
      if (esc) { esc = false; continue }
      if (ch === '\\') { esc = true; continue }
      if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') { inStr = true; continue }
    if (ch === '{') depth++
    if (ch === '}') {
      depth--
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  return ''
}

function parseModelOutput(raw = '') {
  const cleaned = stripFence(raw)
  const parsed = safeJson(cleaned) || safeJson(extractJson(cleaned))
  if (parsed && typeof parsed === 'object') {
    const replyValue = parsed.reply ?? parsed.message ?? parsed.text ?? ''
    const reply = typeof replyValue === 'object'
      ? clean(replyValue.reply || replyValue.text || replyValue.message || '')
      : clean(replyValue)
    return {
      reply,
      action: clean(parsed.action || 'conversando'),
      statusUpdate: clean(parsed.statusUpdate || parsed.status || ''),
      escalateToHuman: parsed.escalateToHuman === true || parsed.derivarHumano === true || parsed.human === true,
      derivationReason: clean(parsed.derivationReason || parsed.reason || ''),
      leadUpdate: parsed.leadUpdate && typeof parsed.leadUpdate === 'object' ? parsed.leadUpdate : {},
      memoryUpdate: parsed.memoryUpdate && typeof parsed.memoryUpdate === 'object' ? parsed.memoryUpdate : {},
      learningSuggestion: clean(parsed.learningSuggestion || '')
    }
  }
  if (cleaned && !cleaned.startsWith('{')) return { reply: cleaned, action: 'conversando', leadUpdate: {}, memoryUpdate: {} }
  return { reply: '', action: 'conversando', leadUpdate: {}, memoryUpdate: {} }
}

async function setting(db, key, fallback = null) {
  if (!db) return fallback
  try {
    const { data } = await db.from('crm_settings').select('value').eq('key', key).single()
    return data?.value ?? fallback
  } catch { return fallback }
}

async function loadSettings(db) {
  const keys = [
    'ia_config',
    'agent_training',
    'agent_rules',
    'ia_knowledge',
    'rabito_knowledge',
    'rabito_knowledge_chunks',
    'drive_content'
  ]
  if (!db) return { map: {}, text: '' }
  try {
    const { data } = await db.from('crm_settings').select('key,value').in('key', keys)
    const map = {}
    const text = (data || []).map(row => {
      map[row.key] = row.value
      const txt = flatten(row.value)
      return txt ? `### ${row.key}\n${txt}` : ''
    }).filter(Boolean).join('\n\n').slice(0, 45000)
    return { map, text }
  } catch (e) {
    console.error('[AGENT] loadSettings error:', e?.message)
    return { map: {}, text: '' }
  }
}

function panelBlocked(iaConfig = {}) {
  const raw = flatten({
    frasesProhibidas: iaConfig.frasesProhibidas,
    blockedPhrases: iaConfig.blockedPhrases,
    noDecir: iaConfig.noDecir,
    reglasEntrenamiento: iaConfig.reglasEntrenamiento,
    reglas: iaConfig.reglas,
    reglasDuras: iaConfig.reglasDuras,
  })
  const lines = raw.split('\n').map(clean).filter(x => x.length >= 4 && x.length <= 180)
  return [...BUILTIN_BLOCKED, ...lines]
}

function removeBlocked(reply = '', iaConfig = {}) {
  let out = clean(reply).replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').replace(/\*\*/g, '').trim()
  if (!out) return ''
  if (out.startsWith('{')) out = parseModelOutput(out).reply || ''
  if (!out) return ''

  const blocked = panelBlocked(iaConfig).map(clean).filter(Boolean)
  for (const phrase of blocked) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(escaped, 'ig'), '')
  }

  const badNorm = blocked.map(normalize).filter(Boolean)
  const parts = out.split(/(?<=[.!?])\s+|\n+/).map(clean).filter(Boolean)
  const safe = parts.filter(s => !badNorm.some(b => normalize(s).includes(b)))
  out = (safe.length ? safe.join(' ') : out)
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[-,.;:\s]+/, '')
    .trim()

  const max = Number(iaConfig.maxCaracteresRespuesta || iaConfig.replyMaxLength || 650) || 650
  if (out.length > max) out = out.slice(0, Math.max(140, max - 20)).replace(/\s+\S*$/, '') + '...'
  return out
}

function buildPanelBrain(iaConfig = {}) {
  const priority = [
    'nombreAgente','assistantName','agentName','nombre',
    'personalidad','tono','rol','identidad',
    'oferta','productos','servicios','catalogo','propuestaValor',
    'procesoVenta','pasos','flujo','guion','metodoVenta',
    'reglas','reglasDuras','reglasDerivacion','reglasRevision','instrucciones','noDecir','frasesProhibidas',
    'objeciones','faq','preguntasFrecuentes','entrenamiento','respuestasGuardadas','agendaLink','linkAgenda','mensajeFallback','fallbackMessage'
  ]
  const blocks = []
  const used = new Set()
  for (const key of priority) {
    if (!(key in iaConfig)) continue
    used.add(key)
    const txt = flatten(iaConfig[key])
    if (txt) blocks.push(`### ${key}\n${txt}`)
  }
  for (const [key, value] of Object.entries(iaConfig || {})) {
    if (used.has(key) || /token|key|secret|password|activo|created|updated/i.test(key)) continue
    const txt = flatten(value)
    if (txt) blocks.push(`### ${key}\n${txt}`)
  }
  return blocks.join('\n\n').slice(0, 45000)
}

function getAgendaLink(iaConfig = {}, settingsText = '') {
  const direct = clean(iaConfig.agendaLink || iaConfig.linkAgenda || iaConfig.urlAgenda || iaConfig.calendlyLink || process.env.DEFAULT_AGENDA_LINK || '')
  if (direct) return direct
  const match = String(settingsText || '').match(/https?:\/\/[^\s)\]"']+/i)
  return match ? match[0] : ''
}

function score(query = '', txt = '') {
  const qs = [...new Set(words(query))]
  const nt = normalize(txt)
  let s = 0
  for (const w of qs) if (nt.includes(w)) s += w.length > 5 ? 3 : 1
  return s
}

function chunksFromSettings(settings = {}) {
  const out = []
  const v = settings.map?.rabito_knowledge_chunks
  const arr = Array.isArray(v?.chunks) ? v.chunks : Array.isArray(v) ? v : []
  arr.forEach((c, i) => out.push({
    id: c.id || `settings-${i}`,
    title: c.title || c.titulo || c.docName || c.nombre || 'Documento',
    content: c.content || c.contenido || c.text || '',
    tags: c.tags || c.carpeta || '',
    activo: c.activo !== false
  }))

  const docs = settings.map?.rabito_knowledge?.docs || settings.map?.ia_config?.cerebroDocs || settings.map?.drive_content?.files || []
  if (Array.isArray(docs)) {
    docs.forEach((d, i) => {
      const txt = d.content || d.text || d.contenido || d.extract || ''
      if (txt) out.push({ id: d.id || `doc-${i}`, title: d.name || d.title || d.nombre || 'Documento', content: txt, tags: d.tags || '', activo: d.activo !== false })
    })
  }
  return out
}

async function retrieveKnowledge(db, query = '', settings = {}) {
  let chunks = []
  try {
    const { data } = await db.from('crm_knowledge_chunks')
      .select('id,doc_id,title,titulo,content,contenido,tags,producto,canal,activo')
      .or('activo.is.null,activo.eq.true')
      .limit(400)
    if (Array.isArray(data)) chunks.push(...data.map(c => ({ ...c, content: c.content || c.contenido, title: c.title || c.titulo })))
  } catch {}
  chunks.push(...chunksFromSettings(settings))
  chunks = chunks.filter(c => c && c.activo !== false && clean(c.content))

  if (!chunks.length) return { text: (settings.text || '').slice(0, 22000), chunks: [] }

  const ranked = chunks.map(c => ({ ...c, _score: score(query, [c.title, c.tags, c.producto, c.canal, c.content].filter(Boolean).join(' ')) }))
    .sort((a,b) => b._score - a._score)
  const withScore = ranked.filter(c => c._score > 0).slice(0, 7)
  const picked = withScore.length ? withScore : ranked.slice(0, 4)

  return {
    text: picked.map((c, i) => `### Documento ${i + 1}: ${clean(c.title || 'Documento')}\n${clean(c.content).slice(0, 1800)}`).join('\n\n'),
    chunks: picked.map(c => ({ id: c.id, title: c.title, score: c._score || 0 }))
  }
}

function normalizeTrainingItem(x = {}) {
  const original = clean(x.original || x.msg_content || x.message || x.before || x.incorrect || x.mensajeOriginal || '')
  const improved = clean(x.improved || x.correction || x.after || x.correct || x.respuestaCorrecta || x.mensajeMejorado || '')
  const reason = clean(x.reason || x.feedback || x.explanation || x.instruccion || x.regla || '')
  const active = x.active !== false && x.activo !== false
  return { original, improved, reason, active, raw: x }
}

async function loadTraining(db, query = '') {
  const items = []
  try {
    const { data } = await db.from('crm_conv_feedback')
      .select('msg_content,feedback,correction,improved,created_at')
      .order('created_at', { ascending: false })
      .limit(120)
    if (Array.isArray(data)) items.push(...data)
  } catch {}
  try {
    const v = await setting(db, 'agent_training', [])
    const arr = Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : []
    items.push(...arr)
  } catch {}

  const normalized = items.map(normalizeTrainingItem).filter(x => x.active && (x.improved || x.reason || x.original))
  const ranked = normalized.map(x => ({ ...x, _score: score(query, [x.original, x.reason, x.improved].join(' ')) }))
    .sort((a,b) => b._score - a._score)
  const picked = (ranked.filter(x => x._score > 0).slice(0, 8).length ? ranked.filter(x => x._score > 0).slice(0, 8) : ranked.slice(0, 5))
  return {
    items: picked,
    text: picked.map((x, i) => `### Aprendizaje ${i + 1}\nSituación/mensaje: ${x.original || 'general'}\nCorrección o regla: ${x.reason || 'sin explicación'}\nRespuesta preferida: ${x.improved || 'sin respuesta exacta'}`).join('\n\n'),
    count: picked.length
  }
}

function tryTrainingReply(training, message, iaConfig = {}) {
  const direct = (training.items || []).find(x => x.improved && (x._score >= 3 || normalize(x.original) === normalize(message)))
  if (!direct) return ''
  let reply = direct.improved
  // Evita copiar una respuesta que contiene datos personales rígidos si no corresponden; la IA luego la adaptará, pero fallback directo debe ser seguro.
  return removeBlocked(reply, iaConfig)
}

async function loadMemory(db, leadData = {}) {
  const key = clean(leadData.telefono || leadData.phone || leadData.email || leadData.nombre || leadData.name)
  if (!db || !key) return ''
  try {
    const { data } = await db.from('crm_ai_memory').select('value,updated_at').eq('key', key).order('updated_at', { ascending: false }).limit(1)
    return flatten(data?.[0]?.value || '').slice(0, 8000)
  } catch { return '' }
}

async function saveMemory(db, leadData = {}, memoryUpdate = {}) {
  if (!db || !memoryUpdate || typeof memoryUpdate !== 'object') return
  const key = clean(leadData.telefono || leadData.phone || leadData.email || leadData.nombre || leadData.name)
  if (!key) return
  try { await db.from('crm_ai_memory').upsert({ key, value: memoryUpdate, updated_at: nowIso() }, { onConflict: 'key' }) } catch {}
}

function sanitizeHistory(history = []) {
  return (Array.isArray(history) ? history : [])
    .filter(m => m && m.role && clean(m.content) && !clean(m.content).startsWith('[Sistema]'))
    .slice(-24)
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clean(m.content).slice(0, 1400) }))
}

function conversationFacts(history = [], message = '', leadData = {}) {
  const user = [...history, { role:'user', content: message }]
    .filter(m => m.role === 'user')
    .slice(-12)
    .map((m,i) => `Cliente ${i+1}: ${clean(m.content).slice(0,420)}`)
  const lead = Object.entries(leadData || {}).filter(([,v]) => v).slice(0, 25).map(([k,v]) => `${k}: ${clean(v).slice(0,250)}`)
  return [...user, ...lead].join('\n') || 'Sin datos previos.'
}

function derivationRulesText(iaConfig = {}) {
  return flatten({
    reglasDuras: iaConfig.reglasDuras,
    reglasDerivacion: iaConfig.reglasDerivacion,
    derivacionHumano: iaConfig.derivacionHumano,
    reglasRevision: iaConfig.reglasRevision,
    humanRules: iaConfig.humanRules,
    reviewRules: iaConfig.reviewRules
  })
}

function hasDerivationRules(iaConfig = {}) {
  return /(derivar|humano|persona|asesor|ejecutivo|revision|revisión|escalar|transferir|tomar control)/.test(normalize(derivationRulesText(iaConfig)))
}

function normStatus(v = '') {
  const s = normalize(v).replace(/\s+/g, '_')
  return ['activo','calificado','frio','no_interesado','requiere_revision'].includes(s) ? s : ''
}

function safeUpdate(obj = {}) {
  const out = {}
  for (const [k,v] of Object.entries(obj || {}).slice(0,50)) {
    const key = clean(k).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0,60)
    if (!key || /password|token|secret|apikey|api_key|created_at|updated_at/i.test(key)) continue
    const val = typeof v === 'object' ? flatten(v).slice(0,800) : clean(v).slice(0,800)
    if (val) out[key] = val
  }
  return out
}

function extractLocalFields(message = '', leadData = {}, agendaLink = '') {
  const out = { ...(leadData || {}) }
  const email = String(message).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]
  if (email) out.email = email
  if (agendaLink) out.agenda_link = agendaLink
  return safeUpdate(out)
}

function panelFallback(iaConfig = {}, message = '', training = null) {
  const fromTraining = tryTrainingReply(training || { items: [] }, message, iaConfig)
  if (fromTraining) return fromTraining

  const explicit = clean(iaConfig.fallbackMessage || iaConfig.mensajeFallback || iaConfig.respuestaFallback || '')
  if (explicit) return explicit

  const firstUseful = flatten({
    proceso: iaConfig.pasos || iaConfig.procesoVenta || iaConfig.flujo,
    faq: iaConfig.preguntasFrecuentes || iaConfig.faq,
    oferta: iaConfig.oferta || iaConfig.productos || iaConfig.servicios,
    entrenamiento: iaConfig.entrenamiento || iaConfig.respuestasGuardadas
  }).split('\n').map(clean).find(x => x.length > 12 && x.length < 500)

  if (firstUseful) return firstUseful
  return 'Hola, te leo. Cuéntame qué necesitas y te ayudo.'
}

function buildPrompt({ agentName, panelBrain, knowledge, trainingText, memory, facts, agendaLink, iaConfig, history, message }) {
  const recentAssistant = history.filter(m => m.role === 'assistant').slice(-6).map((m,i) => `${i+1}. ${m.content}`).join('\n') || 'Sin mensajes previos.'
  const derivRules = derivationRulesText(iaConfig)
  return `Eres ${agentName}. Eres un agente genérico de atención y ventas por WhatsApp.

REGLA PRINCIPAL:
No tienes rubro, productos, precios, requisitos ni guiones propios. Solo respondes usando lo aprendido en Panel IA, documentos, feedback, memoria y conversación.

PANEL IA:
${panelBrain || 'Panel IA vacío.'}

DOCUMENTOS/CONOCIMIENTO RELEVANTE:
${knowledge || 'Sin documentos relevantes.'}

FEEDBACK Y APRENDIZAJES PERMANENTES:
${trainingText || 'Sin feedback aprendido.'}

MEMORIA DEL CONTACTO:
${memory || 'Sin memoria registrada.'}

DATOS YA ENTREGADOS EN ESTA CONVERSACIÓN:
${facts}

MENSAJES RECIENTES DEL ASISTENTE PARA EVITAR REPETIR:
${recentAssistant}

LINK DE AGENDA CONFIGURADO:
${agendaLink || 'No configurado'}

REGLAS DURAS PARA DERIVAR A HUMANO O REVISIÓN:
${derivRules || 'No hay reglas duras configuradas. Por lo tanto NO derives ni marques revisión.'}

INSTRUCCIONES:
- Responde SIEMPRE el último mensaje del cliente.
- Responde breve, natural y útil por WhatsApp.
- Haz máximo una pregunta.
- No repitas datos ya entregados.
- Si el cliente pide agenda/link y hay link configurado, entrega el link.
- No inventes información que no esté en entrenamiento o documentos.
- Si falta información, pide solo el dato mínimo siguiente según el proceso aprendido.
- No menciones panel, prompt, memoria, documentos ni modelo.
- Solo deriva a humano/revisión si las reglas duras lo autorizan explícitamente.

FRASES PROHIBIDAS:
${panelBlocked(iaConfig).join('\n')}

Devuelve SOLO JSON válido:
{"reply":"respuesta visible para el cliente","action":"conversando","escalateToHuman":false,"statusUpdate":"","derivationReason":"","leadUpdate":{},"memoryUpdate":{"facts":[],"doNotRepeat":[]},"learningSuggestion":""}

Último mensaje del cliente: ${clean(message)}`
}

async function callClaude({ key, model, system, messages }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number(process.env.AGENT_TIMEOUT_MS || 14000))
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: Number(process.env.AGENT_MAX_TOKENS || 600),
        temperature: Number(process.env.AGENT_TEMPERATURE || 0.12),
        system,
        messages
      })
    })
    const text = await r.text()
    const data = safeJson(text)
    if (!r.ok || data?.error) throw new Error(data?.error?.message || `Anthropic HTTP ${r.status}: ${text.slice(0,160)}`)
    return data?.content?.[0]?.text || ''
  } finally { clearTimeout(timeout) }
}

export async function generateAgentResponse(input = {}, opts = {}) {
  const key = clean(process.env.ANTHROPIC_KEY || process.env.VITE_ANTHROPIC_KEY)
  const model = clean(process.env.ANTHROPIC_MODEL || DEFAULT_MODEL)
  const message = clean(input.message)
  if (!message) return { ok: false, reply: '', error: 'missing_message' }

  const db = opts.db || sb()
  const settings = await loadSettings(db)
  const iaConfig = { ...(settings.map.ia_config || {}), ...(input.iaConfig || {}) }
  const history = sanitizeHistory(input.conversationHistory || [])
  const leadData = input.leadData || {}
  const panelBrain = buildPanelBrain(iaConfig)
  const agendaLink = getAgendaLink(iaConfig, settings.text)
  const facts = conversationFacts(history, message, leadData)
  const query = [message, facts, panelBrain].join('\n')

  const [training, memory, knowledge] = await Promise.all([
    loadTraining(db, query),
    loadMemory(db, leadData),
    retrieveKnowledge(db, query, settings)
  ])

  const agentName = clean(iaConfig.nombreAgente || iaConfig.assistantName || iaConfig.agentName || iaConfig.nombre || 'Asistente')
  const localUpdate = extractLocalFields(message, leadData, agendaLink)
  const directTrainingReply = tryTrainingReply(training, message, iaConfig)

  if (!key) {
    const reply = removeBlocked(directTrainingReply || panelFallback(iaConfig, message, training), iaConfig)
    return { ok: false, reply, action: 'conversando', escalateToHuman: false, statusUpdate: '', leadUpdate: localUpdate, error: 'ANTHROPIC_KEY_missing', trace: { fallback: true, feedbackUsed: training.count, knowledgeChunksUsed: knowledge.chunks.length, genericEngine: true, hardcodedBusiness: false } }
  }

  const system = buildPrompt({ agentName, panelBrain, knowledge: knowledge.text, trainingText: training.text, memory, facts, agendaLink, iaConfig, history, message })
  const messages = [...history, { role: 'user', content: message }]

  try {
    console.log('[AGENT] Claude start', { model, hasPanel: !!panelBrain, training: training.count, chunks: knowledge.chunks.length })
    const raw = await callClaude({ key, model, system, messages })
    const parsed = parseModelOutput(raw)
    let reply = removeBlocked(parsed.reply, iaConfig)
    if (!reply) reply = removeBlocked(directTrainingReply || panelFallback(iaConfig, message, training), iaConfig)

    const rules = hasDerivationRules(iaConfig)
    const requestedStatus = rules ? normStatus(parsed.statusUpdate) : ''
    const requestedHuman = rules && parsed.escalateToHuman === true
    await saveMemory(db, leadData, parsed.memoryUpdate)

    return {
      ok: true,
      reply,
      action: parsed.action || 'conversando',
      escalateToHuman: requestedHuman,
      statusUpdate: requestedStatus,
      derivationReason: rules ? clean(parsed.derivationReason || '') : '',
      leadUpdate: safeUpdate({ ...localUpdate, ...(parsed.leadUpdate || {}) }),
      memory: parsed.memoryUpdate || {},
      learningSuggestion: parsed.learningSuggestion || '',
      trace: {
        panelUsed: !!panelBrain,
        feedbackUsed: training.count,
        trainingDirectCandidate: !!directTrainingReply,
        knowledgeChunksUsed: knowledge.chunks.length,
        agendaConfigured: !!agendaLink,
        derivationAllowedByHardRules: !!(requestedHuman || requestedStatus === 'requiere_revision'),
        genericEngine: true,
        hardcodedBusiness: false
      }
    }
  } catch (error) {
    console.error('[AGENT] Claude error:', error?.message)
    const reply = removeBlocked(directTrainingReply || panelFallback(iaConfig, message, training), iaConfig)
    return {
      ok: false,
      reply,
      action: 'conversando',
      escalateToHuman: false,
      statusUpdate: '',
      leadUpdate: localUpdate,
      error: error?.message || 'agent_error',
      trace: { genericEngine: true, fallback: true, feedbackUsed: training.count, knowledgeChunksUsed: knowledge.chunks.length, hardcodedBusiness: false, derivationAllowedByHardRules: false }
    }
  }
}

async function extractDocument({ file, mediaType }) {
  const key = clean(process.env.ANTHROPIC_KEY || process.env.VITE_ANTHROPIC_KEY)
  if (!key) throw new Error('ANTHROPIC_KEY missing')
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'pdfs-2024-09-25' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: mediaType, data: file } },
        { type: 'text', text: 'Extrae y devuelve todo el texto útil de este documento, sin inventar.' }
      ] }]
    })
  })
  const txt = await r.text()
  const data = safeJson(txt)
  if (!r.ok || data?.error) throw new Error(data?.error?.message || `extract_error ${r.status}`)
  return data?.content?.[0]?.text || ''
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Use POST' })
  const body = req.body || {}
  if (body.action === 'extract' && body.file) {
    try { return res.status(200).json({ ok:true, text: await extractDocument({ file: body.file, mediaType: body.mediaType }) }) }
    catch (e) { return res.status(200).json({ ok:false, error:e.message, text:'' }) }
  }
  const result = await generateAgentResponse(body)
  return res.status(200).json(result)
}
