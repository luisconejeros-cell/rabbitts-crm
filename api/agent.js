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
    context: clean(x.context || x.pregunta || x.prompt || x.userMessage || x.cliente || x.entrada || ''),
    improved: clean(x.improved || x.correction || x.after || x.correct || x.respuestaCorrecta || x.mensajeMejorado || x.respuesta || ''),
    reason: clean(x.reason || x.feedback || x.explanation || x.instruccion || x.regla || x.razon || ''),
    active: x.active !== false && x.activo !== false
  }
}

function recentConversationText(history = [], max = 8) {
  if (!Array.isArray(history)) return ''
  return history.slice(-max).map(m => `${m.role === 'assistant' ? 'Rabito' : 'Cliente'}: ${clean(m.content)}`).filter(x => x.trim()).join('\n')
}

function isComplaintOrCorrection(text = '') {
  const q = normalize(text)
  return /no pregunte|no preguntes|otra vez|lo mismo|te lo di|ya te lo di|no entendiste|mal|incorrecto|no es eso|no sirve|no uses|prohibid|no quiero|por que me dices|por qué me dices|de nuevo/.test(q)
}

function isWeakGenericReply(text = '') {
  const q = normalize(text)
  return !q || /^(entiendo|te leo|perfecto|claro|ok|dale|recibido)[\s\.,!]*(para avanzar|cuentame|cuéntame|dime|revisemos|estoy aca|estoy acá)/.test(q) ||
    /dime cual es el dato principal que quieres resolver ahora|cuentame un poco mas para orientarte bien|cuéntame un poco más para orientarte bien/.test(q)
}

