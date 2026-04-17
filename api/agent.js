// api/agent.js — Rabito v3: embudo de etapas + Prompt Caching Anthropic
// El system prompt (negocio + cerebro + entrenamiento) se cachea en Anthropic.
// Tokens cacheados NO cuentan hacia el rate limit ITPM → soporta 50+ conversaciones simultáneas.
// Solo los tokens del mensaje actual + contexto dinámico (etapa, cliente) se cobran por request.

import { createClient } from '@supabase/supabase-js'

const clean    = (v = '') => String(v ?? '').trim()
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
    objetivo: 'Hacer sentir bienvenido al cliente y entender qué lo trae.',
    accion: 'Preguntar qué lo trae hoy. UNA pregunta breve y cálida.',
    avanzar_si: 'El cliente explicó qué busca o mostró interés.',
    siguiente: 'calificacion'
  },
  calificacion: {
    label: 'Calificación',
    objetivo: 'Capturar nombre completo, renta y email del cliente. Sin estos datos no puede avanzar.',
    accion: 'Pide los 3 datos de forma natural y uno a la vez: primero el nombre completo, luego la renta o sueldo, luego el email. Nunca pidas los tres en un mismo mensaje.',
    avanzar_si: 'Tienes nombre completo, renta/sueldo Y email del cliente. Guárdalos en leadUpdate: {"nombre":"...","renta":"...","email":"..."}',
    siguiente: 'perfil'
  },
  perfil: {
    label: 'Perfil',
    objetivo: 'Entender qué busca: vivir, invertir o arrendar. Y en qué zona.',
    accion: 'Preguntar UNA cosa: ¿para qué es la propiedad o en qué zona piensa?',
    avanzar_si: 'El cliente aclaró si es para vivir o invertir, y/o zona.',
    siguiente: 'interes'
  },
  interes: {
    label: 'Interés',
    objetivo: 'Generar deseo conectando su situación con la propuesta de Rabbitts.',
    accion: 'Explicar brevemente cómo Rabbitts ayuda en su caso específico. Luego invitar a agendar.',
    avanzar_si: 'El cliente mostró interés, hizo preguntas de detalle, o aceptó conocer más.',
    siguiente: 'agenda'
  },
  agenda: {
    label: 'Agenda',
    objetivo: 'Concretar una reunión con un asesor.',
    accion: 'Dar el link de agenda o preguntar disponibilidad: "¿Cuándo tienes 30 minutos esta semana?"',
    avanzar_si: 'El cliente agendó, confirmó disponibilidad, o pidió que lo contacten.',
    siguiente: 'calificado'
  },
  calificado: {
    label: 'Calificado',
    objetivo: 'Confirmar que un asesor lo contactará. Cerrar la conversación del bot.',
    accion: 'Confirmar que un asesor real lo contactará pronto. No seguir vendiendo.',
    avanzar_si: 'N/A — etapa final.',
    siguiente: null
  },
  no_califica: {
    label: 'No califica',
    objetivo: 'Cerrar amablemente dejando la puerta abierta.',
    accion: 'Explicar que por ahora no cumple el perfil pero puede volver.',
    avanzar_si: 'N/A — etapa final.',
    siguiente: null
  }
}

// ── Inferir etapa desde historial ─────────────────────────────────────────────
function inferStage(history = [], leadData = {}) {
  if (leadData.status === 'calificado') return 'calificado'
  const userMsgs = history.filter(m => m.role === 'user').map(m => normalize(m.content || '')).join(' ')
  const count    = history.length
  if (count === 0) return 'bienvenida'
  const has = patterns => patterns.some(p => p.test(userMsgs))
  const tieneRenta   = has([/\d[\d.,]*\s*(millones?|mill|uf |unidades|mil peso|sueldo|renta|ingreso|gano|presupuesto|credito)/, /renta de|gano|sueldo de|ingreso de|tengo capacidad|puedo pagar/])
  const tieneInteres = has([/me interesa|quiero|quisiera|busco|necesito|para (vivir|invertir|arrendar)|departamento|casa|proyecto|inversion|zona|providencia|ñuñoa|vitacura|las condes|santiago|nunoa/])
  const tieneAgenda  = has([/agendar|agenda|reunion|reunión|disponible|esta semana|lunes|martes|miercoles|jueves|viernes|cuando|cuándo|llamen|llamar|contacten/])
  const confirmado   = has([/agend[eé]|confirm|de acuerdo|perfecto|listo|gracias por|espero|quedamos/]) && tieneAgenda
  if (confirmado)                 return 'calificado'
  if (tieneAgenda)                return 'agenda'
  if (tieneRenta && tieneInteres) return 'interes'
  if (tieneRenta)                 return 'perfil'
  if (tieneInteres && count > 3)  return 'calificacion'
  if (count > 2)                  return 'calificacion'
  return 'bienvenida'
}

