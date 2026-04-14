// api/agent.js — Rabito coherente con memoria comercial y link de agenda configurable
// Agente comercial conversacional para Rabbitts Capital.
// Backend puro para Vercel. No pegar JSX/HTML en este archivo.

const DEFAULT_AGENDA_LINK = 'https://crm.rabbittscapital.com/agenda'
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

const ALLOWED_LEAD_KEYS = new Set(['nombre', 'renta', 'modelo', 'email'])

const FORBIDDEN_PHRASES = [
  'alta demanda',
  'te respondo en unos minutos',
  'te respondo en algunos minutos',
  'estoy con alta demanda',
  'estoy ocupado',
  'estamos ocupados',
  'cuando pueda',
  'soy una ia',
  'soy inteligencia artificial',
  'como modelo de lenguaje',
  'no tengo acceso',
  'no puedo ayudarte',
  'no puedo ayudar',
  'no tengo la capacidad',
  'mis capacidades',
  'mis limitaciones',
  'debes esperar',
  'un ejecutivo te respondera',
  'un ejecutivo te responderá',
  'en breve te contacto',
  'más tarde te respondo',
  'mas tarde te respondo'
]

const ROBOTIC_PATTERNS = [
  /como\s+asistente\s+virtual/i,
  /como\s+modelo\s+de\s+lenguaje/i,
  /no\s+puedo\s+proporcionar/i,
  /no\s+tengo\s+informaci[oó]n\s+suficiente/i,
  /lamento\s+la\s+confusi[oó]n/i,
  /gracias\s+por\s+tu\s+consulta/i,
  /es\s+importante\s+destacar\s+que/i,
  /te\s+recomiendo\s+consultar\s+con\s+un\s+profesional/i
]

function cleanText(value = '') {
  return String(value || '').trim()
}

function cleanUrl(url = '') {
  return cleanText(url)
    .replace(/[).,;]+$/g, '')
    .replace(/^<|>$/g, '')
}

function findAgendaUrlInText(text = '') {
  const raw = String(text || '')
  const matches = raw.match(/https?:\/\/[^\s\]}")<>]+/gi) || []
  if (!matches.length) return ''

  const preferred = matches.find(url => {
    const idx = raw.indexOf(url)
    const window = normalizeForCheck(raw.slice(Math.max(0, idx - 90), idx + url.length + 90))
    return /(agenda|agendar|reunion|reunión|llamada|cita|calendario|calendar|booking|book|meet|calendly)/.test(window)
  })

  return cleanUrl(preferred || matches[0])
}

