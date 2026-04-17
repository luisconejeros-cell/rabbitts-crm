// api/agent.js — Rabito v2: agente de ventas con embudo de etapas
// Arquitectura: motor de etapas + prompt orientado a objetivo + leadUpdate estructurado

import { createClient } from '@supabase/supabase-js'

const clean = (v = '') => String(v ?? '').trim()
const normalize = (v = '') => clean(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function makeSupa() {
  const url = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const key = clean(process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

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

// ── EMBUDO DE ETAPAS ─────────────────────────────────────────────────────────
const STAGES = {
  bienvenida: {
    label: 'Bienvenida',
    objetivo: 'Hacer sentir bienvenido al cliente, entender brevemente qué lo trajo, y pasar a calificación.',
    accion: 'Preguntar qué lo trae hoy. UNA pregunta breve y cálida. No expliques todo el negocio todavía.',
    avanzar_si: 'El cliente explicó qué busca o mostró interés en invertir/comprar.',
    siguiente: 'calificacion'
  },
  calificacion: {
    label: 'Calificación',
    objetivo: 'Verificar si el cliente tiene capacidad económica para invertir. Sin renta suficiente, no avanzar a la siguiente etapa.',
    accion: 'Preguntar por renta o presupuesto de forma natural y sin presionar. Ej: "¿Tienes renta declarada actualmente?" o "¿Tienes idea del rango de inversión que manejas?"',
    avanzar_si: 'El cliente mencionó su renta, sueldo, presupuesto o capacidad de crédito.',
    siguiente: 'perfil'
  },
  perfil: {
    label: 'Perfil',
    objetivo: 'Entender qué tipo de propiedad busca, para qué (vivir/invertir/arrendar) y cuándo.',
    accion: 'Preguntar UNA sola cosa: para qué es la propiedad (inversión o para vivir), o en qué zona está pensando.',
    avanzar_si: 'El cliente aclaró si es para vivir o invertir, y/o zona/tipo de propiedad.',
    siguiente: 'interes'
  },
  interes: {
    label: 'Interés',
    objetivo: 'Generar deseo mostrando cómo Rabbitts puede ayudarlo específicamente. Mencionar ventajas concretas: multicrédito, IVA, tributación.',
    accion: 'Conectar lo que dijo el cliente con la propuesta de valor de Rabbitts. Luego invitar a agendar una reunión.',
    avanzar_si: 'El cliente mostró interés explícito, hizo preguntas de detalle, o aceptó conocer más.',
    siguiente: 'agenda'
  },
  agenda: {
    label: 'Agenda',
    objetivo: 'Concretar una reunión con un asesor. El cliente ya está calificado y tiene interés.',
    accion: `Dar el link de agenda o preguntar disponibilidad directamente: "¿Cuándo tienes 30 minutos esta semana?"`,
    avanzar_si: 'El cliente agendó, confirmó disponibilidad, o pidió que lo contacten.',
    siguiente: 'calificado'
  },
  calificado: {
    label: 'Calificado — Handoff',
    objetivo: 'El cliente está listo para ser atendido por un asesor real. Confirmar y cerrar.',
    accion: 'Confirmar que un asesor se pondrá en contacto pronto. Dar expectativa de tiempo. No seguir vendiendo.',
    avanzar_si: 'N/A — etapa final.',
    siguiente: null
  },
  no_califica: {
    label: 'No califica',
    objetivo: 'Cerrar amablemente sin generar falsas expectativas. Dejar la puerta abierta para el futuro.',
    accion: 'Explicar que por ahora no cumple el perfil pero puede volver cuando su situación cambie.',
    avanzar_si: 'N/A — etapa final.',
    siguiente: null
  }
}

// ── Inferir etapa desde historial ─────────────────────────────────────────────
function inferStage(history = [], leadData = {}) {
  if (leadData.status === 'calificado') return 'calificado'

  const userMsgs = history.filter(m => m.role === 'user').map(m => normalize(m.content || '')).join(' ')
  const allMsgs  = history.map(m => normalize(m.content || '')).join(' ')
  const count    = history.length

  if (count === 0) return 'bienvenida'

  const has = patterns => patterns.some(p => p.test(userMsgs))

  const tieneRenta   = has([/\d[\d.,]*\s*(millones?|mill|uf |unidades|mil peso|sueldo|renta|ingreso|gano|presupuesto|credito)/,/renta de|gano|sueldo de|ingreso de|tengo capacidad|puedo pagar/])
  const tieneInteres = has([/me interesa|quiero|quisiera|busco|necesito|para (vivir|invertir|arrendar)|departamento|casa|proyecto|inversion|zona|providencia|ñuñoa|vitacura|las condes|santiago|nunoa/])
  const tieneAgenda  = has([/agendar|agenda|reunion|reunión|disponible|esta semana|lunes|martes|miercoles|jueves|viernes|cuando|cuándo|llamen|llamar|contacten|contactar/])
  const confirmado   = has([/agend[eé]|confirm|de acuerdo|perfecto|listo|gracias por|espero|quedamos/]) && tieneAgenda

  if (confirmado)              return 'calificado'
  if (tieneAgenda)             return 'agenda'
  if (tieneRenta && tieneInteres) return 'interes'
  if (tieneRenta)              return 'perfil'
  if (tieneInteres && count > 3) return 'calificacion'
  if (count > 2)               return 'calificacion'
  return 'bienvenida'
}

// ── Extraer datos del lead desde historial ────────────────────────────────────
function extractLeadData(history = []) {
  const userText = history.filter(m => m.role === 'user').map(m => m.content).join(' ')
  const update = {}

  const rentaMatch = userText.match(/(\$?[\d.,]+\s*(?:millones?|mill\.?|uf|unidades|pesos?|clp)?)/i)
  if (rentaMatch) update.renta = rentaMatch[0].trim()

  const nombreMatch = userText.match(/(?:me llamo|soy|mi nombre es)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/i)
  if (nombreMatch) update.nombre = nombreMatch[1].trim()

  return update
}

// ── Cargar entrenamiento (max ~800 chars para no explotar el rate limit) ──────
async function loadTraining(db, iaConfig) {
  const pairs = []

  // Del Panel IA
  const entrenamiento = iaConfig?.entrenamiento
  if (Array.isArray(entrenamiento)) {
    for (const item of entrenamiento.slice(0, 8)) {
      const ctx  = clean(item.context || item.pregunta || item.original || '').slice(0, 80)
      const resp = clean(item.improved || item.respuesta || item.correction || '').slice(0, 120)
      if (resp) pairs.push(`"${ctx}": "${resp}"`)
    }
  }

  // De DB (solo si hay pocos del panel)
  if (db && pairs.length < 5) {
    try {
      const { data } = await db.from('crm_settings').select('value').eq('key', 'agent_training').single()
      const items = Array.isArray(data?.value) ? data.value : Array.isArray(data?.value?.items) ? data.value.items : []
      for (const item of items.slice(0, 4)) {
        const ctx  = clean(item.context || item.pregunta || item.original || '').slice(0, 80)
        const resp = clean(item.improved || item.respuesta || item.correction || '').slice(0, 120)
        if (resp) pairs.push(`"${ctx}": "${resp}"`)
      }
    } catch {}
  }

  if (!pairs.length) return ''
  return `RESPUESTAS EXACTAS:\n${pairs.join('\n')}`
}

// ── Cargar Cerebro Rabito (max ~1500 chars para no explotar el rate limit) ────
async function loadCerebro(db, iaConfig) {
  const docs = []
  const MAX_TOTAL = 1500
  const MAX_PER_DOC = 500

  // Del iaConfig (cerebroDocs)
  for (const d of (iaConfig?.cerebroDocs || []).slice(0, 3)) {
    const txt = clean(d.content || d.extract || d.text || '').slice(0, MAX_PER_DOC)
    if (txt) docs.push(txt)
  }

  // De DB solo si no hay docs en config
  if (db && docs.length === 0) {
    try {
      const { data } = await db.from('crm_knowledge_chunks').select('title,content,activo').limit(4)
      for (const row of (data || [])) {
        if (row.activo !== false && row.content) {
          docs.push(clean(row.content).slice(0, MAX_PER_DOC))
        }
      }
    } catch {}

    if (docs.length === 0) {
      try {
        const { data } = await db.from('crm_settings').select('value').eq('key', 'rabito_knowledge').single()
        for (const d of (data?.value?.docs || []).slice(0, 3)) {
          const txt = clean(d.content || d.extract || d.text || '').slice(0, MAX_PER_DOC)
          if (txt) docs.push(txt)
        }
      } catch {}
    }
  }

  if (!docs.length) return ''
  const combined = docs.join('\n---\n').slice(0, MAX_TOTAL)
  return `CONOCIMIENTO RABBITTS:\n${combined}`
}

// ── Parsear respuesta ─────────────────────────────────────────────────────────
function parseReply(raw = '') {
  const txt = clean(raw).replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
  try {
    const j = JSON.parse(txt)
    return {
      reply:        clean(j.reply || j.message || j.text || ''),
      action:       j.action || 'conversando',
      statusUpdate: j.statusUpdate || '',
      leadUpdate:   j.leadUpdate || {},
      nextStage:    j.nextStage || ''
    }
  } catch {
    const m = txt.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) return { reply: clean(m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')), action: 'conversando', statusUpdate: '', leadUpdate: {}, nextStage: '' }
    if (txt && !txt.startsWith('{')) return { reply: txt.slice(0, 700), action: 'conversando', statusUpdate: '', leadUpdate: {}, nextStage: '' }
    return { reply: '', action: 'conversando', statusUpdate: '', leadUpdate: {}, nextStage: '' }
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export async function generateAgentResponse({
  message,
  conversationHistory = [],
  iaConfig: passedConfig = {},
  leadData = {},
  debug = false
} = {}, ctx = {}) {

  const input = clean(message)
  if (!input) return { reply: '', action: 'sin_mensaje', leadUpdate: {}, statusUpdate: '' }

  const db = ctx?.db || makeSupa()

  let iaConfig = { ...passedConfig }
  if (db) {
    try {
      const { data } = await db.from('crm_settings').select('value').eq('key', 'ia_config').single()
      if (data?.value && typeof data.value === 'object') iaConfig = { ...data.value, ...passedConfig }
    } catch {}
  }

  if (iaConfig.activo === false) return { reply: '', action: 'ia_off', leadUpdate: {}, statusUpdate: '' }

  const ANTHROPIC_KEY = clean(
    process.env.ANTHROPIC_KEY || process.env.VITE_ANTHROPIC_KEY ||
    process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || ''
  )

  if (!ANTHROPIC_KEY) {
    console.error('[AGENT] ❌ No Anthropic API key. Add ANTHROPIC_KEY to Vercel environment variables.')
    const fallback = clean(iaConfig.mensajeFallback || 'Hola, soy Rabito de Rabbitts Capital. En breve un asesor te contacta.')
    return { reply: fallback, action: 'fallback_sin_key', leadUpdate: {}, statusUpdate: '' }
  }

  const agentName = clean(iaConfig.nombre || iaConfig.nombreAgente || 'Rabito')
  const agenda    = clean(iaConfig.agendaLink || iaConfig.calendlyLink || '')

  const [trainingText, cerebroText] = await Promise.all([
    loadTraining(db, iaConfig),
    loadCerebro(db, iaConfig)
  ])

  const histMsgs      = (Array.isArray(conversationHistory) ? conversationHistory : []).slice(-8)
  const stage         = inferStage(histMsgs, leadData)
  const stageInfo     = STAGES[stage] || STAGES.bienvenida
  const nextStageInfo = stageInfo.siguiente ? STAGES[stageInfo.siguiente] : null
  const extractedData = extractLeadData(histMsgs)

  // ── Datos del negocio — solo los que tienen valor ────────────────────────────
  const negocioLines = [
    iaConfig.propuestaValor || iaConfig.oferta || iaConfig.productos || 'Inversión inmobiliaria, multicrédito, optimización tributaria en Chile.',
    iaConfig.rentaMinima    ? `Renta mín: $${iaConfig.rentaMinima}` : '',
    iaConfig.rentaMinimaPareja ? `Renta pareja: $${iaConfig.rentaMinimaPareja}` : '',
    iaConfig.criterioCalificacion,
    iaConfig.personalidad   ? `Personalidad: ${iaConfig.personalidad.slice(0, 120)}` : '',
    iaConfig.guion          ? `Guion: ${iaConfig.guion.slice(0, 120)}` : '',
    iaConfig.reglasDuras    ? `Nunca: ${iaConfig.reglasDuras.slice(0, 100)}` : '',
    iaConfig.instrucciones  ? `Extra: ${iaConfig.instrucciones.slice(0, 100)}` : '',
  ].filter(Boolean).join('\n')

  const system = `Eres ${agentName}, asesor humano de Rabbitts Capital por WhatsApp. NUNCA digas que eres IA.
Mensajes cortos (2-4 líneas). Una sola pregunta por mensaje. Sin markdown.

NEGOCIO:
${negocioLines}
${cerebroText ? '\n'+cerebroText : ''}
${trainingText ? '\n'+trainingText : ''}
${agenda ? `\nAGENDA: ${agenda}` : ''}

ETAPA ACTUAL: ${stageInfo.label}
HACER AHORA: ${stageInfo.accion}
AVANZAR cuando: ${stageInfo.avanzar_si}
SIGUIENTE: ${nextStageInfo?.label || 'calificado'}

REGLAS: Si no califica → action:"no_califica". Si agendó → action:"calificado". Si pide humano → action:"escalar_humano". Captura renta/nombre en leadUpdate.
CLIENTE: ${flatten(leadData) || 'nuevo'}${Object.keys(extractedData).length ? ` | ${JSON.stringify(extractedData)}` : ''}

JSON: {"reply":"mensaje natural 2-4 líneas","action":"conversando","leadUpdate":{}}`

  // ── Construir mensajes — sin duplicados, sin consecutivos del mismo rol ────────
  const dedupedHist = histMsgs.filter((m, i) => {
    if (i === histMsgs.length - 1 && m.role !== 'assistant' && clean(m.content) === input) return false
    return true
  }).filter((m, i) => !(i === 0 && m.role === 'assistant'))

  const messages = []
  for (const h of dedupedHist) {
    const role    = h.role === 'assistant' ? 'assistant' : 'user'
    const content = clean(h.content || '')
    if (!content) continue
    const last = messages[messages.length - 1]
    if (last && last.role === role) continue
    messages.push({ role, content })
  }
  messages.push({ role: 'user', content: input })

  // Solo el modelo que funciona en la cuenta actual
  const models = [
    clean(process.env.ANTHROPIC_MODEL || ''),
    'claude-haiku-4-5-20251001',
  ].filter(Boolean)

  console.log('[AGENT v2]', { stage, agentName, input: input.slice(0, 60), msgs: messages.length - 1 })

  for (const model of [...new Set(models)]) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 500, temperature: 0.15, system, messages })
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || data.error) throw new Error(data?.error?.message || `HTTP ${r.status}`)

      const raw    = (data.content || []).map(b => b.text || '').join('').trim()
      const parsed = parseReply(raw)
      let reply    = parsed.reply

      const blocked = ['soy una ia', 'soy un bot', 'modelo de lenguaje', 'no estoy disponible', 'alta demanda', 'responderé después']
      for (const b of blocked) {
        if (normalize(reply).includes(normalize(b))) reply = `${agentName} por acá. Cuéntame más sobre lo que buscas.`
      }

      if (!reply) throw new Error('empty_reply')

      const mergedLeadUpdate = { ...extractedData, ...(parsed.leadUpdate || {}) }

      console.log('[AGENT v2] ok', { model, stage, action: parsed.action, chars: reply.length })
      return {
        reply,
        action:       parsed.action || 'conversando',
        statusUpdate: parsed.statusUpdate || (parsed.action === 'calificado' ? 'calificado' : ''),
        leadUpdate:   mergedLeadUpdate,
        nextStage:    parsed.nextStage || '',
        stage,
        trace:        { stage, model, derivationAllowedByHardRules: true }
      }
    } catch (e) {
      console.error('[AGENT v2] error', model, e.message)
    }
  }

  const fallback = clean(iaConfig.mensajeFallback || `${agentName} por acá. Cuéntame qué necesitas.`)
  return { reply: fallback, action: 'fallback_error', leadUpdate: {}, statusUpdate: '', stage }
}

// ── HTTP handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })

  const { message, conversationHistory = [], iaConfig = {}, leadData = {}, debug = false, action, file, mediaType } = req.body || {}

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

  if (action === 'diagnostico') {
    const key   = clean(process.env.ANTHROPIC_KEY || process.env.VITE_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY || '')
    const sbUrl = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
    const sbKey = clean(process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '')
    return res.status(200).json({
      anthropic_key: key   ? `✅ Configurada (${key.slice(0, 8)}...)` : '❌ NO ENCONTRADA — agrega ANTHROPIC_KEY en Vercel > Settings > Environment Variables',
      supabase_url:  sbUrl ? `✅ ${sbUrl.slice(0, 30)}...` : '❌ NO ENCONTRADA',
      supabase_key:  sbKey ? '✅ Configurada' : '❌ NO ENCONTRADA',
      version: 'agent-v2-staged',
      stages: Object.keys(STAGES)
    })
  }

  try {
    const result = await generateAgentResponse({ message, conversationHistory, iaConfig, leadData, debug })
    return res.status(200).json(result)
  } catch (e) {
    console.error('[AGENT v2] fatal', e.message)
    return res.status(200).json({ reply: '', error: e.message, action: 'error', leadUpdate: {}, statusUpdate: '' })
  }
}
