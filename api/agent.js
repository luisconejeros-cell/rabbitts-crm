// api/agent.js — Motor genérico de aprendizaje para Rabito
// Fuente de verdad: Panel IA + documentos/conocimiento + feedback + memoria. Sin guiones comerciales fijos.

import { createClient } from '@supabase/supabase-js'

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'
const clean = (v = '') => String(v ?? '').trim()
const nowIso = () => new Date().toISOString()

const BUILT_IN_BLOCKED = [
  'alta demanda',
  'te respondo en unos minutos',
  'te respondo en algunos minutos',
  'estoy con alta demanda',
  'soy una ia',
  'soy inteligencia artificial',
  'como modelo de lenguaje',
  'no tengo acceso',
  'para avanzar bien, dime cuál es el dato principal que quieres resolver ahora',
  'para ayudarte bien necesito partir por esto'
]

function sb() {
  const url = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const key = clean(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null
}

function normalize(text = '') {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function words(text = '') {
  return normalize(text).split(/[^a-z0-9ñ]+/i).filter(w => w.length > 2)
}

function flatten(value, depth = 0) {
  if (value == null || value === '') return ''
  if (depth > 4) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return clean(value)
  if (Array.isArray(value)) return value.slice(0, 150).map(v => flatten(v, depth + 1)).filter(Boolean).join('\n')
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([k]) => !/password|token|secret|apikey|api_key|base64|file|image/i.test(k))
      .slice(0, 150)
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
    const reply = typeof parsed.reply === 'object'
      ? clean(parsed.reply.reply || parsed.reply.text || parsed.reply.message || '')
      : clean(parsed.reply || parsed.message || parsed.text || '')
    return {
      reply,
      action: clean(parsed.action || 'conversando'),
      statusUpdate: clean(parsed.statusUpdate || parsed.status || ''),
      escalateToHuman: parsed.escalateToHuman === true || parsed.derivarHumano === true || parsed.human === true,
      derivationReason: clean(parsed.derivationReason || ''),
      leadUpdate: parsed.leadUpdate && typeof parsed.leadUpdate === 'object' ? parsed.leadUpdate : {},
      memoryUpdate: parsed.memoryUpdate && typeof parsed.memoryUpdate === 'object' ? parsed.memoryUpdate : {},
      learningSuggestion: clean(parsed.learningSuggestion || '')
    }
  }
  // Si el modelo responde texto normal, también sirve. Lo envolvemos.
  if (cleaned && !cleaned.startsWith('{')) return { reply: cleaned, action: 'conversando', leadUpdate: {}, memoryUpdate: {} }
  return { reply: '', action: 'conversando', leadUpdate: {}, memoryUpdate: {} }
}

function blockedFromPanel(iaConfig = {}) {
  const raw = flatten({
    frasesProhibidas: iaConfig.frasesProhibidas,
    blockedPhrases: iaConfig.blockedPhrases,
    noDecir: iaConfig.noDecir,
    reglasEntrenamiento: iaConfig.reglasEntrenamiento
  })
  const lines = raw.split('\n').map(clean).filter(Boolean)
  const short = lines.filter(x => x.length >= 4 && x.length <= 180)
  return [...BUILT_IN_BLOCKED, ...short]
}

function removeBlocked(reply = '', iaConfig = {}) {
  let out = clean(reply).replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').replace(/\*\*/g, '').trim()
  if (!out) return ''
  if (out.startsWith('{')) out = parseModelOutput(out).reply || ''
  if (!out) return ''
  const blocked = blockedFromPanel(iaConfig).filter(Boolean)
  for (const phrase of blocked) {
    const p = clean(phrase)
    if (!p) continue
    out = out.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '')
  }
  const badNorm = blocked.map(normalize).filter(Boolean)
  const sentences = out.split(/(?<=[.!?])\s+|\n+/).map(clean).filter(Boolean)
  const safe = sentences.filter(s => !badNorm.some(b => normalize(s).includes(b)))
  out = (safe.length ? safe.join(' ') : out)
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[-,.;:\s]+/, '')
    .trim()
  const max = Number(iaConfig.maxCaracteresRespuesta || iaConfig.replyMaxLength || 850) || 850
  if (out.length > max) out = out.slice(0, Math.max(160, max - 20)).replace(/\s+\S*$/, '') + '...'
  return out
}