// ── Extraer datos del lead ────────────────────────────────────────────────────
function extractLeadData(history = []) {
  const userText = history.filter(m => m.role === 'user').map(m => m.content).join(' ')
  const update = {}

  // Renta / presupuesto
  const rentaMatch = userText.match(/(\$?[\d.,]+\s*(?:millones?|mill\.?|uf|unidades|pesos?|clp)?)/i)
  if (rentaMatch) update.renta = rentaMatch[0].trim()

  // Nombre completo
  const nombreMatch = userText.match(/(?:me llamo|soy|mi nombre es|llámame|llamame)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,3})/i)
  if (nombreMatch) update.nombre = nombreMatch[1].trim()

  // Email
  const emailMatch = userText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/i)
  if (emailMatch) update.email = emailMatch[0].toLowerCase()

  return update
}

// ── Cargar entrenamiento COMPLETO (cacheable) ─────────────────────────────────
async function loadTraining(db, iaConfig) {
  const lines = []

  // Del Panel IA — todos los pares
  const entrenamiento = iaConfig?.entrenamiento
  if (Array.isArray(entrenamiento) && entrenamiento.length) {
    lines.push('=== RESPUESTAS EXACTAS — usa estas cuando el cliente diga algo similar ===')
    for (const item of entrenamiento) {
      const ctx  = clean(item.context || item.pregunta || item.original || '')
      const resp = clean(item.improved || item.respuesta || item.correction || '')
      if (resp) lines.push(`PREGUNTA: "${ctx || 'general'}"\nRESPUESTA: "${resp}"`)
    }
  }

  if (db) {
    // De agent_training en DB
    try {
      const { data } = await db.from('crm_settings').select('value').eq('key', 'agent_training').single()
      const items = Array.isArray(data?.value) ? data.value : Array.isArray(data?.value?.items) ? data.value.items : []
      if (items.length) {
        lines.push('=== REGLAS ADICIONALES ===')
        for (const item of items) {
          const ctx  = clean(item.context || item.pregunta || item.original || '')
          const resp = clean(item.improved || item.respuesta || item.correction || '')
          if (resp) lines.push(`SI: "${ctx || 'general'}"\nDI: "${resp}"`)
        }
      }
    } catch {}

    // Correcciones de conversaciones reales
    try {
      const { data } = await db.from('crm_conv_feedback')
        .select('msg_content,correction,improved').order('created_at', { ascending: false }).limit(30)
      const fb = (data || []).filter(x => clean(x.correction || x.improved))
      if (fb.length) {
        lines.push('=== CORRECCIONES APRENDIDAS ===')
        for (const f of fb) {
          const orig = clean(f.msg_content || '')
          const corr = clean(f.correction || f.improved || '')
          if (corr) lines.push(`ORIGINAL: "${orig}"\nCORREGIDO: "${corr}"`)
        }
      }
    } catch {}
  }

  return lines.join('\n\n')
}