function applyClientFacts(template = '', historyText = '', leadData = {}) {
  // No inventa campos. Solo reemplaza marcadores comunes si existen.
  let out = clean(template)
  const facts = flatten(leadData)
  const all = `${historyText}\n${facts}`
  const email = (all.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || ''
  const phone = (all.match(/\+?\d[\d\s().-]{7,}\d/) || [])[0] || ''
  if (email) out = out.replace(/\{\{?email\}?\}/gi, email)
  if (phone) out = out.replace(/\{\{?(telefono|phone)\}?\}/gi, phone)
  return out
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

  const normalized = items.map(normalizeTrainingItem).filter(x => x.active && (x.context || x.original || x.improved || x.reason))
  const ranked = normalized.map(x => {
    const haystack = `${x.context}
${x.original}
${x.reason}
${x.improved}`
    return { ...x, s: score(query, haystack), haystack }
  }).sort((a, b) => b.s - a.s)
  const picked = ranked.filter(x => x.s > 0).slice(0, 10)
  const final = picked.length ? picked : ranked.slice(0, 8)

  return {
    items: final,
    allItems: normalized,
    text: final.map((x, i) => `### Aprendizaje ${i + 1}
Contexto del cliente: ${x.context || 'general'}
Respuesta mala/anterior: ${x.original || 'sin ejemplo'}
Regla/razón: ${x.reason || 'sin razón'}
Respuesta preferida: ${x.improved || 'sin respuesta exacta'}`).join('\n\n'),
    used: final.map(x => ({ context: x.context, original: x.original, correction: x.improved, score: x.s }))
  }
}

function directTrainingReply(training, message, iaConfig, history = [], leadData = {}) {
  const q = normalize(message)
  const historyText = recentConversationText(history, 10)
  const lastAssistant = [...(Array.isArray(history) ? history : [])].reverse().find(m => m.role === 'assistant' && clean(m.content))?.content || ''
  const combined = `${message}\n${historyText}\n${flatten(leadData)}`

  const candidates = [...(training.items || []), ...(training.allItems || [])]
    .filter(x => x?.improved && x.active !== false)
    .map(x => ({
      ...x,
      matchScore: Math.max(
        score(combined, `${x.context}\n${x.original}\n${x.reason}\n${x.improved}`),
        score(lastAssistant, `${x.original}\n${x.context}\n${x.reason}`)
      )
    }))
    .sort((a,b) => b.matchScore - a.matchScore)

  // Caso crítico: cliente reclama porque Rabito preguntó mal. Usar la corrección asociada a la última respuesta.
  if (isComplaintOrCorrection(message) && lastAssistant) {
    const fix = candidates.find(x => x.matchScore >= 2 || score(lastAssistant, x.original) >= 2 || normalize(x.original).includes(normalize(lastAssistant).slice(0, 40)))
    if (fix?.improved) return cleanOutput(applyClientFacts(fix.improved, historyText, leadData), iaConfig)
  }

  const exact = candidates.find(x => x.improved && (
    normalize(x.context) === q ||
    normalize(x.original) === q ||
    (normalize(x.reason) && normalize(x.reason).includes(q) && q.length > 8) ||
    x.matchScore >= 10
  ))
  if (!exact) return ''
  return cleanOutput(applyClientFacts(exact.improved, historyText, leadData), iaConfig)
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

function getFallback(iaConfig = {}, training = null, input = '', history = [], leadData = {}) {
  const historyText = recentConversationText(history, 10)
  const fromPanel = clean(iaConfig.mensajeFallback || iaConfig.fallbackMessage || iaConfig.respuestaFallback || '')
  if (fromPanel && !isWeakGenericReply(fromPanel)) return applyClientFacts(fromPanel, historyText, leadData)

  const candidates = [
    ...(training?.items || []),
    ...(training?.allItems || [])
  ].filter(x => x?.improved)

  const best = candidates
    .map(x => ({ ...x, s2: score(`${input}\n${historyText}\n${flatten(leadData)}`, `${x.context}\n${x.original}\n${x.reason}\n${x.improved}`) }))
    .sort((a, b) => b.s2 - a.s2)[0]
  if (best?.improved && best.s2 > 0) return applyClientFacts(best.improved, historyText, leadData)

  // Último recurso: si el panel trae un mensaje inicial explícito, usarlo. Si no existe, responder vacío para no inventar.
  const initial = clean(iaConfig.mensajeInicial || iaConfig.initialMessage || '')
  return initial && !isWeakGenericReply(initial) ? applyClientFacts(initial, historyText, leadData) : ''
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
  const historyQuery = recentConversationText(conversationHistory, 10)
  const retrievalQuery = `${input}\n${historyQuery}\n${flatten(leadData)}`
  const knowledge = await readKnowledge(db, retrievalQuery, settings)
  const training = await readTraining(db, retrievalQuery, settings)
  const direct = directTrainingReply(training, input, iaConfig, conversationHistory, leadData)

  if (direct) {
    return { reply: direct, action: 'conversando', leadUpdate: {}, statusUpdate: '', trace: { directTraining: true, trainingUsed: training.used } }
  }

  const ANTHROPIC_KEY = clean(process.env.ANTHROPIC_KEY || process.env.VITE_ANTHROPIC_KEY || process.env.CLAUDE_API_KEY)
  if (!ANTHROPIC_KEY) {
    const fallback = cleanOutput(getFallback(iaConfig, training, input, conversationHistory, leadData), iaConfig)
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
- El feedback permanente manda sobre cualquier otra cosa. Si un aprendizaje corrige una situación similar, debes aplicar esa corrección.
- Usa el feedback y reglas del panel por sobre tu criterio general.
- No uses frases genéricas tipo: ‘Entiendo. Para avanzar bien, dime cuál es el dato principal...’, ‘Te leo. Cuéntame un poco más...’, ni vuelvas a preguntar algo que el cliente ya respondió.
- Si el cliente reclama que preguntaste mal o repetiste, reconoce breve y avanza usando los datos que ya existen.
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
      if (isWeakGenericReply(reply)) {
        const repaired = cleanOutput(getFallback(iaConfig, training, input, conversationHistory, leadData), iaConfig)
        if (repaired) {
          console.log('[AGENT] weak reply replaced by training/panel fallback')
          const statusUpdate = validStatus(parsed.statusUpdate, iaConfig)
          return { reply: repaired, action: parsed.action || 'conversando', statusUpdate, leadUpdate: parsed.leadUpdate || {}, memoryUpdate: parsed.memoryUpdate || {}, escalateToHuman: false, trace: debug ? { model, weakRepaired: true, knowledgeUsed: knowledge.used, trainingUsed: training.used } : undefined }
        }
      }

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

  const fallback = cleanOutput(getFallback(iaConfig, training, input, conversationHistory, leadData), iaConfig)
  return {
    reply: fallback,
    action: 'fallback_model_error',
    statusUpdate: '',
    leadUpdate: {},
    memoryUpdate: {},
    trace: { fallback: true, error: lastError, trainingCount: training.items.length, knowledgeCount: knowledge.used.length }
  }
}


async function extractDocumentText({ file, mediaType = 'application/pdf', fileName = 'documento' } = {}) {
  const ANTHROPIC_KEY = clean(process.env.ANTHROPIC_KEY || process.env.VITE_ANTHROPIC_KEY || process.env.CLAUDE_API_KEY)
  if (!ANTHROPIC_KEY) throw new Error('ANTHROPIC_KEY no configurada para extraer documentos')
  if (!file) throw new Error('Archivo vacío')
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: clean(process.env.ANTHROPIC_MODEL || process.env.CLAUDE_MODEL) || 'claude-3-5-haiku-latest',
      max_tokens: 4000,
      temperature: 0,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: mediaType, data: file } },
        { type: 'text', text: `Extrae el texto útil completo del documento ${fileName}. No resumir. Devuelve solo texto plano.` }
      ] }]
    })
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok || data.error) throw new Error(data?.error?.message || `Error Anthropic ${r.status}`)
  return clean((data.content || []).map(c => c.text || '').join('\n'))
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })

  const body = req.body || {}
  const { message, conversationHistory = [], iaConfig = {}, leadData = {}, debug = false } = body
  try {
    if (body.action === 'extract') {
      const text = await extractDocumentText({ file: body.file, mediaType: body.mediaType, fileName: body.fileName })
      return res.status(200).json({ ok: true, text })
    }
    const result = await generateAgentResponse({ message, conversationHistory, iaConfig, leadData, debug })
    return res.status(200).json({ ok: true, ...result })
  } catch (e) {
    console.error('[AGENT] fatal', e.message)
    return res.status(200).json({ reply: '', error: e.message, action: 'error', leadUpdate: {}, statusUpdate: '' })
  }
}