function resolveAgendaLink(iaConfig = {}, knowledgeContext = '') {
  const direct = [
    iaConfig.agendaLink,
    iaConfig.linkAgenda,
    iaConfig.reunionLink,
    iaConfig.linkReunion,
    iaConfig.meetingLink,
    iaConfig.bookingLink,
    iaConfig.urlAgenda,
    iaConfig.calendlyLink // compatibilidad con versiones anteriores del CRM
  ].map(cleanUrl).find(Boolean)
  if (direct) return direct

  const textSources = [
    iaConfig.reglasRabito,
    iaConfig.pasosRabito,
    iaConfig.guion,
    iaConfig.productosRabito,
    iaConfig.objecionesRabito,
    Array.isArray(iaConfig.reglasEntrenamiento) ? iaConfig.reglasEntrenamiento.map(r => `${r?.title || ''}\n${r?.content || ''}`).join('\n') : '',
    Array.isArray(iaConfig.entrenamiento) ? iaConfig.entrenamiento.map(r => `${r?.pregunta || ''}\n${r?.respuesta || ''}`).join('\n') : '',
    knowledgeContext
  ].join('\n\n')

  return findAgendaUrlInText(textSources) || DEFAULT_AGENDA_LINK
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeForCheck(text = '') {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function containsForbiddenReply(text = '') {
  const t = normalizeForCheck(text)
  return FORBIDDEN_PHRASES.some(phrase => t.includes(normalizeForCheck(phrase)))
}

function looksRobotic(text = '') {
  return ROBOTIC_PATTERNS.some(pattern => pattern.test(text || ''))
}

function removeAgentMetadata(reply = '') {
  return String(reply || '')
    .replace(/\[ACCION:[\s\S]*?\]/gi, '')
    .replace(/\[DATOS:[\s\S]*?\]/gi, '')
    .replace(/\[MEMORIA:[\s\S]*?\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function safeJsonParse(text, fallback = null) {
  try { return text ? JSON.parse(text) : fallback } catch (_) { return fallback }
}

function onlyAllowedLeadUpdate(update = {}) {
  const clean = {}
  for (const [key, value] of Object.entries(update || {})) {
    const k = cleanText(key)
    const v = cleanText(value)
    if (ALLOWED_LEAD_KEYS.has(k) && v && v.toLowerCase() !== 'x') clean[k] = v
  }
  return clean
}

function extractActionAndData(rawReply = '') {
  let reply = String(rawReply || '').trim()
  let action = 'conversando'
  const leadUpdate = {}

  const actionMatch = reply.match(/\[ACCION:\s*([^\]]+)\]/i)
  if (actionMatch) {
    action = cleanText(actionMatch[1]).toLowerCase()
    reply = reply.replace(actionMatch[0], '').trim()
  }

  const dataMatch = reply.match(/\[DATOS:\s*([^\]]+)\]/i)
  if (dataMatch) {
    dataMatch[1].split(',').forEach(pair => {
      const [rawKey, ...rest] = pair.split('=')
      const key = cleanText(rawKey)
      const value = cleanText(rest.join('='))
      if (key && value && value.toLowerCase() !== 'x') leadUpdate[key] = value
    })
    reply = reply.replace(dataMatch[0], '').trim()
  }

  if (!['calificado', 'escalar', 'no_interesado', 'conversando'].includes(action)) {
    action = 'conversando'
  }

  return { reply: removeAgentMetadata(reply), action, leadUpdate: onlyAllowedLeadUpdate(leadUpdate) }
}

function parseMoneyToNumber(text = '') {
  const raw = normalizeForCheck(text)
    .replace(/\$/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')

  // 2.5m, 2,5 millones, 2 millones. No confundir la "m" de "mensual" con millones.
  const millionMatch = raw.match(/\b(\d+(?:\.\d+)?)\s*(mm|millon(?:es)?|m\b)/i)
  if (millionMatch) return Math.round(Number(millionMatch[1]) * 1000000)

  // 900 mil, 2500 mil, 900k.
  const thousandMatch = raw.match(/\b(\d+(?:\.\d+)?)\s*(mil|k)\b/i)
  if (thousandMatch) return Math.round(Number(thousandMatch[1]) * 1000)

  const numberMatch = raw.match(/\b(\d{6,8})\b/)
  if (numberMatch) return Number(numberMatch[1])

  // En WhatsApp muchos escriben "2500 mensual" para decir $2.500.000.
  const shortMonthlyMatch = raw.match(/\b(\d{3,5})\b/)
  if (shortMonthlyMatch && /(mensual|liquido|líquido|renta|sueldo|gano|ingreso|hacemos|sumamos|pareja)/.test(raw)) {
    const value = Number(shortMonthlyMatch[1])
    if (value >= 500 && value <= 99999) return value * 1000
  }

  return 0
}

function formatCLP(n = 0) {
  if (!n) return ''
  return '$' + Number(n).toLocaleString('es-CL')
}

function getFirstName(name = '') {
  const cleaned = cleanText(name)
  if (!cleaned || cleaned.startsWith('+')) return ''
  return cleaned.split(/\s+/)[0]
}

function inferLocalIntent(message = '', conversationHistory = []) {
  const m = normalizeForCheck(message)
  const lastAssistant = [...conversationHistory]
    .reverse()
    .find(item => item?.role === 'assistant')?.content || ''
  const lastA = normalizeForCheck(lastAssistant)

  if (/\b(si|sí|dale|ok|okay|perfecto|ya|agendemos|agenda|llamame|llámame|llamada|reunion|reunión)\b/i.test(message)) {
    if (lastA.includes('agendar') || lastA.includes('calendly') || lastA.includes('calendario') || lastA.includes('llamada') || lastA.includes('reunion')) return 'acepta_agendar'
    return 'afirmacion'
  }

  if (m.includes('precio') || m.includes('valor') || m.includes('cuanto') || m.includes('cuánto') || m.includes('uf')) return 'precio'
  if (m.includes('renta corta') || m.includes('airbnb') || m.includes('booking') || m.includes('diaria')) return 'renta_corta'
  if (m.includes('renta') || m.includes('sueldo') || m.includes('gano') || m.includes('ingreso') || m.includes('liquido') || m.includes('líquido')) return 'renta'
  if (m.includes('credito') || m.includes('crédito') || m.includes('hipotecario') || m.includes('banco') || m.includes('preaprob')) return 'credito'
  if (m.includes('iva') || m.includes('27 bis') || m.includes('dfl2') || m.includes('impuesto') || m.includes('tribut')) return 'tributario'
  if (m.includes('paraguay') || m.includes('florida') || m.includes('orlando') || m.includes('miami') || m.includes('chile')) return 'pais'
  if (m.includes('humano') || m.includes('ejecutivo') || m.includes('asesor') || m.includes('luis') || m.includes('persona')) return 'humano'
  if (m.includes('no me interesa') || m.includes('no quiero') || m.includes('dejen de escribir') || m.includes('eliminar')) return 'no_interesado'
  if (m.includes('hola') || m.includes('buenas') || m.includes('buenos dias') || m.includes('buenos días') || m.includes('buenas tardes')) return 'saludo'
  return 'general'
}

function deriveLeadUpdateFromMessage(message = {}) {
  const text = String(message || '')
  const n = normalizeForCheck(text)
  const update = {}

  const income = parseMoneyToNumber(text)
  if (income) update.renta = formatCLP(income)

  if (n.includes('renta corta') || n.includes('airbnb') || n.includes('booking')) update.modelo = 'renta_corta'
  else if (n.includes('renta tradicional') || n.includes('arriendo tradicional')) update.modelo = 'renta_tradicional'
  else if (n.includes('vivir') || n.includes('habitacional')) update.modelo = 'vivir'
  else if (n.includes('retiro') || n.includes('jubilacion') || n.includes('jubilación')) update.modelo = 'retiro_inmobiliario'
  else if (n.includes('multicredito') || n.includes('multicrédito') || n.includes('varios departamentos')) update.modelo = 'multicredito'

  const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  if (emailMatch) update.email = emailMatch[0]

  return onlyAllowedLeadUpdate(update)
}

function buildMemorySummary(leadData = {}, conversationHistory = []) {
  const all = conversationHistory.map(m => m.content).join(' \n ')
  const n = normalizeForCheck(all)
  const items = []

  if (leadData?.nombre) items.push(`Nombre conocido: ${leadData.nombre}`)
  if (leadData?.telefono) items.push(`Teléfono: ${leadData.telefono}`)
  if (leadData?.renta) items.push(`Renta ya informada: ${leadData.renta}`)
  if (leadData?.modelo) items.push(`Modelo/interés registrado: ${leadData.modelo}`)

  if (n.includes('renta corta') || n.includes('airbnb') || n.includes('booking')) items.push('Interés detectado: renta corta')
  if (n.includes('renta tradicional')) items.push('Interés detectado: renta tradicional')
  if (n.includes('iva') || n.includes('27 bis')) items.push('Tema detectado: recuperación de IVA / 27 bis')
  if (n.includes('dfl2')) items.push('Tema detectado: DFL2')
  if (n.includes('paraguay')) items.push('País detectado: Paraguay')
  if (n.includes('florida') || n.includes('miami') || n.includes('orlando')) items.push('País detectado: Florida / USA')
  if (n.includes('chile') || n.includes('santiago')) items.push('País/mercado detectado: Chile')
  if (n.includes('agendar') || n.includes('llamada') || n.includes('reunion')) items.push('El cliente ya mostró apertura a llamada/reunión')

  return [...new Set(items)].join('\n') || 'Sin memoria comercial suficiente todavía.'
}

function extractNameCandidate(text = '') {
  const lines = String(text || '')
    .split(/\n+/)
    .map(line => cleanText(line))
    .filter(Boolean)

  for (const line of lines) {
    if (/@/.test(line)) continue
    if (/\d/.test(line)) continue
    const n = normalizeForCheck(line)
    if (/^(no|si|sí|renta|airbnb|booking|stgo|santiago|quiero|gano|pero|responde)\b/.test(n)) continue
    if (/^[a-záéíóúñ]+\s+[a-záéíóúñ]+/i.test(line)) return line
  }
  return ''
}

function extractLeadProfileFromHistory(leadData = {}, conversationHistory = [], currentMessage = '') {
  const profile = {
    nombre: cleanText(leadData.nombre),
    telefono: cleanText(leadData.telefono),
    email: cleanText(leadData.email),
    rentaIndividual: 0,
    rentaPareja: 0,
    rentaTexto: cleanText(leadData.renta),
    modelo: cleanText(leadData.modelo),
    ubicacion: '',
    propiedades: '',
    experiencia: '',
    quiereAgendar: false,
    interesReal: false
  }

  const allMessages = [
    ...(Array.isArray(conversationHistory) ? conversationHistory : []),
    { role: 'user', content: String(currentMessage || '') }
  ]
  const allUserText = normalizeForCheck(allMessages.filter(m => m?.role === 'user').map(m => m.content || '').join(' '))

  for (const item of allMessages) {
    if (item?.role !== 'user') continue
    const text = String(item.content || '')
    const n = normalizeForCheck(text)

    const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
    if (emailMatch) profile.email = emailMatch[0]

    const nameCandidate = extractNameCandidate(text)
    if (nameCandidate && (!profile.nombre || profile.nombre.startsWith('+'))) profile.nombre = nameCandidate

    const income = parseMoneyToNumber(text)
    if (income) {
      const isCouple = /(pareja|esposa|esposo|conyuge|c[oó]nyuge|entre\s+los\s+dos|juntos|sumamos|hacemos|familiar|familia)/i.test(n)
      const contextSaysCouple = /pareja|entre\s+los\s+dos|juntos|hacemos|sumamos/.test(allUserText)
      if (isCouple || (income >= 2000000 && contextSaysCouple)) {
        profile.rentaPareja = Math.max(profile.rentaPareja || 0, income)
      } else {
        profile.rentaIndividual = Math.max(profile.rentaIndividual || 0, income)
      }
    }

    if (/renta\s+corta|airbnb|booking|diaria/.test(n)) profile.modelo = 'renta_corta'
    if (/renta\s+tradicional|arriendo\s+tradicional/.test(n)) profile.modelo = 'renta_tradicional'
    if (/retiro|jubilacion|jubilación/.test(n)) profile.modelo = 'retiro_inmobiliario'
    if (/vivir|primera\s+vivienda/.test(n)) profile.modelo = 'vivir'

    if (/stgo\s*centro|santiago\s*centro/.test(n)) profile.ubicacion = 'Santiago centro'
    else if (/nunoa|ñuñoa/.test(n)) profile.ubicacion = 'Ñuñoa'
    else if (/florida|miami|orlando/.test(n)) profile.ubicacion = 'Florida / USA'
    else if (/paraguay/.test(n)) profile.ubicacion = 'Paraguay'

    if (/no\s+tengo\s+propiedades|sin\s+propiedades|no\s+tengo\s+ninguna\s+propiedad/.test(n)) profile.propiedades = 'No tiene propiedades'
    else if (/tengo\s+\d+\s+propiedad|tengo\s+\d+\s+dpto|tengo\s+\d+\s+departamento/.test(n)) profile.propiedades = text

    if (/no\s+tengo\s+experiencia|sin\s+experiencia|primera\s+vez/.test(n)) profile.experiencia = 'Sin experiencia en Airbnb/Booking'
    else if (/tengo\s+experiencia|manejo\s+airbnb|ya\s+arriendo\s+por\s+airbnb/.test(n)) profile.experiencia = 'Con experiencia en Airbnb/Booking'

    if (/agendar|agenda|reuni[oó]n|llamada|quiero\s+hablar|calendly/.test(n)) profile.quiereAgendar = true
    if (/renta\s+corta|airbnb|booking|dpto|departamento|invertir|stgo\s*centro|santiago\s*centro|iva|dfl2|credito|cr[eé]dito/.test(n)) profile.interesReal = true
  }

  if (!profile.rentaTexto) {
    if (profile.rentaPareja) profile.rentaTexto = `${formatCLP(profile.rentaPareja)} conjunta`
    else if (profile.rentaIndividual) profile.rentaTexto = formatCLP(profile.rentaIndividual)
  }

  return profile
}

function isProfileQualified(profile = {}, rentaMin = 1500000, rentaMinPareja = 2000000) {
  return (
    Number(profile.rentaIndividual || 0) >= rentaMin ||
    Number(profile.rentaPareja || 0) >= rentaMinPareja ||
    (profile.quiereAgendar && (profile.rentaIndividual || profile.rentaPareja || profile.email))
  )
}

function missingMeetingFields(profile = {}) {
  const missing = []
  if (!profile.nombre || profile.nombre.startsWith('+')) missing.push('nombre completo')
  if (!profile.email) missing.push('correo')
  if (!profile.rentaIndividual && !profile.rentaPareja && !profile.rentaTexto) missing.push('renta líquida')
  if (!profile.propiedades) missing.push('si tienes propiedades')
  if (!profile.modelo) missing.push('modelo de inversión')
  return missing
}

function buildProfileSummary(profile = {}) {
  const rows = []
  if (profile.nombre) rows.push(`Nombre: ${profile.nombre}`)
  if (profile.email) rows.push(`Correo: ${profile.email}`)
  if (profile.rentaIndividual) rows.push(`Renta individual detectada: ${formatCLP(profile.rentaIndividual)}`)
  if (profile.rentaPareja) rows.push(`Renta conjunta/pareja detectada: ${formatCLP(profile.rentaPareja)}`)
  if (profile.rentaTexto && !profile.rentaIndividual && !profile.rentaPareja) rows.push(`Renta declarada: ${profile.rentaTexto}`)
  if (profile.modelo) rows.push(`Modelo/interés: ${profile.modelo}`)
  if (profile.ubicacion) rows.push(`Zona/país de interés: ${profile.ubicacion}`)
  if (profile.propiedades) rows.push(`Propiedades: ${profile.propiedades}`)
  if (profile.experiencia) rows.push(`Experiencia: ${profile.experiencia}`)
  if (profile.quiereAgendar) rows.push('El cliente pidió agendar reunión')
  return rows.join('\n') || 'Sin perfil consolidado aún.'
}

function buildCoherentDeterministicReply({ message, leadData, agendaLink, conversationHistory, profile, rentaMin, rentaMinPareja }) {
  const intent = inferLocalIntent(message, conversationHistory)
  const n = normalizeForCheck(message)
  const name = getFirstName(profile?.nombre || leadData?.nombre)
  const saludo = name ? `${name}, ` : ''
  const qualified = isProfileQualified(profile, rentaMin, rentaMinPareja)
  const missing = missingMeetingFields(profile)
  const hasContactAndMoney = !!profile.email && !!profile.nombre && (!!profile.rentaIndividual || !!profile.rentaPareja || !!profile.rentaTexto)

  if ((profile.quiereAgendar || intent === 'acepta_agendar') && qualified && hasContactAndMoney && missing.length <= 1) {
    const rentaLine = profile.rentaPareja
      ? `renta conjunta de ${formatCLP(profile.rentaPareja)}`
      : profile.rentaIndividual
        ? `renta de ${formatCLP(profile.rentaIndividual)}`
        : `renta declarada de ${profile.rentaTexto}`
    const zona = profile.ubicacion ? ` en ${profile.ubicacion}` : ''
    const modelo = profile.modelo === 'renta_corta' ? 'renta corta' : (profile.modelo || 'inversión inmobiliaria')
    return {
      reply: `${saludo}perfecto. Con ${rentaLine}, ${profile.propiedades ? profile.propiedades.toLowerCase() : 'tu perfil'} y foco en ${modelo}${zona}, sí corresponde agendar.\n\nEn la reunión revisamos crédito, pie, proyectos y números reales. Agenda acá:\n${agendaLink}`,
      action: 'calificado',
      leadUpdate: onlyAllowedLeadUpdate({ nombre: profile.nombre, email: profile.email, renta: profile.rentaTexto, modelo: profile.modelo })
    }
  }

  if ((profile.quiereAgendar || intent === 'acepta_agendar') && qualified && missing.length > 0 && missing.length <= 3) {
    return {
      reply: `${saludo}vamos bien. Para dejar la reunión bien tomada solo me falta: ${missing.join(', ')}.\n\nMe lo mandas por acá y te paso el link para agendar.`,
      action: 'conversando',
      leadUpdate: onlyAllowedLeadUpdate({ nombre: profile.nombre, email: profile.email, renta: profile.rentaTexto, modelo: profile.modelo })
    }
  }

  if (/no\s+tengo\s+experiencia|sin\s+experiencia|por\s+eso\s+quiero\s+que\s+me\s+orienten/.test(n) && qualified && (profile.quiereAgendar || profile.email)) {
    return {
      reply: `${saludo}justamente para eso es la asesoría. No necesitas experiencia previa: revisamos si el edificio permite renta corta, números reales, costos y cómo se administraría.\n\nAgenda acá y lo vemos con calma:\n${agendaLink}`,
      action: 'calificado',
      leadUpdate: onlyAllowedLeadUpdate({ nombre: profile.nombre, email: profile.email, renta: profile.rentaTexto, modelo: profile.modelo })
    }
  }

  if (/^responde\b|me\s+respondes|contesta/.test(n)) {
    if (profile.rentaIndividual || profile.rentaPareja || profile.modelo || profile.ubicacion) {
      return {
        reply: `${saludo}sí, te sigo. Ya tengo esto: ${profile.rentaTexto || 'renta por revisar'}${profile.modelo ? ', interés en ' + (profile.modelo === 'renta_corta' ? 'renta corta' : profile.modelo) : ''}${profile.ubicacion ? ', zona ' + profile.ubicacion : ''}.\n\n¿Quieres que lo llevemos a una reunión para revisar proyectos y números reales?`,
        action: qualified ? 'calificado' : 'conversando',
        leadUpdate: onlyAllowedLeadUpdate({ nombre: profile.nombre, email: profile.email, renta: profile.rentaTexto, modelo: profile.modelo })
      }
    }
  }

  if (profile.email && (profile.rentaIndividual || profile.rentaPareja) && profile.interesReal && qualified) {
    return {
      reply: `${saludo}perfecto, con esos datos ya puedo orientarte mejor. Calzas para revisar alternativas de ${profile.modelo === 'renta_corta' ? 'renta corta' : 'inversión'}${profile.ubicacion ? ' en ' + profile.ubicacion : ''}.\n\nTe dejo el link para agendar y revisar números reales:\n${agendaLink}`,
      action: 'calificado',
      leadUpdate: onlyAllowedLeadUpdate({ nombre: profile.nombre, email: profile.email, renta: profile.rentaTexto, modelo: profile.modelo })
    }
  }

  return null
}

function buildSafeFallback(message = '', leadData = {}, agendaLink = DEFAULT_AGENDA_LINK, conversationHistory = []) {
  const intent = inferLocalIntent(message, conversationHistory)
  const name = getFirstName(leadData?.nombre)
  const saludo = name ? `${name}, ` : ''
  const calendarLine = agendaLink ? `\n${agendaLink}` : ''

  if (intent === 'acepta_agendar') {
    return `${saludo}perfecto. Agendemos y revisamos tu caso con números reales: renta, crédito, pie y proyectos que calcen contigo.${calendarLine}`.trim()
  }

  if (intent === 'afirmacion') {
    return `${saludo}buenísimo. Para avanzar bien, dime una cosa: ¿buscas invertir para renta corta, renta tradicional o comprar para vivir?`.trim()
  }

  if (intent === 'precio') {
    return `${saludo}depende del proyecto, entrega y estrategia. Para no tirarte un número al aire, ¿lo buscas para renta corta, renta tradicional o para vivir?`.trim()
  }

  if (intent === 'renta_corta') {
    return `${saludo}para renta corta hay que revisar edificio, reglamento, demanda real, costos y ocupación anual. ¿Estás mirando Santiago centro u otra comuna?`.trim()
  }

  if (intent === 'renta') {
    const income = parseMoneyToNumber(message)
    if (income >= 1500000) {
      return `${saludo}con ${formatCLP(income)} líquido ya podemos revisar alternativas. ¿Comprarías solo o complementarías renta con pareja/familia?`.trim()
    }
    return `${saludo}perfecto. Para orientarte bien, ¿esa renta es individual o estás pensando complementar con pareja/familia?`.trim()
  }

  if (intent === 'credito') {
    return `${saludo}lo clave es revisar renta, deuda actual, pie y timing de entrega. ¿Ya tienes preaprobación o aún no has evaluado crédito?`.trim()
  }

  if (intent === 'tributario') {
    return `${saludo}eso hay que estructurarlo bien, porque DFL2, IVA 27 bis y renta corta no aplican igual en todos los casos. ¿Ya tienes propiedades a tu nombre?`.trim()
  }

  if (intent === 'pais') {
    return `${saludo}trabajamos oportunidades en Chile y también alternativas internacionales como Florida y Paraguay. ¿Qué país te interesa evaluar primero?`.trim()
  }

  if (intent === 'humano') {
    return `${saludo}claro. Te dejo avanzado el diagnóstico y lo puede tomar el equipo. ¿Quieres que agendemos una llamada?${calendarLine}`.trim()
  }

  if (intent === 'no_interesado') {
    return `${saludo}perfecto, no te molesto más. Si más adelante quieres evaluar una inversión inmobiliaria con números reales, me escribes por acá.`.trim()
  }

  if (intent === 'saludo') {
    return `Hola${name ? ' ' + name : ''}. Soy Rabito de Rabbitts Capital. Para orientarte bien, ¿buscas invertir para renta corta, renta tradicional o comprar para vivir?`.trim()
  }

  return `${saludo}te entiendo. Para ayudarte bien necesito partir por esto: ¿estás buscando invertir para generar renta o comprar para vivir?`.trim()
}

function sanitizeConversationHistory(conversationHistory = []) {
  return (Array.isArray(conversationHistory) ? conversationHistory : [])
    .filter(item => item?.role && item?.content)
    .slice(-28)
    .map(item => {
      const role = item.role === 'assistant' ? 'assistant' : 'user'
      let content = cleanText(item.content)

      if (role === 'assistant' && containsForbiddenReply(content)) {
        content = 'Mensaje técnico omitido. Rabito continuó disponible y mantuvo la conversación comercial.'
      }

      return { role, content }
    })
    .filter(item => item.content)
}

function stripDuplicateGreeting(out = '', safeHistory = []) {
  const hasPreviousAssistant = safeHistory.some(m => m.role === 'assistant')
  if (!hasPreviousAssistant) return out

  return out
    .replace(/^hola\s+[a-záéíóúñ]+[,!\.\s]+/i, '')
    .replace(/^hola[,!\.\s]+/i, '')
    .trim()
}

function sanitizeFinalReply(reply = '', message = '', leadData = {}, agendaLink = DEFAULT_AGENDA_LINK, conversationHistory = []) {
  let out = removeAgentMetadata(reply)
    .replace(/\*\*/g, '')
    .replace(/^[\s"']+|[\s"']+$/g, '')
    .trim()

  if (!out || containsForbiddenReply(out) || looksRobotic(out)) {
    out = buildSafeFallback(message, leadData, agendaLink, conversationHistory)
  }

  const replacements = [
    [/hola\s*👋\s*estoy con alta demanda.*$/gi, 'Hola. Estoy aquí. Cuéntame, ¿buscas invertir para renta corta, renta tradicional o comprar para vivir?'],
    [/estoy con alta demanda.*$/gi, 'Estoy aquí. Cuéntame qué estás buscando y te oriento.'],
    [/te respondo en unos minutos\.?/gi, 'te respondo ahora.'],
    [/soy una ia/gi, 'soy Rabito, el asistente comercial de Rabbitts Capital'],
    [/soy inteligencia artificial/gi, 'soy Rabito, el asistente comercial de Rabbitts Capital'],
    [/como modelo de lenguaje[^\.]*\.?/gi, ''],
    [/no tengo acceso[^\.]*\.?/gi, '']
  ]

  for (const [pattern, replacement] of replacements) {
    out = out.replace(pattern, replacement).trim()
  }

  if (containsForbiddenReply(out) || looksRobotic(out)) {
    out = buildSafeFallback(message, leadData, agendaLink, conversationHistory)
  }

  out = stripDuplicateGreeting(out, conversationHistory)

  // WhatsApp natural: máximo 5 líneas, máximo 850 caracteres.
  const lines = out.split('\n').map(line => line.trim()).filter(Boolean)
  if (lines.length > 5) out = lines.slice(0, 5).join('\n')
  if (out.length > 850) out = out.slice(0, 820).replace(/\s+\S*$/, '') + '...'

  return out.trim()
}

async function loadKnowledgeContext(iaConfig = {}) {
  const blocks = []

  if (Array.isArray(iaConfig.driveFiles) && iaConfig.driveFiles.length) {
    const txt = iaConfig.driveFiles
      .filter(file => file?.content || file?.text)
      .slice(0, 8)
      .map(file => `📄 ${file.name || 'Documento'}:\n${String(file.content || file.text || '').slice(0, 8000)}`)
      .join('\n\n───────────\n\n')
    if (txt) blocks.push('═══ DOCUMENTOS CARGADOS EN CONFIGURACIÓN ═══\n' + txt)
  }

  const SB_URL = cleanText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const SB_KEY = cleanText(process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  if (!SB_URL || !SB_KEY) return blocks.join('\n\n')

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(SB_URL, SB_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    const keys = ['drive_content', 'rabito_knowledge', 'ia_knowledge']
    const { data, error } = await sb
      .from('crm_settings')
      .select('key,value')
      .in('key', keys)

    if (error) {
      console.warn('[Agent] Knowledge config error:', error.message)
      return blocks.join('\n\n')
    }

    for (const row of data || []) {
      const value = row?.value
      if (!value) continue

      if (row.key === 'drive_content' && Array.isArray(value.files)) {
        const txt = value.files
          .slice(0, 10)
          .map(file => `📄 ${file.name || 'Documento'}${file.categoria ? ' · Categoría: ' + file.categoria : ''}${file.carpeta ? ' · Carpeta: ' + file.carpeta : ''}:\n${String(file.content || '').slice(0, 9000)}`)
          .join('\n\n───────────\n\n')
        if (txt) blocks.push('═══ BASE DE CONOCIMIENTO INTERNA ═══\n' + txt)
      }

      if ((row.key === 'rabito_knowledge' || row.key === 'ia_knowledge') && Array.isArray(value.items)) {
        const txt = value.items
          .filter(item => item?.title || item?.content)
          .slice(0, 20)
          .map(item => `• ${item.title || 'Regla'}: ${String(item.content || '').slice(0, 2500)}`)
          .join('\n')
        if (txt) blocks.push(`═══ ${row.key.toUpperCase()} ═══\n${txt}`)
      }
    }
  } catch (error) {
    console.warn('[Agent] Knowledge error:', error.message)
  }

  return blocks.join('\n\n')
}

async function callClaude({ anthropicKey, model, systemPrompt, messages, attempt = 1 }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 900,
      temperature: 0.38,
      system: systemPrompt,
      messages
    })
  })

  const text = await response.text()
  const data = safeJsonParse(text)

  if (!data) throw new Error(`Anthropic devolvió respuesta no JSON: ${text.slice(0, 180)}`)

  if (response.status === 529 || data?.error?.type === 'overloaded_error') {
    if (attempt <= 2) {
      await sleep(attempt * 1200)
      return callClaude({ anthropicKey, model, systemPrompt, messages, attempt: attempt + 1 })
    }
    throw new Error('Anthropic saturado')
  }

  if (!response.ok || data?.error) {
    throw new Error(data?.error?.message || `Anthropic HTTP ${response.status}`)
  }

  return data
}

async function extractDocument({ anthropicKey, file, mediaType, fileName }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'pdfs-2024-09-25'
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
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

  const textBody = await response.text()
  const data = safeJsonParse(textBody)

  if (!data) throw new Error(`Anthropic devolvió respuesta no JSON: ${textBody.slice(0, 180)}`)
  if (!response.ok || data?.error) throw new Error(data?.error?.message || 'Error extrayendo documento')

  const text = data?.content?.[0]?.text || ''
  console.log('[Agent] Extracted', text.length, 'chars from', fileName || 'documento')
  return text
}

function buildLeadContext(leadData = {}) {
  return [
    leadData.nombre ? `Nombre: ${leadData.nombre}` : 'Nombre: desconocido',
    leadData.telefono ? `Teléfono: ${leadData.telefono}` : '',
    leadData.renta ? `Renta declarada: ${leadData.renta}` : 'Renta: no informada',
    leadData.modelo ? `Modelo/interés: ${leadData.modelo}` : '',
    leadData.status ? `Estado conversación: ${leadData.status}` : ''
  ].filter(Boolean).join('\n')
}

function buildTrainingBlocks(iaConfig = {}) {
  const qa = Array.isArray(iaConfig.entrenamiento) ? iaConfig.entrenamiento : []
  const permanentRules = Array.isArray(iaConfig.reglasEntrenamiento) ? iaConfig.reglasEntrenamiento : []

  const qaBlocks = qa
    .filter(item => item?.pregunta && item?.respuesta)
    .slice(0, 60)
    .map((item, index) => {
      let block = `[FAQ ${index + 1}] SI EL CLIENTE PREGUNTA O DICE ALGO SIMILAR A: "${item.pregunta}"
RESPONDE CON ESTA IDEA: "${item.respuesta}"`
      if (item.razon) block += `
CONTEXTO: ${item.razon}`
      return block
    })

  const ruleBlocks = permanentRules
    .filter(item => item?.title && item?.content)
    .slice(0, 80)
    .map((item, index) => `[REGLA PERMANENTE ${index + 1}] ${item.title}: ${item.content}`)

  return [...ruleBlocks, ...qaBlocks].join('\n\n')
}

function getSystemPrompt({ iaConfig, agendaLink, rentaMin, rentaMinPareja, entrenamientoBlocks, knowledgeContext, memorySummary, leadData, currentIntent }) {
  const personalidad = cleanText(iaConfig.personalidad || 'Eres Rabito, asistente comercial de Rabbitts Capital Chile.')
  const guion = cleanText(iaConfig.guion)
  const productosRabito = cleanText(iaConfig.productosRabito)
  const pasosRabito = cleanText(iaConfig.pasosRabito)
  const reglasRabito = cleanText(iaConfig.reglasRabito)
  const objecionesRabito = cleanText(iaConfig.objecionesRabito)

  return `${personalidad}

═══ MODO RABITO — ESTILO VAMBE, PERO PARA RABBITTS ═══
Funcionas como un asistente comercial conversacional de WhatsApp: rápido, natural, con memoria de conversación y orientado a cerrar reunión. No das discursos. No pareces bot. Avanzas la conversación de forma simple.

No finjas ser Luis ni otra persona del equipo. Si preguntan qué eres, responde: "Soy Rabito, el asistente comercial de Rabbitts Capital". Si no preguntan, no lo menciones.

═══ OBJETIVO PRINCIPAL ═══
1. Entender si el cliente quiere invertir o comprar para vivir.
2. Detectar interés: renta corta, renta tradicional, plusvalía, retiro, Chile, Paraguay, Florida u otro.
3. Calificar con pocas preguntas: renta, pie/ahorros, comuna/país, timing y si compra solo o con renta complementaria.
4. Si existe interés real, llevar a llamada/reunión.
5. Mantener siempre la conversación activa. Nunca suenes caído, saturado o robótico.

═══ CAPACITACIÓN RABITO DESDE CRM ═══
${productosRabito ? `PRODUCTOS/SERVICIOS:
${productosRabito}
` : ''}
${pasosRabito ? `PASOS A SEGUIR:
${pasosRabito}
` : ''}
${reglasRabito ? `REGLAS DURAS:
${reglasRabito}
` : ''}
${objecionesRabito ? `MANEJO DE OBJECIONES:
${objecionesRabito}
` : ''}

═══ CRITERIOS DE CALIFICACIÓN ═══
Califica si cumple AL MENOS UNO:
- Renta individual igual o superior a $${rentaMin.toLocaleString('es-CL')} mensuales.
- Renta en pareja/familiar igual o superior a $${rentaMinPareja.toLocaleString('es-CL')} mensuales combinados.
- Tiene pie, ahorros o capacidad de inversión.
- Quiere comprar dentro de los próximos 6 meses.
- Pregunta por proyecto, precio, condiciones, crédito o rentabilidad.

No descartes rápido. Si falta información, pregunta solo una cosa.

═══ FLUJO COMERCIAL OBLIGATORIO ═══
${guion || `- Si saluda: responde cálido y pregunta objetivo.
- Si pregunta algo general: responde breve y termina con una pregunta útil.
- Si pregunta precio/proyecto: pide objetivo o comuna antes de dar números exactos si no están en contexto.
- Si dice "sí", "dale", "ok" o acepta avanzar: ofrece agendar.
- Si entrega renta o capacidad: valida y pregunta si compra solo o con renta complementaria.
- Si ya hay 3 mensajes positivos: invita a reunión.`}

═══ ESTILO HUMANO PARA WHATSAPP ═══
- Mensajes de 1 a 4 líneas.
- Máximo una pregunta por mensaje.
- Tono chileno, comercial, claro, cercano y seguro.
- No uses lenguaje corporativo pesado.
- No repitas exactamente respuestas anteriores.
- Antes de preguntar algo, revisa la memoria comercial y el perfil consolidado. Si el dato ya aparece, NO lo vuelvas a pedir.
- La falta de experiencia en Airbnb NO bloquea la reunión; es una razón para orientar y agendar.
- Si el cliente ya entregó nombre, correo, renta y modelo, el siguiente paso es agendar, no seguir preguntando.
- No hables como chatbot.
- No uses listas largas salvo que el cliente las pida.
- No prometas rentabilidades garantizadas.
- No inventes precios, stock ni condiciones si no están en contexto.
- Evita emojis. Solo usa uno si ayuda mucho y no se ve infantil.

═══ PROHIBIDO ABSOLUTO ═══
Nunca escribas ni insinúes:
- "alta demanda"
- "te respondo en unos minutos"
- "estoy ocupado"
- "no tengo acceso"
- "no puedo ayudarte"
- "soy una IA"
- "como modelo de lenguaje"
- "consulta con un profesional" como salida genérica
Si hay error, incertidumbre o falta información, respondes igual con una pregunta útil.

═══ CUÁNDO AGENDAR ═══
Usa el link de agenda configurable del CRM o el que esté escrito en la base de conocimiento: ${agendaLink}
No lo llames Calendly salvo que el link realmente sea de Calendly. Si mañana se cambia de proveedor, usas el nuevo link sin mencionar la marca.
Invita con naturalidad, por ejemplo:
"Perfecto. Agendemos y revisamos tu caso con números reales: renta, crédito, pie y proyectos que calcen contigo.\n${agendaLink}"

═══ MEMORIA COMERCIAL DE ESTA CONVERSACIÓN ═══
${memorySummary}

═══ LEAD ACTUAL ═══
${buildLeadContext(leadData)}

Intención detectada localmente: ${currentIntent}
${knowledgeContext ? `\n${knowledgeContext}` : ''}

═══ ENTRENAMIENTO CARGADO EN CRM ═══
${entrenamientoBlocks || 'Sin entrenamiento específico cargado. Usa el criterio comercial Rabbitts.'}

═══ FORMATO INTERNO OBLIGATORIO ═══
Al final de tu respuesta agrega estas líneas internas. El cliente NO las verá:
[ACCION: calificado] si invitaste a reunión o el cliente cumple criterio.
[ACCION: escalar] si pide hablar con humano, reclamo o caso complejo.
[ACCION: no_interesado] si dice claramente que no quiere seguir.
[ACCION: conversando] si todavía estás calificando.

[DATOS: nombre=X, renta=X, modelo=X]
Solo usa datos realmente entregados por el cliente. Si no hay datos nuevos, usa X.`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' })

  const ANTHROPIC_KEY = cleanText(process.env.ANTHROPIC_KEY || process.env.VITE_ANTHROPIC_KEY)
  const ANTHROPIC_MODEL = cleanText(process.env.ANTHROPIC_MODEL || DEFAULT_MODEL)

  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ ok: false, error: 'ANTHROPIC_KEY no configurada en Vercel' })
  }

  const body = req.body || {}
  const {
    message,
    conversationHistory = [],
    iaConfig = {},
    leadData = {},
    action,
    file,
    mediaType,
    fileName
  } = body

  if (action === 'extract' && file) {
    try {
      const text = await extractDocument({ anthropicKey: ANTHROPIC_KEY, file, mediaType, fileName })
      return res.status(200).json({ ok: true, text })
    } catch (error) {
      console.error('[Agent] Extract error:', error.message)
      return res.status(200).json({ ok: false, error: error.message, text: '' })
    }
  }

  if (!message) {
    return res.status(400).json({ ok: false, error: 'No message' })
  }

  const rentaMin = Number(iaConfig.rentaMinima) || 1500000
  const rentaMinPareja = Number(iaConfig.rentaMinimaPareja) || 2000000
  const entrenamientoBlocks = buildTrainingBlocks(iaConfig)
  const safeHistory = sanitizeConversationHistory(conversationHistory)
  const currentIntent = inferLocalIntent(message, safeHistory)
  const localUpdate = deriveLeadUpdateFromMessage(message)
  const profile = extractLeadProfileFromHistory({ ...leadData, ...localUpdate }, safeHistory, message)
  const profileLeadData = {
    ...leadData,
    ...localUpdate,
    nombre: profile.nombre || leadData.nombre,
    email: profile.email || leadData.email,
    renta: profile.rentaTexto || leadData.renta || localUpdate.renta,
    modelo: profile.modelo || leadData.modelo || localUpdate.modelo
  }
  const memorySummary = [
    buildMemorySummary(profileLeadData, [...safeHistory, { role: 'user', content: String(message) }]),
    '═══ PERFIL CONSOLIDADO DESDE TODA LA CONVERSACIÓN ═══',
    buildProfileSummary(profile)
  ].filter(Boolean).join('\n')
  const knowledgeContext = await loadKnowledgeContext(iaConfig)
  const agendaLink = cleanText(resolveAgendaLink(iaConfig, knowledgeContext))

  const deterministic = buildCoherentDeterministicReply({
    message,
    leadData: profileLeadData,
    agendaLink,
    conversationHistory: safeHistory,
    profile,
    rentaMin,
    rentaMinPareja
  })

  if (deterministic) {
    console.log('[Agent] deterministic reply | action:', deterministic.action, '| profile:', JSON.stringify(profile))
    return res.status(200).json({
      ok: true,
      reply: sanitizeFinalReply(deterministic.reply, message, profileLeadData, agendaLink, safeHistory),
      action: deterministic.action,
      leadUpdate: deterministic.leadUpdate || onlyAllowedLeadUpdate(localUpdate),
      memory: memorySummary,
      deterministic: true
    })
  }

  const systemPrompt = getSystemPrompt({
    iaConfig,
    agendaLink,
    rentaMin,
    rentaMinPareja,
    entrenamientoBlocks,
    knowledgeContext,
    memorySummary,
    leadData: profileLeadData,
    currentIntent
  })

  const messages = [
    ...safeHistory,
    { role: 'user', content: String(message) }
  ]

  try {
    const data = await callClaude({
      anthropicKey: ANTHROPIC_KEY,
      model: ANTHROPIC_MODEL,
      systemPrompt,
      messages
    })

    const rawReply = data?.content?.[0]?.text || ''
    const parsed = extractActionAndData(rawReply)
    const finalReply = sanitizeFinalReply(parsed.reply, message, profileLeadData, agendaLink, safeHistory)
    const leadUpdate = onlyAllowedLeadUpdate({ ...localUpdate, ...parsed.leadUpdate, nombre: profile.nombre, email: profile.email, renta: profile.rentaTexto, modelo: profile.modelo })

    let finalAction = parsed.action || 'conversando'
    if (currentIntent === 'no_interesado') finalAction = 'no_interesado'
    if (currentIntent === 'humano') finalAction = 'escalar'
    if (currentIntent === 'acepta_agendar') finalAction = 'calificado'

    console.log('[Agent] intent:', currentIntent, '| action:', finalAction, '| leadUpdate:', JSON.stringify(leadUpdate))

    return res.status(200).json({
      ok: true,
      reply: finalReply,
      action: finalAction,
      leadUpdate,
      memory: memorySummary
    })
  } catch (error) {
    console.error('[Agent] Error:', error?.stack || error?.message || error)

    return res.status(200).json({
      ok: true,
      reply: buildSafeFallback(message, profileLeadData, agendaLink, safeHistory),
      action: currentIntent === 'humano' ? 'escalar' : currentIntent === 'no_interesado' ? 'no_interesado' : 'conversando',
      leadUpdate: onlyAllowedLeadUpdate({ ...localUpdate, nombre: profile.nombre, email: profile.email, renta: profile.rentaTexto, modelo: profile.modelo }),
      fallback: true,
      error: error?.message || 'agent_error'
    })
  }
}