// ── Cargar Cerebro Rabito COMPLETO (cacheable) ────────────────────────────────
async function loadCerebro(db, iaConfig) {
  const docs = []

  // Del iaConfig (cerebroDocs subidos desde el panel)
  for (const d of (iaConfig?.cerebroDocs || [])) {
    const txt = clean(d.content || d.extract || d.text || '')
    if (txt) docs.push({ name: d.name || d.nombre || d.title || 'Documento', content: txt })
  }

  if (db) {
    // rabito_knowledge
    try {
      const { data } = await db.from('crm_settings').select('value').eq('key', 'rabito_knowledge').single()
      for (const d of (data?.value?.docs || [])) {
        const txt = clean(d.content || d.extract || d.text || '')
        if (txt) docs.push({ name: d.name || d.title || 'Conocimiento', content: txt })
      }
    } catch {}

    // rabito_knowledge_chunks
    try {
      const { data } = await db.from('crm_settings').select('value').eq('key', 'rabito_knowledge_chunks').single()
      const chunks = Array.isArray(data?.value?.chunks) ? data.value.chunks : Array.isArray(data?.value) ? data.value : []
      for (const ch of chunks) {
        const txt = clean(ch.content || ch.contenido || '')
        if (txt) docs.push({ name: ch.title || ch.titulo || 'Conocimiento', content: txt })
      }
    } catch {}

    // crm_knowledge_chunks
    try {
      const { data } = await db.from('crm_knowledge_chunks').select('title,content,activo').limit(50)
      for (const row of (data || [])) {
        if (row.activo !== false && row.content) {
          docs.push({ name: row.title || 'Conocimiento', content: row.content })
        }
      }
    } catch {}
  }

  if (!docs.length) return ''
  return docs.map(d => `### ${d.name}\n${d.content.slice(0, 8000)}`).join('\n\n')
}

