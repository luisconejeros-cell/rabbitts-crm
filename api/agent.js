// api/agent.js — Rabito: agente de ventas Rabbitts Capital
// FLUJO: cliente escribe → agente lee entrenamiento completo → analiza contexto → responde

import { createClient } from '@supabase/supabase-js'

const clean = (v = '') => String(v ?? '').trim()
const normalize = (v = '') => clean(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// ── Supabase ──────────────────────────────────────────────────────────────────
function makeSupa() {
  const url = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const key = clean(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

// ── Flatten any value to readable text ───────────────────────────────────────
function flatten(v, d = 0) {
  if (v == null || d > 4) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return clean(String(v))
  if (Array.isArray(v)) return v.map(x => flatten(x, d + 1)).filter(Boolean).join('\n')
  if (typeof v === 'object') {
    return Object.entries(v)
      .filter(([k]) => !/token|apikey|api_key|secret|password/i.test(k))
      .map(([k, val]) => { const t = flatten(val, d + 1); return t ? `${k}: ${t}` : '' })
      .filter(Boolean).join('\n')
  }
  return ''
}

// ── Read all training from DB ─────────────────────────────────────────────────
// Returns a single string with ALL training content the admin configured
async function loadTraining(db, iaConfig) {
  const lines = []

  // 1. Training pairs saved in Panel IA (entrenamiento tab)
  const entrenamiento = iaConfig?.entrenamiento
  if (Array.isArray(entrenamiento) && entrenamiento.length) {
    lines.push('=== PARES PREGUNTA-RESPUESTA (sigue estos exactamente) ===')
    for (const item of entrenamiento) {
      const ctx  = clean(item.context  || item.pregunta  || item.original || '')
      const resp = clean(item.improved || item.respuesta || item.correction || '')
      const rule = clean(item.reason   || item.regla     || '')
      if (resp) lines.push(`CLIENTE DICE: ${ctx || '(cualquier mensaje)'}\nRABITO RESPONDE: ${resp}${rule ? '\nPOR QUÉ: ' + rule : ''}`)
    }
  }

  // 2. agent_training table in crm_settings
  if (db) {
    try {
      const { data } = await db.from('crm_settings').select('value').eq('key', 'agent_training').single()
      const items = Array.isArray(data?.value) ? data.value : Array.isArray(data?.value?.items) ? data.value.items : []
      if (items.length) {
        lines.push('=== REGLAS Y CORRECCIONES ADICIONALES ===')
        for (const item of items) {
          const ctx  = clean(item.context  || item.pregunta  || item.original || '')
          const resp = clean(item.improved || item.respuesta || item.correction || '')
          const rule = clean(item.reason   || item.regla     || '')
          if (resp) lines.push(`SI: ${ctx || '(general)'}\nDI: ${resp}${rule ? '\nREGLA: ' + rule : ''}`)
        }
      }
    } catch {}
  }

  // 3. Feedback from real conversations (crm_conv_feedback)
  if (db) {
    try {
      const { data } = await db.from('crm_conv_feedback')
        .select('msg_content,correction,improved,feedback')
        .order('created_at', { ascending: false })
        .limit(50)
      const feedback = (data || []).filter(x => clean(x.correction || x.improved))
      if (feedback.length) {
        lines.push('=== CORRECCIONES DE CONVERSACIONES REALES ===')
        for (const fb of feedback) {
          const original = clean(fb.msg_content || '')
          const corrected = clean(fb.correction || fb.improved || '')
          if (corrected) lines.push(`CUANDO DIGAN: "${original}"\nDI: "${corrected}"`)
        }
      }
    } catch {}
  }

  return lines.join('\n\n')
}

// ── Load knowledge docs (Cerebro Rabito) ─────────────────────────────────────
async function loadCerebro(db, iaConfig) {
  const docs = []

  // From iaConfig.cerebroDocs
  for (const d of (iaConfig?.cerebroDocs || [])) {
    const txt = clean(d.content || d.extract || d.text || '')
    if (txt) docs.push({ name: d.name || d.title || 'Documento', content: txt })
  }

  // From rabito_knowledge in crm_settings
  if (db) {
    try {
      const { data } = await db.from('crm_settings').select('value').eq('key', 'rabito_knowledge').single()
      for (const d of (data?.value?.docs || [])) {
        const txt = clean(d.content || d.extract || d.text || '')
        if (txt) docs.push({ name: d.name || d.title || 'Conocimiento', content: txt })
      }
    } catch {}

    // From rabito_knowledge_chunks
    try {
      const { data } = await db.from('crm_settings').select('value').eq('key', 'rabito_knowledge_chunks').single()
      const chunks = Array.isArray(data?.value?.chunks) ? data.value.chunks : Array.isArray(data?.value) ? data.value : []
      for (const ch of chunks) {
        const txt = clean(ch.content || ch.contenido || '')
        if (txt) docs.push({ name: ch.title || ch.titulo || 'Conocimiento', content: txt })
      }
    } catch {}

    // From crm_knowledge_chunks table
    try {
      const { data } = await db.from('crm_knowledge_chunks').select('title,content,activo').limit(50)
      for (const row of (data || [])) {
        if (row.activo !== false && row.content) docs.push({ name: row.title || 'Conocimiento', content: row.content })
      }
    } catch {}
  }

  if (!docs.length) return ''
  return docs.map((d, i) => `### Documento ${i + 1}: ${d.name}\n${d.content.slice(0, 3000)}`).join('\n\n')
}

// ── Parse Claude's JSON response ──────────────────────────────────────────────
function parseReply(raw = '') {
  const txt = clean(raw).replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
  try {
    const j = JSON.parse(txt)
    return { reply: clean(j.reply || j.message || j.text || ''), action: j.action || 'conversando', statusUpdate: j.statusUpdate || '' }
  } catch {
    const m = txt.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) return { reply: clean(m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')), action: 'conversando', statusUpdate: '' }
    // If Claude didn't follow JSON format, use raw text directly
    if (txt && !txt.startsWith('{')) return { reply: txt.slice(0, 700), action: 'conversando', statusUpdate: '' }
    return { reply: '', action: 'conversando', statusUpdate: '' }
  }
}

// ── Main: generate Rabito's response ─────────────────────────────────────────
export async function generateAgentResponse({
  message,
  conversationHistory = [],
  iaConfig: passedConfig = {},
  leadData = {},
  debug = false
} = {}, ctx = {}) {

  const input = clean(message)
  if (!input) return { reply: '', action: 'sin_mensaje', leadUpdate: {}, statusUpdate: '' }

  // Use db from context (passed by whatsapp.js) or create new one
  const db = ctx?.db || makeSupa()

  // Load iaConfig from DB and merge with what was passed
  let iaConfig = { ...passedConfig }
  if (db) {
    try {
      const { data } = await db.from('crm_settings').select('value').eq('key', 'ia_config').single()
      if (data?.value && typeof data.value === 'object') {
        // DB config is base, passed config overrides
        iaConfig = { ...data.value, ...passedConfig }
      }
    } catch {}
  }

  // Check if IA is active
  if (iaConfig.activo === false) return { reply: '', action: 'ia_off', leadUpdate: {}, statusUpdate: '' }

  const ANTHROPIC_KEY = clean(process.env.ANTHROPIC_KEY || process.env.VITE_ANTHROPIC_KEY || '')
  const agentName = clean(iaConfig.nombreAgente || iaConfig.agentName || iaConfig.nombre || 'Rabito')
  const agenda = clean(iaConfig.agendaLink || iaConfig.linkAgenda || iaConfig.calendlyLink || '')

  // ── Load training (ALL sources) ──────────────────────────────────────────
  const trainingText = await loadTraining(db, iaConfig)
  const cerebroText  = await loadCerebro(db, iaConfig)

  // ── Build panel from iaConfig fields ────────────────────────────────────
  const panelFields = [
    ['PERSONALIDAD', iaConfig.personalidad || iaConfig.identidad],
    ['GUION DE VENTAS', iaConfig.guion || iaConfig.flujo || iaConfig.procesoVenta],
    ['OFERTA / PRODUCTOS', iaConfig.oferta || iaConfig.productos || iaConfig.propuestaValor],
    ['RENTA MÍNIMA', iaConfig.rentaMinima ? `$${iaConfig.rentaMinima}` : ''],
    ['RENTA MÍNIMA EN PAREJA', iaConfig.rentaMinimaPareja ? `$${iaConfig.rentaMinimaPareja}` : ''],
    ['REGLAS DURAS', iaConfig.reglasDuras],
    ['INSTRUCCIONES EXTRA', iaConfig.instrucciones],
    ['FRASES PROHIBIDAS', iaConfig.frasesProhibidas || iaConfig.noDecir],
  ]
  const panelText = panelFields
    .map(([k, v]) => { const t = flatten(v); return t ? `${k}:\n${t}` : '' })
    .filter(Boolean).join('\n\n')

  // ── Conversation history ─────────────────────────────────────────────────
  const histMsgs = (Array.isArray(conversationHistory) ? conversationHistory : []).slice(-12)

  // ── System prompt ────────────────────────────────────────────────────────
  const system = `Eres ${agentName}, asesor de ventas de Rabbitts Capital. Hablas por WhatsApp.

IDENTIDAD:
- Tu nombre es ${agentName}. NUNCA digas que eres IA, bot o asistente.
- Eres humano, cercano, directo. Mensajes cortos (2-4 líneas max).
- NUNCA digas que estás ocupado, que hay alta demanda, ni que responderás después.

${panelText ? `CONFIGURACIÓN DEL NEGOCIO:\n${panelText}` : 'Eres asesor de inversión inmobiliaria de Rabbitts Capital.'}

${trainingText ? `ENTRENAMIENTO — SIGUE ESTO SIEMPRE:\n${trainingText}` : ''}

${cerebroText ? `DOCUMENTOS Y CONOCIMIENTO:\n${cerebroText}` : ''}

DATOS DEL CONTACTO:
${flatten(leadData) || 'Cliente nuevo sin datos previos.'}

${agenda ? `LINK PARA AGENDAR: ${agenda}\nCuando el cliente muestra interés real, invítalo a agendar.` : ''}

REGLAS DE RESPUESTA:
1. Lee TODO el entrenamiento antes de responder.
2. Si hay un par pregunta-respuesta que coincida con lo que pregunta el cliente, úsalo EXACTAMENTE.
3. Si no hay match exacto, responde según la personalidad y guion configurados.
4. Una sola pregunta por mensaje. Avanza el guion.
5. No inventes precios ni condiciones que no estén en los documentos.
6. Si no sabes algo, di "te averiguo" y haz una pregunta útil.

Responde SOLO con JSON válido:
{"reply":"tu mensaje para el cliente","action":"conversando|calificado|agenda","statusUpdate":"activo|calificado|frio|no_interesado|"}`

  // ── Build messages array ─────────────────────────────────────────────────
  const messages = []
  for (const h of histMsgs) {
    const role = h.role === 'assistant' ? 'assistant' : 'user'
    const content = clean(h.content || '')
    if (content) messages.push({ role, content })
  }
  messages.push({ role: 'user', content: input })

  // ── No API key: fallback ─────────────────────────────────────────────────
  if (!ANTHROPIC_KEY) {
    console.error('[AGENT] No Anthropic API key found')
    const fallback = clean(iaConfig.mensajeFallback || `${agentName} por acá. Cuéntame qué necesitas.`)
    return { reply: fallback, action: 'fallback_sin_key', leadUpdate: {}, statusUpdate: '' }
  }

  // ── Call Claude ──────────────────────────────────────────────────────────
  const models = [
    clean(process.env.ANTHROPIC_MODEL || ''),
    'claude-haiku-4-5-20251001',
    'claude-haiku-4-5',
    'claude-sonnet-4-5-20250929',
    'claude-3-5-haiku-20241022',
  ].filter(Boolean)

  console.log('[AGENT] start', {
    agentName,
    input: input.slice(0, 60),
    hasTraining: trainingText.length > 0,
    trainingChars: trainingText.length,
    hasCerebro: cerebroText.length > 0,
    hasPanel: panelText.length > 0,
    historyMsgs: histMsgs.length
  })

  for (const model of [...new Set(models)]) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 600, temperature: 0.2, system, messages })
      })
      const data = await r.json().catch(() => ({}))

      if (!r.ok || data.error) throw new Error(data?.error?.message || `HTTP ${r.status}`)

      const raw = (data.content || []).map(b => b.text || '').join('').trim()
      const parsed = parseReply(raw)

      // Block forbidden phrases
      let reply = parsed.reply
      const blocked = ['alta demanda', 'soy una ia', 'soy un bot', 'modelo de lenguaje', 'no estoy disponible', 'responderé después']
      for (const b of blocked) {
        if (normalize(reply).includes(normalize(b))) reply = `${agentName} por acá. ${clean(iaConfig.mensajeFallback || 'Cuéntame qué necesitas.')}`
      }

      if (!reply) throw new Error('empty_reply')

      console.log('[AGENT] ok', { model, replyChars: reply.length })
      return { reply, action: parsed.action || 'conversando', statusUpdate: parsed.statusUpdate || '', leadUpdate: {} }

    } catch (e) {
      console.error('[AGENT] error', model, e.message)
    }
  }

  // All models failed
  const fallback = clean(iaConfig.mensajeFallback || `${agentName} por acá. Cuéntame qué necesitas.`)
  return { reply: fallback, action: 'fallback_error', leadUpdate: {}, statusUpdate: '' }
}

