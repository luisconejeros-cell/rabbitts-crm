// api/agent.js — Rabito: Agente de ventas Rabbitts Capital
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' })

  const ANTHROPIC_KEY = process.env.VITE_ANTHROPIC_KEY || process.env.ANTHROPIC_KEY
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'VITE_ANTHROPIC_KEY no configurada en Vercel' })

  const { message, conversationHistory = [], iaConfig = {}, leadData = {}, action, file, mediaType, fileName } = req.body

  // ── Extracción de documentos (PDF/Word) ─────────────────────────────────
  if (action === 'extract' && file) {
    try {
      const extractRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'pdfs-2024-09-25'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 4096,
          messages: [{
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: mediaType, data: file } },
              { type: 'text', text: 'Extrae y devuelve TODO el texto de este documento exactamente como aparece, sin resúmenes ni comentarios. Solo el texto completo.' }
            ]
          }]
        })
      })
      const extractData = await extractRes.json()
      if (!extractRes.ok || extractData.error) throw new Error(extractData?.error?.message || 'Error extrayendo')
      const text = extractData.content?.[0]?.text || ''
      console.log('[Agent] Extracted', text.length, 'chars from', fileName)
      return res.status(200).json({ text })
    } catch(e) {
      console.error('[Agent] Extract error:', e.message)
      return res.status(200).json({ error: e.message, text: '' })
    }
  }

  if (!message) return res.status(400).json({ error: 'No message' })

  // ── Configuración desde CRM ───────────────────────────────────────────────
  const personalidad   = (iaConfig.personalidad || 'Eres Rabito, agente de ventas de Rabbitts Capital Chile.').trim()
  const guion          = (iaConfig.guion || '').trim()
  const calendly       = (iaConfig.calendlyLink || 'https://calendly.com/agenda-rabbittscapital/60min').trim()
  const rentaMin       = Number(iaConfig.rentaMinima) || 1500000
  const rentaMinPareja = Number(iaConfig.rentaMinimaPareja) || 2000000

  // ── Entrenamiento: pares pregunta/respuesta + razón ───────────────────────
  const entrenamientoBlocks = (iaConfig.entrenamiento || [])
    .filter(p => p.pregunta && p.respuesta)
    .map((p, i) => {
      let bloque = `[${i+1}] CUANDO te pregunten: "${p.pregunta}"\nRESPONDE ASÍ: "${p.respuesta}"`
      if (p.razon) bloque += `\nPOR QUÉ: ${p.razon}`
      return bloque
    }).join('\n\n')

  // ── Drive: cerebro del agente ─────────────────────────────────────────────
  let driveContext = ''
  const SB_URL = (process.env.VITE_SUPABASE_URL || '').trim()
  const SB_KEY = (process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()

  if (iaConfig.driveConectado && SB_URL && SB_KEY) {
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } })
      const { data } = await sb.from('crm_settings').select('value').eq('key', 'drive_content').single()
      const drive = data?.value
      if (drive?.files?.length > 0) {
        driveContext = '\n\n═══ BASE DE CONOCIMIENTO (Google Drive) ═══\n' +
          drive.files.map(f => `📄 ${f.name}:\n${f.content}`).join('\n\n───────────\n\n')
      }
    } catch(e) { console.warn('[Agent] Drive error:', e.message) }
  }

  // ── Contexto del lead actual ──────────────────────────────────────────────
  const leadContext = [
    leadData.nombre  ? `Nombre: ${leadData.nombre}`       : 'Nombre: desconocido',
    leadData.renta   ? `Renta declarada: ${leadData.renta}` : 'Renta: no informada',
    leadData.modelo  ? `Modelo de interés: ${leadData.modelo}` : '',
  ].filter(Boolean).join('\n')

  // ── System prompt estructurado ────────────────────────────────────────────
  const systemPrompt = `${personalidad}

═══ QUIÉN ERES ═══
Eres Rabito, agente de ventas de Rabbitts Capital. Tu misión es CALIFICAR leads y AGENDAR reuniones con los que califican. Eres amable, directo y conocedor del mercado inmobiliario chileno. Escribes en WhatsApp: mensajes cortos, conversacionales, sin asteriscos ni emojis en exceso.

═══ CRITERIOS DE CALIFICACIÓN ═══
Un lead CALIFICA si cumple AL MENOS UNO:
- Renta individual ≥ $${rentaMin.toLocaleString('es-CL')} mensuales
- Renta en pareja ≥ $${rentaMinPareja.toLocaleString('es-CL')} mensuales combinados
- Tiene pie disponible o ahorros para inversión
- Tiene interés real en comprar en los próximos 6 meses

Un lead NO CALIFICA si:
- Renta muy por debajo del mínimo y sin pie
- Solo está explorando sin intención real de compra
- No tiene capacidad crediticia evidente

═══ FLUJO DE CONVERSACIÓN ═══
${guion || `1. Saludo cálido y presentación breve
2. Descubrir necesidad: ¿qué busca? ¿para vivir o invertir?
3. Calificar: preguntar renta, situación financiera, urgencia
4. Si califica → invitar a reunión por Calendly
5. Si no califica → responder dudas y mantener relación`}

═══ CUÁNDO INVITAR A REUNIÓN ═══
Invita a agendar cuando:
- El lead confirma renta suficiente
- Muestra interés concreto en un proyecto
- Pregunta por precios, ubicaciones o condiciones específicas
- Lleva 3+ mensajes de intercambio positivo
- Dice que quiere avanzar o conocer más

Cuando invites usa esta URL: ${calendly}
Ejemplo: "Te comparto mi calendario para que elijas el horario que te acomode 📅 ${calendly}"

═══ LEAD ACTUAL ═══
${leadContext}
${driveContext}

═══ ENTRENAMIENTO ESPECÍFICO ═══
${entrenamientoBlocks || 'Sin entrenamiento específico cargado aún. Usa el guion general.'}

═══ INSTRUCCIONES FINALES ═══
1. SIGUE el entrenamiento específico arriba — tiene prioridad sobre tus respuestas naturales
2. Haz máximo UNA pregunta por mensaje
3. Si ya tienes suficiente info para calificar, CALIFICA y actúa
4. Cuando el lead califica, NO sigas preguntando — invita a la reunión
5. Mensajes cortos (2-4 líneas máximo en WhatsApp)
6. Nunca menciones que eres IA a menos que te pregunten directamente

Al final de cada respuesta añade en una línea separada (oculto para el cliente):
[ACCION: calificado] — si ya califica y lo invitaste a reunión
[ACCION: no_interesado] — si claramente no está interesado
[ACCION: escalar] — si pide hablar con humano o situación compleja
[ACCION: conversando] — si seguimos calificando

[DATOS: nombre=X, renta=X, modelo=X] — actualiza solo los datos que obtengas en este mensaje`

  // ── Llamar a Claude ───────────────────────────────────────────────────────
  const messages = [
    ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: message }
  ]

  const sleep = ms => new Promise(r => setTimeout(r, ms))

  const callClaude = async (attempt = 1) => {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages
      })
    })
    const data = await r.json()
    if (r.status === 529 || data?.error?.type === 'overloaded_error') {
      if (attempt <= 2) { await sleep(attempt * 1500); return callClaude(attempt + 1) }
      throw new Error('Saturado')
    }
    if (!r.ok || data.error) throw new Error(data?.error?.message || `HTTP ${r.status}`)
    return data
  }

  try {
    const data = await callClaude()
    let reply = data.content?.[0]?.text || ''
    let action = 'conversando'
    let leadUpdate = {}

    // Extraer [ACCION]
    const am = reply.match(/\[ACCION:\s*([^\]]+)\]/i)
    if (am) { action = am[1].trim().toLowerCase(); reply = reply.replace(am[0], '').trim() }

    // Extraer [DATOS]
    const dm = reply.match(/\[DATOS:\s*([^\]]+)\]/i)
    if (dm) {
      dm[1].split(',').forEach(pair => {
        const [k, ...rest] = pair.split('=')
        const v = rest.join('=').trim()
        if (k && v && v !== 'X' && v !== 'x' && v !== '') {
          leadUpdate[k.trim()] = v
        }
      })
      reply = reply.replace(dm[0], '').trim()
    }

    // Limpiar líneas vacías al final
    reply = reply.replace(/\n{3,}/g, '\n\n').trim()

    console.log('[Agent] action:', action, '| leadUpdate:', JSON.stringify(leadUpdate))
    return res.status(200).json({ reply, action, leadUpdate })

  } catch(e) {
    console.error('[Agent] Error:', e.message)
    return res.status(200).json({
      reply: 'Hola 👋 Estoy con alta demanda en este momento. Te respondo en unos minutos.',
      action: 'conversando',
      leadUpdate: {}
    })
  }
}