// ── Parsear respuesta de Claude ───────────────────────────────────────────────
function parseReply(raw = '') {
  const txt = clean(raw).replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
  try {
    const j = JSON.parse(txt)
    return {
      reply:        clean(j.reply || j.message || j.text || ''),
      action:       j.action || 'conversando',
      statusUpdate: j.statusUpdate || '',
      leadUpdate:   j.leadUpdate || {},
    }
  } catch {
    const m = txt.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) return { reply: clean(m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')), action: 'conversando', statusUpdate: '', leadUpdate: {} }
    if (txt && !txt.startsWith('{')) return { reply: txt.slice(0, 700), action: 'conversando', statusUpdate: '', leadUpdate: {} }
    return { reply: '', action: 'conversando', statusUpdate: '', leadUpdate: {} }
  }
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export async function generateAgentResponse({
  message,
  conversationHistory = [],
  iaConfig: passedConfig = {},
  leadData = {},
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
    console.error('[AGENT] ❌ No Anthropic API key. Add ANTHROPIC_KEY to Vercel env vars.')
    return { reply: clean(iaConfig.mensajeFallback || 'Soy Rabito de Rabbitts Capital. En breve un asesor te contacta.'), action: 'fallback_sin_key', leadUpdate: {}, statusUpdate: '' }
  }

  const agentName = clean(iaConfig.nombre || iaConfig.nombreAgente || 'Rabito')
  const agenda    = clean(iaConfig.agendaLink || iaConfig.calendlyLink || '')

  // Carga paralela — estos bloques van al caché
  const [trainingText, cerebroText] = await Promise.all([
    loadTraining(db, iaConfig),
    loadCerebro(db, iaConfig)
  ])

  const histMsgs      = (Array.isArray(conversationHistory) ? conversationHistory : []).slice(-12)
  const stage         = inferStage(histMsgs, leadData)
  const stageInfo     = STAGES[stage] || STAGES.bienvenida
  const nextStageInfo = stageInfo.siguiente ? STAGES[stageInfo.siguiente] : null
  const extractedData = extractLeadData(histMsgs)

  // ── Bloque CACHEABLE: identidad + negocio + cerebro + entrenamiento ──────────
  // Este texto es igual para TODOS los usuarios → Anthropic lo cachea.
  // La primera llamada escribe el caché. Las siguientes 5 min lo leen gratis (no cuenta ITPM).
  const negocioConfig = [
    iaConfig.propuestaValor || iaConfig.oferta || iaConfig.productos || '',
    iaConfig.rentaMinima      ? `Renta mínima individual: $${iaConfig.rentaMinima}` : '',
    iaConfig.rentaMinimaPareja? `Renta mínima en pareja: $${iaConfig.rentaMinimaPareja}` : '',
    iaConfig.criterioCalificacion || '',
    iaConfig.personalidad || '',
    iaConfig.guion || '',
    iaConfig.reglasDuras      ? `REGLAS INAMOVIBLES: ${iaConfig.reglasDuras}` : '',
    iaConfig.instrucciones    ? `INSTRUCCIONES EXTRA: ${iaConfig.instrucciones}` : '',
    agenda                    ? `LINK PARA AGENDAR: ${agenda}` : '',
  ].filter(Boolean).join('\n')

  const cachedBlock = `Eres ${agentName}, asesor de ventas de Rabbitts Capital. Atiendes por WhatsApp como humano. NUNCA digas que eres IA o bot.

FORMATO WHATSAPP — CRÍTICO:
- NUNCA uses asteriscos dobles (**texto**), nunca uses guiones de lista (- item), nunca uses # títulos.
- WhatsApp solo acepta: *negrita* (un asterisco), _cursiva_, y texto plano.
- Máximo 4-5 líneas por mensaje. Si el tema es largo, da lo esencial y termina con una pregunta. No lo expliques todo de una vez.
- UNA sola pregunta por mensaje. Sin listas numeradas. Sin bullets. Texto natural conversacional.
- Si sientes que necesitas más de 5 líneas para responder, para, da un resumen de 3 líneas y di "¿quieres que te cuente más sobre algún punto específico?"

SOBRE EL NEGOCIO:
${negocioConfig || 'Eres asesor de inversión inmobiliaria. Ayudas a invertir en departamentos, usar multicrédito y optimizar impuestos en Chile.'}

${cerebroText ? `CONOCIMIENTO DE PROYECTOS Y NEGOCIO:\n${cerebroText}` : ''}

${trainingText ? `ENTRENAMIENTO — SIGUE ESTO CUANDO COINCIDA:\n${trainingText}` : ''}

EMBUDO DE VENTAS:
Bienvenida → Calificación → Perfil → Interés → Agenda → Calificado

REGLAS DEL EMBUDO:
- Sigue el flujo. Una etapa a la vez.
- Si renta no califica: cierra amablemente con action "no_califica".
- Si agendó o confirmó reunión: action "calificado".
- Si pide hablar con humano: action "escalar_humano".
- Captura renta y nombre del cliente en leadUpdate cuando los mencione.
- No inventes proyectos, precios ni condiciones que no estén en los documentos.

FORMATO DE RESPUESTA — siempre JSON puro, sin texto antes ni después:
{"reply":"tu mensaje al cliente","action":"conversando","leadUpdate":{}}`

  // ── Bloque DINÁMICO: cambia por conversación (no se cachea) ─────────────────
  // Etapa actual, info del cliente específico. Son pocos tokens.
  const dynamicBlock = `ETAPA ACTUAL: ${stageInfo.label}
OBJETIVO: ${stageInfo.objetivo}
HAZ AHORA: ${stageInfo.accion}
AVANZA A "${nextStageInfo?.label || 'calificado'}" CUANDO: ${stageInfo.avanzar_si}

CLIENTE: ${flatten(leadData) || 'nuevo, sin datos'}${Object.keys(extractedData).length ? `\nDatos del chat: ${JSON.stringify(extractedData)}` : ''}

action válidos: "conversando" | "calificado" | "no_califica" | "escalar_humano"`

  // ── Construir mensajes — sin duplicados, alternancia correcta ────────────────
  const dedupedHist = histMsgs
    .filter((m, i) => !(i === histMsgs.length - 1 && m.role !== 'assistant' && clean(m.content) === input))
    .filter((m, i) => !(i === 0 && m.role === 'assistant'))

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

  // ── Armar system prompt ───────────────────────────────────────────────────────
  // El caching requiere mínimo 1024 tokens en el bloque cacheable.
  // Si el contenido es corto, usamos system simple (string) sin caching.
  const cachedBlockTokens = Math.ceil(cachedBlock.length / 4) // estimación rough
  const useCaching = cachedBlockTokens >= 1024

  const systemPayload = useCaching
    ? [
        { type: 'text', text: cachedBlock, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: dynamicBlock }
      ]
    : `${cachedBlock}\n\n${dynamicBlock}`

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': ANTHROPIC_KEY,
    'anthropic-version': '2023-06-01',
  }
  if (useCaching) headers['anthropic-beta'] = 'prompt-caching-2024-07-31'

  const model = clean(process.env.ANTHROPIC_MODEL || '') || 'claude-haiku-4-5-20251001'

  console.log('[AGENT v3]', { stage, model, input: input.slice(0, 60), msgs: messages.length - 1, caching: useCaching, cachedTokensEst: cachedBlockTokens })

  // Reintentos con espera en rate limit
  const MAX_RETRIES = 3
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          temperature: 0.15,
          system: systemPayload,
          messages
        })
      })

      const data = await r.json().catch(() => ({}))

      // Rate limit → esperar y reintentar
      if (r.status === 429) {
        const waitSecs = attempt === 0 ? 3 : attempt === 1 ? 8 : 15
        console.warn(`[AGENT v3] rate limit, esperando ${waitSecs}s (intento ${attempt+1}/${MAX_RETRIES})`)
        await new Promise(res => setTimeout(res, waitSecs * 1000))
        continue
      }

      if (!r.ok || data.error) throw new Error(data?.error?.message || `HTTP ${r.status}`)

      // Log cache stats
      if (data.usage) {
        const u = data.usage
        console.log('[AGENT v3] tokens:', {
          input: u.input_tokens,
          cache_write: u.cache_creation_input_tokens || 0,
          cache_read: u.cache_read_input_tokens || 0,
          output: u.output_tokens
        })
      }

      const raw    = (data.content || []).map(b => b.text || '').join('').trim()
      const parsed = parseReply(raw)
      let reply    = parsed.reply

      const blocked = ['soy una ia', 'soy un bot', 'modelo de lenguaje', 'no estoy disponible', 'alta demanda']
      for (const b of blocked) {
        if (normalize(reply).includes(normalize(b))) reply = `${agentName} por acá. Cuéntame más sobre lo que buscas.`
      }

      if (!reply) throw new Error('empty_reply')

      const mergedLeadUpdate = { ...extractedData, ...(parsed.leadUpdate || {}) }

      console.log('[AGENT v3] ok', { stage, action: parsed.action, chars: reply.length, attempt })
      return {
        reply,
        action:       parsed.action || 'conversando',
        statusUpdate: parsed.statusUpdate || (parsed.action === 'calificado' ? 'calificado' : ''),
        leadUpdate:   mergedLeadUpdate,
        stage,
        trace:        { stage, model, derivationAllowedByHardRules: true }
      }

    } catch (e) {
      console.error(`[AGENT v3] error intento ${attempt+1}:`, e.message)
      if (attempt === MAX_RETRIES - 1) break
      await new Promise(res => setTimeout(res, 2000)) // 2s entre reintentos por otros errores
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

  const { message, conversationHistory = [], iaConfig = {}, leadData = {}, action, file, mediaType } = req.body || {}

  // Extracción de PDF/Doc para Cerebro Rabito
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

  // Diagnóstico
  if (action === 'diagnostico') {
    const key   = clean(process.env.ANTHROPIC_KEY || process.env.VITE_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY || '')
    const sbUrl = clean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '')
    const sbKey = clean(process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '')
    return res.status(200).json({
      anthropic_key: key   ? `✅ Configurada (${key.slice(0, 8)}...)` : '❌ NO ENCONTRADA',
      supabase_url:  sbUrl ? `✅ ${sbUrl.slice(0, 30)}...` : '❌ NO ENCONTRADA',
      supabase_key:  sbKey ? '✅ Configurada' : '❌ NO ENCONTRADA',
      version: 'agent-v3-cached',
      stages: Object.keys(STAGES),
      caching: 'prompt-caching-2024-07-31 activo — cerebro + entrenamiento cacheados'
    })
  }

  try {
    const result = await generateAgentResponse({ message, conversationHistory, iaConfig, leadData })
    return res.status(200).json(result)
  } catch (e) {
    console.error('[AGENT v3] fatal', e.message)
    return res.status(200).json({ reply: '', error: e.message, action: 'error', leadUpdate: {}, statusUpdate: '' })
  }
}
