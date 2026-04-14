// api/agent.js — Motor genérico de ventas Rabito
// No contiene guiones de negocio. La respuesta se construye desde Panel IA + documentos + feedback + memoria.

import { createClient } from '@supabase/supabase-js'

const clean = (v = '') => String(v ?? '').trim()
const normalize = (v = '') => clean(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const nowIso = () => new Date().toISOString()

function getSupabase() {
  const url = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const key = clean(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

function parseMaybeJson(v) {
  if (typeof v !== 'string') return v
  const txt = clean(v)
  if (!txt) return v
  if (!(txt.startsWith('{') || txt.startsWith('['))) return v
  try { return JSON.parse(txt) } catch { return v }
}

function stripCodeFence(text = '') {
  return clean(text).replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
}

function jsonSlice(text = '') {
  const src = stripCodeFence(text)
  const first = src.indexOf('{')
  const last = src.lastIndexOf('}')
  if (first === -1 || last === -1 || last <= first) return ''
  return src.slice(first, last + 1)
}

function parseOutput(raw = '') {
  const src = stripCodeFence(raw)
  try {
    const parsed = JSON.parse(src)
    return typeof parsed === 'object' && parsed ? parsed : { reply: src }
  } catch {}
  const candidate = jsonSlice(src)
  if (candidate) {
    try {
      const parsed = JSON.parse(candidate)
      return typeof parsed === 'object' && parsed ? parsed : { reply: src }
    } catch {}
  }
  return { reply: src }
}

function flatten(value, depth = 0) {
  value = parseMaybeJson(value)
  if (value == null || depth > 6) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return clean(value)
  if (Array.isArray(value)) return value.map(v => flatten(v, depth + 1)).filter(Boolean).join('\n')
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([k]) => !/token|apikey|api_key|secret|password|service_key|anthropic/i.test(k))
      .map(([k, v]) => {
        const txt = flatten(v, depth + 1)
        return txt ? `${k}: ${txt}` : ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function words(text = '') {
  return normalize(text).replace(/[^a-z0-9ñ\s]/gi, ' ').split(/\s+/).filter(w => w.length >= 3)
}

function score(query = '', text = '') {
  const qs = [...new Set(words(query))]
  const nt = normalize(text)
  let s = 0
  for (const w of qs) {
    if (!nt.includes(w)) continue
    s += w.length >= 7 ? 4 : w.length >= 5 ? 2 : 1
  }
  return s
}

function historyText(history = []) {
  return (Array.isArray(history) ? history : [])
    .slice(-24)
    .map(m => `${m.role === 'assistant' ? 'Rabito' : 'Cliente'}: ${clean(m.content)}`)
    .filter(x => x && !x.includes('[Sistema]'))
    .join('\n')
}

async function readSettings(db) {
  if (!db) return { map: {}, text: '' }
  const keys = [
    'ia_config',
    'agent_training',
    'rabito_knowledge',
    'rabito_knowledge_chunks',
    'drive_content',
    'ia_knowledge',
    'agent_rules'
  ]
  try {
    const { data, error } = await db.from('crm_settings').select('key,value').in('key', keys)
    if (error) throw error
    const map = {}
    for (const row of data || []) map[row.key] = parseMaybeJson(row.value)
    const text = Object.entries(map).map(([k, v]) => {
      const txt = flatten(v)
      return txt ? `### ${k}\n${txt}` : ''
    }).filter(Boolean).join('\n\n').slice(0, 26000)
    return { map, text }
  } catch (e) {
    console.error('[AGENT] readSettings error:', e.message)
    return { map: {}, text: '' }
  }
}

function mergeIaConfig(reqConfig = {}, settings = {}) {
  const saved = settings.map?.ia_config && typeof settings.map.ia_config === 'object' ? settings.map.ia_config : {}
  return { ...saved, ...(reqConfig && typeof reqConfig === 'object' ? reqConfig : {}) }
}

function panelText(iaConfig = {}) {
  const priority = [
    'nombreAgente','agentName','nombre','rol','identidad','personalidad','tono',
    'oferta','productos','productosRabito','servicios','catalogo','propuestaValor','beneficios',
    'procesoVenta','pasos','pasosRabito','flujo','guion','metodoVenta',
    'reglas','reglasDuras','reglasEntrenamiento','reglasDerivacion','reglasRevision','instrucciones','noDecir','frasesProhibidas',
    'objeciones','faq','preguntasFrecuentes','respuestasGuardadas','entrenamiento',
    'agendaLink','linkAgenda','urlAgenda','mensajeFallback','fallbackMessage'
  ]
  const used = new Set()
  const blocks = []
  for (const k of priority) {
    if (!(k in iaConfig)) continue
    used.add(k)
    const txt = flatten(iaConfig[k])
    if (txt) blocks.push(`### ${k}\n${txt}`)
  }
  for (const [k, v] of Object.entries(iaConfig || {})) {
    if (used.has(k) || /token|apikey|secret|password/i.test(k)) continue
    const txt = flatten(v)
    if (txt) blocks.push(`### ${k}\n${txt}`)
  }
  return blocks.join('\n\n').slice(0, 30000)
}

function knowledgeFromSettings(settings = {}) {
  const out = []
  const chunksValue = parseMaybeJson(settings.map?.rabito_knowledge_chunks)
  const chunks = Array.isArray(chunksValue?.chunks) ? chunksValue.chunks : Array.isArray(chunksValue) ? chunksValue : []
  for (const c of chunks) {
    const content = clean(c.content || c.contenido || c.text || c.texto)
    if (content) out.push({ title: clean(c.title || c.titulo || c.docName || c.nombre || 'Conocimiento'), content, tags: flatten([c.tags, c.carpeta, c.categoria, c.producto, c.canal]), active: c.activo !== false })
  }

  const docsGroups = [
    settings.map?.rabito_knowledge?.docs,
    settings.map?.rabito_knowledge?.items,
    settings.map?.ia_config?.cerebroDocs,
    settings.map?.drive_content?.files,
    settings.map?.ia_knowledge?.docs
  ]
  for (const group of docsGroups) {
    if (!Array.isArray(group)) continue
    for (const d of group) {
      const content = clean(d.content || d.contenido || d.text || d.extract || d.body)
      if (content) out.push({ title: clean(d.name || d.title || d.nombre || 'Documento'), content, tags: flatten([d.carpeta, d.categoria, d.tipo]), active: d.activo !== false })
    }
  }
  return out.filter(x => x.active && x.content)
}

async function readKnowledge(db, query = '', settings = {}) {
  const rows = []
  if (db) {
    try {
      const { data } = await db.from('crm_knowledge_chunks')
        .select('id,title,titulo,content,contenido,tags,producto,canal,activo')
        .limit(500)
      for (const c of data || []) {
        const content = clean(c.content || c.contenido)
        if (content && c.activo !== false) rows.push({ title: clean(c.title || c.titulo || 'Conocimiento'), content, tags: flatten([c.tags, c.producto, c.canal]) })
      }
    } catch (e) {
      console.warn('[AGENT] crm_knowledge_chunks unavailable:', e.message)
    }
  }

  rows.push(...knowledgeFromSettings(settings))
  if (!rows.length) return { text: settings.text.slice(0, 12000), used: [], total: 0 }

  const ranked = rows.map((r, i) => ({ ...r, i, s: score(query, `${r.title}\n${r.tags || ''}\n${r.content}`) }))
    .sort((a, b) => b.s - a.s)
  const picked = ranked.filter(r => r.s > 0).slice(0, 7)
  const final = picked.length ? picked : ranked.slice(0, 4)
  return {
    text: final.map((r, idx) => `### Documento usado ${idx + 1}: ${r.title}\n${r.content.slice(0, 2500)}`).join('\n\n'),
    used: final.map(r => ({ title: r.title, score: r.s })),
    total: rows.length
  }
}

function normalizeTrainingItem(x = {}) {
  x = parseMaybeJson(x) || {}
  return {
    id: clean(x.id || x.created_at || ''),
    original: clean(x.original || x.msg_content || x.message || x.before || x.incorrect || x.mensajeOriginal || x.pregunta || ''),
    context: clean(x.context || x.pregunta || x.prompt || x.userMessage || x.cliente || x.entrada || ''),
    improved: clean(x.improved || x.correction || x.after || x.correct || x.respuestaCorrecta || x.mensajeMejorado || x.respuesta || ''),
    reason: clean(x.reason || x.razon || x.feedback || x.explanation || x.instruccion || x.regla || ''),
    active: x.active !== false && x.activo !== false
  }
}

async function readTraining(db, query = '', settings = {}) {
  const items = []

  const saved = parseMaybeJson(settings.map?.agent_training)
  const savedArr = Array.isArray(saved) ? saved : Array.isArray(saved?.items) ? saved.items : []
  items.push(...savedArr)

  const iaTraining = settings.map?.ia_config?.entrenamiento
  if (Array.isArray(iaTraining)) items.push(...iaTraining)

  const reglasEntrenamiento = settings.map?.ia_config?.reglasEntrenamiento
  if (Array.isArray(reglasEntrenamiento)) {
    items.push(...reglasEntrenamiento.map(r => ({ reason: r.title || r.titulo || 'Regla', improved: r.content || r.contenido || r.text || '', context: r.title || r.titulo || '' })))
  }

  if (db) {
    try {
      const { data } = await db.from('crm_conv_feedback')
        .select('msg_content,feedback,correction,improved,created_at')
        .order('created_at', { ascending: false })
        .limit(200)
      items.push(...(data || []))
    } catch (e) {
      console.warn('[AGENT] crm_conv_feedback unavailable:', e.message)
    }
  }

  const normalized = items.map(normalizeTrainingItem).filter(x => x.active && (x.context || x.original || x.improved || x.reason))
  const ranked = normalized.map(x => {
    const haystack = `${x.context}\n${x.original}\n${x.reason}\n${x.improved}`
    return { ...x, score: score(query, haystack), haystack }
  }).sort((a, b) => b.score - a.score)

  const picked = ranked.filter(x => x.score > 0).slice(0, 12)
  const final = picked.length ? picked : ranked.slice(0, 10)

  return {
    items: final,
    allItems: normalized,
    text: final.map((x, i) => `### Aprendizaje ${i + 1}\nContexto donde aplica: ${x.context || 'general'}\nRespuesta mala/anterior: ${x.original || 'sin ejemplo'}\nRegla o razón: ${x.reason || 'sin razón'}\nRespuesta o comportamiento correcto: ${x.improved || 'sin respuesta exacta'}`).join('\n\n'),
    used: final.map(x => ({ context: x.context, original: x.original, correction: x.improved, reason: x.reason, score: x.score })),
    total: normalized.length
  }
}

function blockedPhrases(iaConfig = {}) {
  const raw = flatten([iaConfig.frasesProhibidas, iaConfig.noDecir, iaConfig.blockedPhrases])
  return raw.split('\n').map(clean).filter(x => x.length >= 4 && x.length <= 180)
}

function cleanOutput(reply = '', iaConfig = {}) {
  let out = stripCodeFence(reply)
  if (!out) return ''
  if (out.startsWith('{')) out = parseOutput(out).reply || ''
  out = clean(String(out).replace(/\[ACCION:[^\]]+\]/gi, '').replace(/\[DATOS:[^\]]+\]/gi, '').replace(/\*\*/g, ''))
  for (const p of blockedPhrases(iaConfig)) {
    try {
      const re = new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig')
      out = out.replace(re, '')
    } catch {}
  }
  out = out.replace(/\s{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  const max = Number(iaConfig.maxCaracteresRespuesta || iaConfig.replyMaxLength || 900)
  if (out.length > max) out = out.slice(0, max - 1).trim()
  return out
}

function validStatus(status = '', iaConfig = {}) {
  const s = normalize(status).replace(/\s+/g, '_')
  const allowed = ['activo', 'calificado', 'frio', 'no_interesado']
  if (allowed.includes(s)) return s
  if (s === 'requiere_revision') {
    const rules = normalize(flatten([iaConfig.reglasDuras, iaConfig.reglasRevision, iaConfig.reglasDerivacion]))
    return /requiere_revision|requiere revision|derivar a revision/.test(rules) ? s : ''
  }
  return ''
}

function trainingFallback(iaConfig, training, query) {
  const useful = (training.items || []).filter(x => x.improved)
  if (!useful.length) return ''
  const ranked = useful.map(x => ({ ...x, localScore: score(query, `${x.context}\n${x.original}\n${x.reason}`) })).sort((a, b) => b.localScore - a.localScore)
  const best = ranked[0]
  if (best && best.localScore >= 2) return cleanOutput(best.improved, iaConfig)
  return ''
}

export async function generateAgentResponse({
  message,
  conversationHistory = [],
  iaConfig: reqIaConfig = {},
  leadData = {},
  debug = false
} = {}) {
  const input = clean(message)
  if (!input) return { reply: '', action: 'sin_mensaje', leadUpdate: {}, statusUpdate: '', trace: { error: 'empty_message' } }

  const db = getSupabase()
  const settings = await readSettings(db)
  const iaConfig = mergeIaConfig(reqIaConfig, settings)
  const panel = panelText(iaConfig)
  const hText = historyText(conversationHistory)
  const searchQuery = `${input}\n${hText}\n${flatten(leadData)}`.slice(-9000)
  const training = await readTraining(db, searchQuery, settings)
  const knowledge = await readKnowledge(db, searchQuery, settings)

  const ANTHROPIC_KEY = clean(process.env.ANTHROPIC_KEY || process.env.VITE_ANTHROPIC_KEY || process.env.CLAUDE_API_KEY)
  if (!ANTHROPIC_KEY) {
    const fb = trainingFallback(iaConfig, training, searchQuery)
    console.error('[AGENT] missing Anthropic key')
    return { reply: fb, action: 'fallback_sin_key', leadUpdate: {}, statusUpdate: '', trace: { missingKey: true, trainingTotal: training.total, knowledgeTotal: knowledge.total, feedbackUsed: training.used } }
  }

  const agentName = clean(iaConfig.nombreAgente || iaConfig.agentName || iaConfig.nombre || 'Asistente')
  const agenda = clean(iaConfig.agendaLink || iaConfig.linkAgenda || iaConfig.urlAgenda || iaConfig.calendlyLink || '')

  const system = `Eres ${agentName}, un agente comercial genérico de WhatsApp.

PRINCIPIO ABSOLUTO:
No tienes guion de negocio dentro del código. Solo puedes usar estas fuentes, en este orden de prioridad:
1) APRENDIZAJES / FEEDBACK PERMANENTE.
2) REGLAS DEL PANEL IA.
3) CONOCIMIENTO Y DOCUMENTOS.
4) HISTORIAL DEL CLIENTE.

PANEL IA:
${panel || 'Panel IA sin información suficiente.'}

APRENDIZAJES / FEEDBACK PERMANENTE:
${training.text || 'Sin aprendizajes cargados.'}

CONOCIMIENTO / DOCUMENTOS RELEVANTES:
${knowledge.text || 'Sin documentos relevantes.'}

DATOS DEL CONTACTO:
${flatten(leadData) || 'Sin datos estructurados.'}

LINK DE AGENDA:
${agenda || 'No configurado'}

REGLAS DE CONVERSACIÓN:
- Responde SOLO el último mensaje del cliente, usando el historial para no repetir.
- Si el cliente manifiesta intención, avanza al siguiente paso del panel. No expliques quién es la empresa salvo que el cliente pregunte explícitamente "qué es", "quiénes son" o similar.
- Si el cliente se queja de la respuesta, reconoce el error en una frase corta y corrige el rumbo según el feedback.
- No preguntes un dato que ya aparece en el historial o en datos del contacto.
- Haz máximo una pregunta clara por mensaje, salvo que el panel ordene otra cosa.
- No uses frases prohibidas ni frases de relleno.
- No inventes precios, condiciones, beneficios, promesas o políticas.
- Solo deriva a humano/revisión si una regla dura del Panel IA lo indica explícitamente.
- Si corresponde agendar y hay link de agenda, entrega el link.
- Devuelve SOLO JSON válido, sin markdown:
{"reply":"mensaje visible al cliente","action":"conversando|calificado|agenda|sin_datos","statusUpdate":"activo|calificado|frio|no_interesado|","leadUpdate":{},"memoryUpdate":{},"escalateToHuman":false}`

  const msgs = []
  const hist = Array.isArray(conversationHistory) ? conversationHistory.slice(-18) : []
  for (const h of hist) {
    const role = h.role === 'assistant' ? 'assistant' : 'user'
    const content = clean(h.content)
    if (content && !content.startsWith('[Sistema]')) msgs.push({ role, content })
  }
  msgs.push({ role: 'user', content: input })

  const modelCandidates = [
    clean(process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL),
    'claude-3-5-haiku-latest',
    'claude-3-5-haiku-20241022'
  ].filter(Boolean)

  let lastError = ''
  for (const model of [...new Set(modelCandidates)]) {
    try {
      console.log('[AGENT] Claude start', JSON.stringify({ model, trainingTotal: training.total, knowledgeTotal: knowledge.total, feedbackPicked: training.used.length, knowledgePicked: knowledge.used.length }))
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({ model, max_tokens: 650, temperature: 0.15, system, messages: msgs })
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || data.error) throw new Error(data?.error?.message || `HTTP ${r.status}`)
      const raw = data?.content?.map(c => c.text || '').join('\n').trim() || ''
      const parsed = parseOutput(raw)
      let reply = cleanOutput(parsed.reply, iaConfig)
      if (!reply) {
        const fb = trainingFallback(iaConfig, training, searchQuery)
        if (fb) reply = fb
      }
      if (!reply) throw new Error('empty_model_reply')

      const statusUpdate = validStatus(parsed.statusUpdate, iaConfig)
      console.log('[AGENT] Claude ok', JSON.stringify({ model, chars: reply.length, statusUpdate }))
      return {
        reply,
        action: parsed.action || 'conversando',
        statusUpdate,
        leadUpdate: parsed.leadUpdate && typeof parsed.leadUpdate === 'object' ? parsed.leadUpdate : {},
        memoryUpdate: parsed.memoryUpdate && typeof parsed.memoryUpdate === 'object' ? parsed.memoryUpdate : {},
        escalateToHuman: parsed.escalateToHuman === true && /humano|ejecutivo|asesor|derivar/i.test(flatten([iaConfig.reglasDuras, iaConfig.reglasDerivacion])),
        trace: {
          panelLoaded: !!panel,
          agendaConfigured: !!agenda,
          trainingTotal: training.total,
          knowledgeTotal: knowledge.total,
          feedbackUsed: training.used,
          chunksUsed: knowledge.used,
          model
        }
      }
    } catch (e) {
      lastError = e.message
      console.error('[AGENT] Claude error', model, e.message)
    }
  }

  const fallback = trainingFallback(iaConfig, training, searchQuery) || cleanOutput(iaConfig.mensajeFallback || iaConfig.fallbackMessage || '', iaConfig)
  return {
    reply: fallback,
    action: 'fallback_model_error',
    statusUpdate: '',
    leadUpdate: {},
    memoryUpdate: {},
    trace: { fallback: true, error: lastError, panelLoaded: !!panel, trainingTotal: training.total, knowledgeTotal: knowledge.total, feedbackUsed: training.used, chunksUsed: knowledge.used }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })

  const { message, conversationHistory = [], iaConfig = {}, leadData = {}, debug = false } = req.body || {}
  try {
    const result = await generateAgentResponse({ message, conversationHistory, iaConfig, leadData, debug })
    return res.status(200).json(result)
  } catch (e) {
    console.error('[AGENT] fatal', e.message)
    return res.status(200).json({ reply: '', error: e.message, action: 'error', leadUpdate: {}, statusUpdate: '' })
  }
}
