// api/agent.js — Rabito genérico estable
// Principio: el agente NO trae negocio pregrabado. Responde desde Panel IA + documentos + feedback + memoria.

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

function safeJson(text = '') {
  try { return JSON.parse(text) } catch { return null }
}

function stripCodeFence(text = '') {
  return clean(text).replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
}

function extractJson(text = '') {
  const src = stripCodeFence(text)
  const first = src.indexOf('{')
  const last = src.lastIndexOf('}')
  if (first === -1 || last === -1 || last <= first) return ''
  return src.slice(first, last + 1)
}

function flatten(value, depth = 0) {
  if (value == null || depth > 5) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return clean(value)
  if (Array.isArray(value)) return value.map(v => flatten(v, depth + 1)).filter(Boolean).join('\n')
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([k]) => !/token|apikey|api_key|secret|password|key$/i.test(k))
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
  return normalize(text).replace(/[^a-z0-9ñáéíóúü\s]/gi, ' ').split(/\s+/).filter(w => w.length >= 3)
}

function score(query = '', text = '') {
  const qs = [...new Set(words(query))]
  const nt = normalize(text)
  let s = 0
  for (const w of qs) if (nt.includes(w)) s += w.length >= 6 ? 3 : 1
  return s
}

async function readSetting(db, key, fallback = null) {
  if (!db) return fallback
  try {
    const { data } = await db.from('crm_settings').select('value').eq('key', key).single()
    return data?.value ?? fallback
  } catch { return fallback }
}