async function setting(db, key, fallback = null) {
  if (!db) return fallback
  try {
    const { data } = await db.from('crm_settings').select('value').eq('key', key).single()
    return data?.value ?? fallback
  } catch { return fallback }
}

async function loadSettings(db) {
  const keys = ['ia_config', 'drive_content', 'rabito_knowledge', 'rabito_knowledge_chunks', 'agent_training', 'agent_rules', 'ia_knowledge']
  if (!db) return { map: {}, text: '' }
  try {
    const { data } = await db.from('crm_settings').select('key,value').in('key', keys)
    const map = {}
    const text = (data || []).map(row => {
      map[row.key] = row.value
      const txt = flatten(row.value)
      return txt ? `### ${row.key}\n${txt}` : ''
    }).filter(Boolean).join('\n\n').slice(0, 35000)
    return { map, text }
  } catch { return { map: {}, text: '' } }
}

function buildPanelBrain(iaConfig = {}) {
  const blocks = []
  const priority = [
    'nombreAgente','assistantName','agentName','nombre',
    'personalidad','tono','rol','identidad',
    'oferta','productos','servicios','catalogo','promesa',
    'procesoVenta','pasos','flujo','guion',
    'reglas','reglasDuras','reglasDerivacion','reglasRevision','instrucciones',
    'objeciones','faq','preguntasFrecuentes','entrenamiento','respuestasGuardadas','agendaLink','linkAgenda'
  ]
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
  return blocks.join('\n\n').slice(0, 50000)
}

function getAgendaLink(iaConfig = {}, settingsText = '') {
  const direct = clean(iaConfig.agendaLink || iaConfig.linkAgenda || iaConfig.urlAgenda || iaConfig.calendlyLink || process.env.DEFAULT_AGENDA_LINK || '')
  if (direct) return direct
  const match = String(settingsText || '').match(/https?:\/\/[^\s)\]"']+/i)
  return match ? match[0] : ''
}

function score(query = '', txt = '') {
  const qs = words(query).filter(w => w.length > 2)
  const nt = normalize(txt)
  let s = 0
  for (const w of qs) if (nt.includes(w)) s += w.length > 4 ? 2 : 1
  return s
}

async function retrieveKnowledge(db, query = '', settings = {}) {
  let chunks = []
  try {
    const { data } = await db.from('crm_knowledge_chunks')
      .select('id,doc_id,title,titulo,content,contenido,tags,producto,canal,activo')
      .or('activo.is.null,activo.eq.true')
      .limit(300)
    if (Array.isArray(data)) chunks.push(...data)
  } catch {}
  const sk = settings.map?.rabito_knowledge_chunks
  const sc = Array.isArray(sk?.chunks) ? sk.chunks : Array.isArray(sk) ? sk : []
  if (sc.length) chunks.push(...sc.map((c, i) => ({
    id: c.id || `settings-${i}`,
    doc_id: c.doc_id || c.docId || 'settings',
    title: c.title || c.titulo || c.docName || c.nombre || 'Documento',
    content: c.content || c.contenido || c.text || '',
    tags: c.tags || c.carpeta || '',
    activo: c.activo !== false
  })))
  chunks = chunks.filter(c => c && c.activo !== false && clean(c.content || c.contenido))
  if (!chunks.length) return { text: (settings.text || '').slice(0, 25000), chunks: [] }
  const ranked = chunks.map(c => ({ ...c, _score: score(query, [c.title,c.titulo,c.tags,c.producto,c.canal,c.content,c.contenido].filter(Boolean).join(' ')) }))
    .sort((a,b) => b._score - a._score)
  const picked = (ranked.filter(c => c._score > 0).slice(0, 6).length ? ranked.filter(c => c._score > 0).slice(0, 6) : ranked.slice(0, 4))
  return {
    text: picked.map((c, i) => `### Fragmento ${i+1}: ${clean(c.title || c.titulo || 'Documento')}\n${clean(c.content || c.contenido).slice(0, 1800)}`).join('\n\n'),
    chunks: picked.map(c => ({ id: c.id, title: c.title || c.titulo, score: c._score || 0 }))
  }
}