// ── HTTP handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })

  const { message, conversationHistory = [], iaConfig = {}, leadData = {}, debug = false, action, file, mediaType } = req.body || {}

  // PDF/Word extraction for Cerebro Rabito
  if (action === 'extract' && file) {
    try {
      const apiKey = clean(process.env.ANTHROPIC_KEY || process.env.VITE_ANTHROPIC_KEY || '')
      if (!apiKey) throw new Error('API key no configurada')
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'pdfs-2024-09-25' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001', max_tokens: 4096,
          messages: [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: mediaType, data: file } },
            { type: 'text', text: 'Extrae y devuelve TODO el texto del documento. Solo el texto, sin comentarios.' }
          ]}]
        })
      })
      const data = await r.json()
      if (!r.ok || data.error) throw new Error(data?.error?.message || 'Error extrayendo')
      return res.status(200).json({ text: data.content?.[0]?.text || '' })
    } catch (e) {
      return res.status(200).json({ error: e.message, text: '' })
    }
  }

  try {
    const result = await generateAgentResponse({ message, conversationHistory, iaConfig, leadData, debug })
    return res.status(200).json(result)
  } catch (e) {
    console.error('[AGENT] fatal', e.message)
    return res.status(200).json({ reply: '', error: e.message, action: 'error', leadUpdate: {}, statusUpdate: '' })
  }
}