async function readSettings(db) {
  if (!db) return { map: {}, text: '' }
  const keys = ['ia_config', 'agent_training', 'rabito_knowledge', 'rabito_knowledge_chunks', 'drive_content', 'ia_knowledge', 'agent_rules']
  try {
    const { data } = await db.from('crm_settings').select('key,value').in('key', keys)
    const map = {}
    for (const row of data || []) map[row.key] = row.value
    const text = Object.entries(map).map(([k, v]) => {
      const txt = flatten(v)
      return txt ? `### ${k}\n${txt}` : ''
    }).filter(Boolean).join('\n\n').slice(0, 35000)
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

function knowledgeFromSettings(settings = {}) {
  const out = []

  const chunksValue = settings.map?.rabito_knowledge_chunks
  const chunks = Array.isArray(chunksValue?.chunks) ? chunksValue.chunks : Array.isArray(chunksValue) ? chunksValue : []
  for (const c of chunks) {
    const content = clean(c.content || c.contenido || c.text || c.texto)
    if (content) out.push({ title: clean(c.title || c.titulo || c.docName || c.nombre || 'Conocimiento'), content, active: c.activo !== false })
  }

  const docsGroups = [
    settings.map?.rabito_knowledge?.docs,
    settings.map?.ia_config?.cerebroDocs,
    settings.map?.drive_content?.files,
    settings.map?.ia_knowledge?.docs
  ]
  for (const group of docsGroups) {
    if (!Array.isArray(group)) continue
    for (const d of group) {
      const content = clean(d.content || d.contenido || d.text || d.extract || d.body)
      if (content) out.push({ title: clean(d.name || d.title || d.nombre || 'Documento'), content, active: d.activo !== false })
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
        .limit(300)
      for (const c of data || []) {
        const content = clean(c.content || c.contenido)
        if (content && c.activo !== false) rows.push({ title: clean(c.title || c.titulo || 'Conocimiento'), content, tags: flatten([c.tags, c.producto, c.canal]) })
      }
    } catch {}
  }

  rows.push(...knowledgeFromSettings(settings))
  if (!rows.length) return { text: settings.text.slice(0, 18000), used: [] }

  const ranked = rows.map((r, i) => ({ ...r, i, s: score(query, `${r.title}\n${r.tags || ''}\n${r.content}`) }))
    .sort((a, b) => b.s - a.s)
  const picked = ranked.filter(r => r.s > 0).slice(0, 6)
  const final = picked.length ? picked : ranked.slice(0, 4)
  return {
    text: final.map((r, idx) => `### Conocimiento ${idx + 1}: ${r.title}\n${r.content.slice(0, 2200)}`).join('\n\n'),
    used: final.map(r => ({ title: r.title, score: r.s }))
  }
}

function normalizeTrainingItem(x = {}) {
  return {
    original: clean(x.original || x.msg_content || x.message || x.before || x.incorrect || x.mensajeOriginal || x.pregunta || ''),
    improved: clean(x.improved || x.correction || x.after || x.correct || x.respuestaCorrecta || x.mensajeMejorado || x.respuesta || ''),
    reason: clean(x.reason || x.feedback || x.explanation || x.instruccion || x.regla || x.razon || ''),
    active: x.active !== false && x.activo !== false
  }
}

async function readTraining(db, query = '', settings = {}) {
  const items = []

  const saved = settings.map?.agent_training
  const savedArr = Array.isArray(saved) ? saved : Array.isArray(saved?.items) ? saved.items : []
  items.push(...savedArr)

  const iaTraining = settings.map?.ia_config?.entrenamiento
  if (Array.isArray(iaTraining)) items.push(...iaTraining)

  if (db) {
    try {
      const { data } = await db.from('crm_conv_feedback')
        .select('msg_content,feedback,correction,improved,created_at')
        .order('created_at', { ascending: false })
        .limit(100)
      items.push(...(data || []))
    } catch {}
  }

  const normalized = items.map(normalizeTrainingItem).filter(x => x.active && (x.original || x.improved || x.reason))
  const ranked = normalized.map(x => ({ ...x, s: score(query, `${x.original}\n${x.reason}\n${x.improved}`) }))
    .sort((a, b) => b.s - a.s)
  const picked = ranked.filter(x => x.s > 0).slice(0, 8)
  const final = picked.length ? picked : ranked.slice(0, 6)

  return {
    items: final,
    text: final.map((x, i) => `### Aprendizaje ${i + 1}\nSituación: ${x.original || 'general'}\nRegla/razón: ${x.reason || 'sin razón'}\nRespuesta preferida: ${x.improved || 'sin respuesta exacta'}`).join('\n\n'),
    used: final.map(x => ({ original: x.original, score: x.s }))
  }
}

function directTrainingReply(training, message, iaConfig) {
  const exact = (training.items || []).find(x => x.improved && (normalize(x.original) === normalize(message) || x.s >= 6))
  if (!exact) return ''
  return cleanOutput(exact.improved, iaConfig)
}

function panelText(iaConfig = {}) {
  const priority = [
    'nombreAgente','agentName','nombre','rol','identidad','personalidad','tono',
    'oferta','productos','servicios','catalogo','propuestaValor','beneficios',
    'procesoVenta','pasos','flujo','guion','metodoVenta',
    'reglas','reglasDuras','reglasDerivacion','reglasRevision','instrucciones','noDecir','frasesProhibidas',
    'objeciones','faq','preguntasFrecuentes','entrenamiento','respuestasGuardadas',
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
  for (const [k, v] of Object.entries(iaConfig)) {
    if (used.has(k) || /token|apikey|secret|password/i.test(k)) continue
    const txt = flatten(v)
    if (txt) blocks.push(`### ${k}\n${txt}`)
  }
  return blocks.join('\n\n').slice(0, 30000)
}

function blockedPhrases(iaConfig = {}) {
  const raw = flatten([iaConfig.frasesProhibidas, iaConfig.noDecir, iaConfig.blockedPhrases, iaConfig.reglasDuras])
  return raw.split('\n').map(clean).filter(x => x.length >= 4 && x.length <= 180)
}

function cleanOutput(reply = '', iaConfig = {}) {
  let out = stripCodeFence(reply)
  if (!out) return ''
  if (out.startsWith('{')) out = parseOutput(out).reply || ''
  out = clean(out.replace(/\[ACCION:[^\]]+\]/gi, '').replace(/\[DATOS:[^\]]+\]/gi, '').replace(/\*\*/g, ''))
  for (const p of blockedPhrases(iaConfig)) {
    const re = new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig')
    out = out.replace(re, '')
  }
  out = out.replace(/\s{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  const max = Number(iaConfig.maxCaracteresRespuesta || iaConfig.replyMaxLength || 700) || 700
  if (out.length > max) out = out.slice(0, Math.max(160, max - 20)).replace(/\s+\S*$/, '') + '...'
  return out
}

function parseOutput(raw = '') {
  const src = stripCodeFence(raw)
  const parsed = safeJson(src) || safeJson(extractJson(src))
  if (parsed && typeof parsed === 'object') {
    return {
      reply: clean(parsed.reply || parsed.message || parsed.text || ''),
      action: clean(parsed.action || 'conversando'),
      statusUpdate: clean(parsed.statusUpdate || parsed.status || ''),
      leadUpdate: parsed.leadUpdate && typeof parsed.leadUpdate === 'object' ? parsed.leadUpdate : {},
      memoryUpdate: parsed.memoryUpdate && typeof parsed.memoryUpdate === 'object' ? parsed.memoryUpdate : {},
      escalateToHuman: parsed.escalateToHuman === true,
      reason: clean(parsed.reason || parsed.derivationReason || '')
    }
  }
  return { reply: src, action: 'conversando', statusUpdate: '', leadUpdate: {}, memoryUpdate: {}, escalateToHuman: false, reason: '' }
}

function getFallback(iaConfig = {}, training = null) {
  const fromPanel = clean(iaConfig.mensajeFallback || iaConfig.fallbackMessage || iaConfig.respuestaFallback || '')
  if (fromPanel) return fromPanel
  const fromTraining = (training?.items || []).find(x => x.improved && /fallback|cuando no sepas|respuesta base|saludo|inicio/i.test(`${x.original} ${x.reason}`))
  if (fromTraining?.improved) return fromTraining.improved
  return 'Te leo. Cuéntame un poco más para orientarte bien.'
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
  const knowledge = await readKnowledge(db, input, settings)
  const training = await readTraining(db, input, settings)
  const direct = directTrainingReply(training, input, iaConfig)

  if (direct) {
    return { reply: direct, action: 'conversando', leadUpdate: {}, statusUpdate: '', trace: { directTraining: true, trainingUsed: training.used } }
  }

  const ANTHROPIC_KEY = clean(process.env.ANTHROPIC_KEY || process.env.VITE_ANTHROPIC_KEY || process.env.CLAUDE_API_KEY)
  if (!ANTHROPIC_KEY) {
    const fallback = cleanOutput(getFallback(iaConfig, training), iaConfig)
    console.error('[AGENT] missing Anthropic key')
    return { reply: fallback, action: 'fallback_sin_key', leadUpdate: {}, statusUpdate: '', trace: { missingKey: true, trainingCount: training.items.length } }
  }

  const agentName = clean(iaConfig.nombreAgente || iaConfig.agentName || iaConfig.nombre || 'Asistente')
  const agenda = clean(iaConfig.agendaLink || iaConfig.linkAgenda || iaConfig.urlAgenda || iaConfig.calendlyLink || '')

  const system = `Eres ${agentName}. Eres un agente comercial genérico.

REGLA CENTRAL:
No tienes negocio, producto, guion ni oferta propia en el código. Solo puedes vender, explicar y orientar usando lo que está en el PANEL IA, CONOCIMIENTO, DOCUMENTOS y APRENDIZAJES.

PANEL IA:
${panel || 'Panel IA sin información suficiente.'}

APRENDIZAJES Y FEEDBACK PERMANENTE:
${training.text || 'Sin aprendizajes cargados.'}

CONOCIMIENTO RELEVANTE:
${knowledge.text || 'Sin documentos relevantes.'}

DATOS DEL CONTACTO:
${flatten(leadData) || 'Sin datos estructurados.'}

LINK DE AGENDA DISPONIBLE:
${agenda || 'No configurado'}

INSTRUCCIONES:
- Responde en español natural de WhatsApp.
- Sé breve, claro y vendedor.
- No repitas preguntas ya respondidas en el historial.
- Usa el feedback y reglas del panel por sobre tu criterio general.
- Si el cliente ya entregó lo necesario según el panel, avanza al siguiente paso definido en el panel.
- Si corresponde agendar y hay link de agenda, entrega el link.
- No inventes precios, condiciones, promesas ni datos que no estén en el conocimiento.
- Solo deriva a humano o revisión si las reglas duras del panel lo indican explícitamente.
- Devuelve SOLO JSON válido, sin markdown:
{"reply":"mensaje visible al cliente","action":"conversando|calificado|agenda|sin_datos","statusUpdate":"activo|calificado|frio|no_interesado|","leadUpdate":{},"memoryUpdate":{},"escalateToHuman":false}`

  const msgs = []
  const hist = Array.isArray(conversationHistory) ? conversationHistory.slice(-16) : []
  for (const h of hist) {
    const role = h.role === 'assistant' ? 'assistant' : 'user'
    const content = clean(h.content)
    if (content) msgs.push({ role, content })
  }
  msgs.push({ role: 'user', content: input })

  const modelCandidates = [
    clean(process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL),
    'claude-3-5-haiku-latest',
    'claude-3-5-haiku-20241022',
    'claude-haiku-4-5-20251001'
  ].filter(Boolean)

  let lastError = ''
  for (const model of [...new Set(modelCandidates)]) {
    try {
      console.log('[AGENT] Claude start', model)
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({ model, max_tokens: 700, temperature: 0.25, system, messages: msgs })
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || data.error) throw new Error(data?.error?.message || `HTTP ${r.status}`)

      const raw = data?.content?.map(c => c.text || '').join('\n').trim() || ''
      const parsed = parseOutput(raw)
      const reply = cleanOutput(parsed.reply, iaConfig)
      if (!reply) throw new Error('empty_model_reply')

      const statusUpdate = validStatus(parsed.statusUpdate, iaConfig)
      console.log('[AGENT] Claude ok', { model, chars: reply.length, statusUpdate })
      return {
        reply,
        action: parsed.action || 'conversando',
        statusUpdate,
        leadUpdate: parsed.leadUpdate || {},
        memoryUpdate: parsed.memoryUpdate || {},
        escalateToHuman: parsed.escalateToHuman === true && /humano|ejecutivo|asesor|derivar/i.test(flatten([iaConfig.reglasDuras, iaConfig.reglasDerivacion])),
        trace: debug ? { model, knowledgeUsed: knowledge.used, trainingUsed: training.used } : undefined
      }
    } catch (e) {
      lastError = e.message
      console.error('[AGENT] Claude error', model, e.message)
    }
  }

  const fallback = cleanOutput(getFallback(iaConfig, training), iaConfig)
  return {
    reply: fallback,
    action: 'fallback_model_error',
    statusUpdate: '',
    leadUpdate: {},
    memoryUpdate: {},
    trace: { fallback: true, error: lastError, trainingCount: training.items.length, knowledgeCount: knowledge.used.length }
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