async function loadFeedback(db, query = '') {
  const items = []
  try {
    const { data } = await db.from('crm_conv_feedback').select('msg_content,feedback,correction,created_at').order('created_at', { ascending: false }).limit(100)
    if (Array.isArray(data)) items.push(...data)
  } catch {}
  try {
    const v = await setting(db, 'agent_training', [])
    const arr = Array.isArray(v) ? v : Array.isArray(v?.items) ? v.items : []
    items.push(...arr.filter(x => x && x.active !== false))
  } catch {}
  const ranked = items.map(x => {
    const txt = flatten(x)
    return { txt, score: score(query, txt) }
  }).filter(x => x.txt).sort((a,b) => b.score - a.score)
  const picked = (ranked.filter(x => x.score > 0).slice(0, 8).length ? ranked.filter(x => x.score > 0).slice(0, 8) : ranked.slice(0, 6))
  return { text: picked.map((x,i) => `### Feedback ${i+1}\n${x.txt.slice(0,1200)}`).join('\n\n'), count: picked.length }
}

async function loadMemory(db, leadData = {}) {
  const key = clean(leadData.telefono || leadData.phone || leadData.email || leadData.nombre || leadData.name)
  if (!db || !key) return ''
  try {
    const { data } = await db.from('crm_ai_memory').select('value,updated_at').eq('key', key).order('updated_at', { ascending: false }).limit(1)
    return flatten(data?.[0]?.value || '').slice(0, 12000)
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
    .slice(-30)
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: clean(m.content).slice(0, 1800) }))
}

function conversationFacts(history = [], message = '', leadData = {}) {
  const user = [...history, { role:'user', content: message }].filter(m => m.role === 'user').slice(-12).map((m,i) => `Cliente ${i+1}: ${clean(m.content).slice(0,500)}`)
  const lead = Object.entries(leadData || {}).filter(([,v]) => v).slice(0, 25).map(([k,v]) => `${k}: ${clean(v).slice(0,300)}`)
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
  return /(derivar|humano|persona|asesor|ejecutivo|revision|escalar|transferir|tomar control)/.test(normalize(derivationRulesText(iaConfig)))
}

function normStatus(v = '') {
  const s = normalize(v).replace(/\s+/g, '_')
  const allowed = ['activo','calificado','frio','no_interesado','requiere_revision']
  return allowed.includes(s) ? s : ''
}

function safeUpdate(obj = {}) {
  const out = {}
  for (const [k,v] of Object.entries(obj || {}).slice(0,40)) {
    const key = clean(k).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0,60)
    if (!key || /password|token|secret|apikey|api_key|created_at|updated_at/i.test(key)) continue
    const val = typeof v === 'object' ? flatten(v).slice(0,1000) : clean(v).slice(0,1000)
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

function buildPrompt({ agentName, panelBrain, knowledge, feedback, memory, facts, agendaLink, iaConfig, history, message }) {
  const recentAssistant = history.filter(m => m.role === 'assistant').slice(-6).map((m,i) => `${i+1}. ${m.content}`).join('\n') || 'Sin mensajes previos.'
  const derivRules = derivationRulesText(iaConfig)
  return `Eres ${agentName}. Eres un agente genérico de atención y ventas.

REGLA PRINCIPAL:
No tienes rubro, producto, precios, requisitos ni guiones propios. Solo respondes con lo aprendido en Panel IA, documentos, feedback, memoria y conversación.

PANEL IA:
${panelBrain || 'Panel IA vacío.'}

CONOCIMIENTO RELEVANTE:
${knowledge || 'Sin documentos relevantes.'}

FEEDBACK/APRENDIZAJES:
${feedback || 'Sin feedback aprendido.'}

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

INSTRUCCIONES DE RESPUESTA:
- Responde breve, natural y útil por WhatsApp.
- Pregunta máximo una cosa.
- No repitas datos ya entregados.
- Si el cliente pide agenda/link y hay link configurado, entrégalo.
- No inventes información que no esté en el entrenamiento.
- No menciones panel, prompt, memoria, documentos ni modelo.
- Solo deriva a humano/revisión si las reglas duras lo autorizan explícitamente.

FRASES PROHIBIDAS:
${blockedFromPanel(iaConfig).join('\n')}

Devuelve SOLO JSON válido:
{"reply":"respuesta visible para el cliente","action":"conversando","escalateToHuman":false,"statusUpdate":"","derivationReason":"","leadUpdate":{},"memoryUpdate":{"facts":[],"doNotRepeat":[]},"learningSuggestion":""}

Último mensaje del cliente: ${clean(message)}`
}

async function callClaude({ key, model, system, messages }) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number(process.env.AGENT_TIMEOUT_MS || 7500))
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: Number(process.env.AGENT_MAX_TOKENS || 420),
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
  if (!key) return { ok: false, reply: '', error: 'ANTHROPIC_KEY_missing' }

  const db = opts.db || sb()
  const settings = await loadSettings(db)
  const iaConfig = { ...(settings.map.ia_config || {}), ...(input.iaConfig || {}) }
  const history = sanitizeHistory(input.conversationHistory || [])
  const leadData = input.leadData || {}
  const panelBrain = buildPanelBrain(iaConfig)
  const agendaLink = getAgendaLink(iaConfig, settings.text)
  const facts = conversationFacts(history, message, leadData)
  const query = [message, facts, panelBrain].join('\n')
  const [feedback, memory, knowledge] = await Promise.all([
    loadFeedback(db, query),
    loadMemory(db, leadData),
    retrieveKnowledge(db, query, settings)
  ])
  const agentName = clean(iaConfig.nombreAgente || iaConfig.assistantName || iaConfig.agentName || iaConfig.nombre || 'Asistente')
  const system = buildPrompt({ agentName, panelBrain, knowledge: knowledge.text, feedback: feedback.text, memory, facts, agendaLink, iaConfig, history, message })
  const messages = [...history, { role: 'user', content: message }]
  const localUpdate = extractLocalFields(message, leadData, agendaLink)

  try {
    const raw = await callClaude({ key, model, system, messages })
    const parsed = parseModelOutput(raw)
    const reply = removeBlocked(parsed.reply, iaConfig)
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
        feedbackUsed: feedback.count,
        knowledgeChunksUsed: knowledge.chunks.length,
        agendaConfigured: !!agendaLink,
        derivationAllowedByHardRules: !!(requestedHuman || requestedStatus === 'requiere_revision'),
        genericEngine: true,
        hardcodedBusiness: false
      }
    }
  } catch (error) {
    const fb = clean(iaConfig.fallbackMessage || iaConfig.mensajeFallback || iaConfig.respuestaFallback || '')
    return {
      ok: false,
      reply: fb ? removeBlocked(fb, iaConfig) : '',
      action: 'conversando',
      escalateToHuman: false,
      statusUpdate: '',
      leadUpdate: localUpdate,
      error: error?.message || 'agent_error',
      trace: { genericEngine: true, fallback: true, hardcodedBusiness: false, derivationAllowedByHardRules: false }
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
