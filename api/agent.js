// api/agent.js — Rabito guiado por panel IA, conocimiento y feedback
// Diseñado para Vercel. Sin JSX/HTML.

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'
const DEFAULT_AGENDA = 'https://crm.rabbittscapital.com/agenda'

const ALLOWED_LEAD_KEYS = new Set([
  'nombre', 'email', 'renta', 'modelo', 'objetivo', 'ubicacion',
  'propiedades', 'experiencia', 'pie', 'agenda_link'
])

const FORBIDDEN_PHRASES = [
  'alta demanda',
  'te respondo en unos minutos',
  'te respondo en algunos minutos',
  'estoy con alta demanda',
  'estoy ocupado',
  'estamos ocupados',
  'soy una ia',
  'soy inteligencia artificial',
  'como modelo de lenguaje',
  'no puedo ayudarte',
  'no tengo acceso',
  'responderé después',
  'responderé mas tarde',
  'te responderé después',
  'te responderé más tarde'
]

const ROBOTIC_PATTERNS = [
  /como\s+asistente\s+virtual/i,
  /como\s+modelo\s+de\s+lenguaje/i,
  /lamento\s+la\s+confusion/i,
  /gracias\s+por\s+tu\s+consulta/i,
  /es\s+importante\s+destacar/i,
  /consulta\s+con\s+un\s+profesional/i,
  /no\s+tengo\s+acceso/i,
  /no\s+puedo\s+ayudarte/i
]

function cleanText(value = '') {
  return String(value ?? '').trim()
}

function normalize(text = '') {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function unique(arr = []) {
  return [...new Set(arr.filter(Boolean))]
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function safeJsonParse(text, fallback = null) {
  try { return text ? JSON.parse(text) : fallback } catch (_) { return fallback }
}

function formatCLP(n = 0) {
  const value = Number(n || 0)
  if (!value) return ''
  return '$' + value.toLocaleString('es-CL')
}

function formatCompactCLP(n = 0) {
  const value = Number(n || 0)
  if (!value) return ''
  if (value >= 1000000) {
    const m = Math.round((value / 1000000) * 10) / 10
    return `$${String(m).replace(/\.0$/, '')}M`
  }
  if (value >= 1000) return formatCLP(value)
  return `$${value}`
}

function containsForbiddenReply(text = '') {
  const t = normalize(text)
  return FORBIDDEN_PHRASES.some(phrase => t.includes(normalize(phrase)))
}

function looksRobotic(text = '') {
  return ROBOTIC_PATTERNS.some(pattern => pattern.test(text || ''))
}

function removeInternalMarkers(text = '') {
  return String(text || '')
    .replace(/\[(?:ACCION|DATOS|MEMORIA|SLOT):[\s\S]*?\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function onlyAllowedLeadUpdate(update = {}) {
  const out = {}
  for (const [key, value] of Object.entries(update || {})) {
    const k = cleanText(key)
    const v = cleanText(value)
    if (ALLOWED_LEAD_KEYS.has(k) && v && v.toLowerCase() !== 'x') out[k] = v
  }
  return out
}

function getFirstName(name = '') {
  const cleaned = cleanText(name)
  if (!cleaned || cleaned.startsWith('+')) return ''
  return cleaned.split(/\s+/)[0]
}

function parseMoneyToNumber(text = '') {
  const raw = normalize(text)
    .replace(/\$/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')

  const millionMatch = raw.match(/\b(\d+(?:\.\d+)?)\s*(mm|millon(?:es)?|m\b)/i)
  if (millionMatch) return Math.round(Number(millionMatch[1]) * 1000000)

  const thousandMatch = raw.match(/\b(\d+(?:\.\d+)?)\s*(mil|k)\b/i)
  if (thousandMatch) return Math.round(Number(thousandMatch[1]) * 1000)

  const numberMatch = raw.match(/\b(\d{6,8})\b/)
  if (numberMatch) return Number(numberMatch[1])

  const shortMonthlyMatch = raw.match(/\b(\d{3,5})\b/)
  if (shortMonthlyMatch && /(mensual|liquido|liquida|renta|sueldo|gano|ingreso|hacemos|sumamos|pareja|entre\s+los\s+dos)/.test(raw)) {
    const value = Number(shortMonthlyMatch[1])
    if (value >= 500 && value <= 99999) return value * 1000
  }

  return 0
}

function parseSavingsToNumber(text = '') {
  const n = normalize(text)
  if (!/(pie|ahorro|ahorros|capital|invertir|inversion|inversiones)/.test(n)) return 0
  return parseMoneyToNumber(text)
}

function extractEmail(text = '') {
  const match = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  return match ? match[0] : ''
}

function extractNameCandidate(text = '') {
  const lines = String(text || '')
    .split(/\n+/)
    .map(line => cleanText(line))
    .filter(Boolean)

  for (const line of lines) {
    if (/@/.test(line)) continue
    if (/\d/.test(line)) continue
    if (/[?!.:,;]/.test(line)) continue
    if (line.split(/\s+/).length > 4) continue
    const n = normalize(line)
    if (/^(hola|si|no|renta|airbnb|booking|quiero|gano|inversion|invertir|para invertir|para vivir|renta corta|renta tradicional|tienes|stgo|santiago|ya)\b/.test(n)) continue
    if (/(quiero|santiago|stgo|renta|invertir|inversion|airbnb|booking)/.test(n)) continue
    if (/^[a-záéíóúñ]+(?:\s+[a-záéíóúñ]+){1,3}$/i.test(line)) return line
  }
  return ''
}

function inferIntent(message = '', history = []) {
  const m = normalize(message)
  const lastAssistant = [...history].reverse().find(item => item?.role === 'assistant')?.content || ''
  const la = normalize(lastAssistant)

  if (/\b(agendar|agenda|reunion|reunion|llamada|calendario|horario|link)\b/.test(m)) return 'agenda'
  if (/\b(humano|asesor|persona|ejecutivo|luis)\b/.test(m)) return 'humano'
  if (/\b(no me interesa|no quiero seguir|dejame tranquilo|déjame tranquilo|deja de escribir|chao|adios|adiós)\b/.test(m)) return 'no_interesado'
  if (/\b(que es|como funciona|explicame|explícame)\b/.test(m)) return 'explicacion'
  if (/\b(precio|valor|cuanto|cuánto|uf)\b/.test(m)) return 'precio'
  if (/\b(renta corta|airbnb|booking|diaria)\b/.test(m)) return 'renta_corta'
  if (/\b(renta tradicional|arriendo tradicional)\b/.test(m)) return 'renta_tradicional'
  if (/\b(credito|crédito|hipotecario|banco|preaprob)\b/.test(m)) return 'credito'
  if (/\b(iva|27 bis|dfl2|tribut)\b/.test(m)) return 'tributario'
  if (/\b(paraguay|miami|orlando|florida|chile|santiago|nunoa|ñunoa|stgo)\b/.test(m)) return 'ubicacion'
  if (/\b(si|sí|dale|ok|okay|perfecto|ya)\b/.test(m)) {
    if (la.includes('agend')) return 'agenda'
    return 'afirmacion'
  }
  if (/\b(hola|buenas|buenos dias|buenas tardes)\b/.test(m)) return 'saludo'
  if (/\b(me preguntas lo mismo|otra vez|de nuevo lo mismo|seguirás preguntando lo mismo|seguirás preguntando|a cada rato lo mismo)\b/.test(m)) return 'reclamo_repeticion'
  if (/\b(eres muy|eres penca|wn|weon|weón)\b/.test(m)) return 'molesto'
  if (/\b(inversion|invertir|para invertir|comprar para vivir|vivir)\b/.test(m)) return 'objetivo'
  return 'general'
}

function sanitizeConversationHistory(history = []) {
  return (Array.isArray(history) ? history : [])
    .filter(item => item?.role && item?.content)
    .slice(-40)
    .map(item => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: removeInternalMarkers(cleanText(item.content))
    }))
    .filter(item => item.content)
}

function inferAskedSlotsFromAssistant(text = '') {
  const n = normalize(text)
  const slots = []
  if (/(invertir|generar renta|comprar para vivir|para vivir)/.test(n)) slots.push('objetivo')
  if (/(renta corta|renta tradicional|modelo de renta|airbnb|booking)/.test(n)) slots.push('modelo')
  if (/(comuna|ciudad|pais|país|zona|donde|dónde)/.test(n)) slots.push('ubicacion')
  if (/(renta liquida|renta líquida|renta mensual|gano|ingreso|liquido suman|suman entre los dos)/.test(n)) slots.push('renta')
  if (/(pie|ahorros|capital disponible|capital para invertir)/.test(n)) slots.push('pie')
  if (/(propiedades a tu nombre|tienes propiedades)/.test(n)) slots.push('propiedades')
  if (/(experiencia.*airbnb|booking|primera vez)/.test(n)) slots.push('experiencia')
  if (/(correo|mail|email)/.test(n)) slots.push('email')
  if (/(agenda|reunion|llamada|link)/.test(n)) slots.push('agenda')
  return unique(slots)
}

function countAskedSlots(history = []) {
  const counts = {}
  for (const item of history || []) {
    if (item.role !== 'assistant') continue
    for (const slot of inferAskedSlotsFromAssistant(item.content)) {
      counts[slot] = (counts[slot] || 0) + 1
    }
  }
  return counts
}

function extractProfile(leadData = {}, history = [], currentMessage = '') {
  const profile = {
    nombre: cleanText(leadData.nombre),
    email: cleanText(leadData.email),
    telefono: cleanText(leadData.telefono),
    rentaIndividual: 0,
    rentaPareja: 0,
    rentaTexto: cleanText(leadData.renta),
    objetivo: cleanText(leadData.objetivo),
    modelo: cleanText(leadData.modelo),
    ubicacion: cleanText(leadData.ubicacion),
    propiedades: cleanText(leadData.propiedades),
    experiencia: cleanText(leadData.experiencia),
    pie: cleanText(leadData.pie),
    quiereAgenda: false,
    quiereHumano: false,
    noInteresado: false,
    molesto: false,
    reclamoRepeticion: false,
    interesReal: false,
    resumenHechos: []
  }

  const userMessages = [...history, { role: 'user', content: String(currentMessage || '') }]
    .filter(item => item.role === 'user')

  for (const item of userMessages) {
    const text = String(item.content || '')
    const n = normalize(text)

    const email = extractEmail(text)
    if (email) profile.email = email

    const nameCandidate = extractNameCandidate(text)
    if (nameCandidate && (!profile.nombre || profile.nombre.startsWith('+'))) profile.nombre = nameCandidate

    const income = parseMoneyToNumber(text)
    if (income) {
      const couple = /(pareja|entre los dos|entre\s+los\s+dos|juntos|sumamos|hacemos|familia|conyuge|cónyuge|esposa|esposo)/.test(n)
      if (couple) profile.rentaPareja = Math.max(profile.rentaPareja, income)
      else profile.rentaIndividual = Math.max(profile.rentaIndividual, income)
    }

    const savings = parseSavingsToNumber(text)
    if (savings) profile.pie = formatCLP(Math.max(parseMoneyToNumber(profile.pie), savings))
    if (/\b(no|nada|cero)\b/.test(n) && /(pie|ahorro|ahorros|capital)/.test(n)) profile.pie = 'No tiene pie/ahorros por ahora'

    if (/\b(inversion|invertir|para invertir|generar renta)\b/.test(n)) profile.objetivo = 'invertir'
    if (/\b(vivir|para vivir|habitacional|primera vivienda)\b/.test(n)) profile.objetivo = 'vivir'

    if (/\b(renta corta|airbnb|booking|diaria)\b/.test(n)) profile.modelo = 'renta_corta'
    if (/\b(renta tradicional|arriendo tradicional)\b/.test(n)) profile.modelo = 'renta_tradicional'
    if (/\b(retiro|jubilacion|jubilación)\b/.test(n)) profile.modelo = 'retiro_inmobiliario'

    if (/no quiero santiago|ya no quiero santiago|no quiero stgo|ya no quiero stgo/.test(n)) profile.ubicacion = ''
    else if (/stgo\s*centro|santiago\s*centro/.test(n)) profile.ubicacion = 'Santiago Centro'
    else if (/nunoa|ñunoa/.test(n)) profile.ubicacion = 'Ñuñoa'
    else if (/paraguay/.test(n)) profile.ubicacion = 'Paraguay'
    else if (/florida|miami|orlando/.test(n)) profile.ubicacion = 'Florida / USA'
    else if (/chile/.test(n) && !profile.ubicacion) profile.ubicacion = 'Chile'

    if (/no\s+tengo\s+propiedades|sin\s+propiedades|no\s+tengo\s+ninguna\s+propiedad/.test(n)) profile.propiedades = 'No tiene propiedades'
    else if (/tengo\s+propiedad|tengo\s+depto|tengo\s+departamento/.test(n)) profile.propiedades = cleanText(text)

    if (/no\s+tengo\s+experiencia|sin\s+experiencia|primera\s+vez/.test(n)) profile.experiencia = 'Sin experiencia'
    else if (/tengo\s+experiencia|ya\s+manejo\s+airbnb|manejo\s+airbnb/.test(n)) profile.experiencia = 'Con experiencia'

    if (/agendar|agenda|reunion|reunión|llamada|horario|link/.test(n)) profile.quiereAgenda = true
    if (/humano|asesor|ejecutivo|persona|luis/.test(n)) profile.quiereHumano = true
    if (/no me interesa|chao|adios|adiós|deja de escribir|no quiero seguir/.test(n)) profile.noInteresado = true
    if (/me preguntas lo mismo|otra vez|de nuevo lo mismo|a cada rato lo mismo|seguir[aá]s preguntando lo mismo/.test(n)) profile.reclamoRepeticion = true
    if (/eres muy|eres penca|wn|weon|weón/.test(n)) profile.molesto = true

    if (/(invertir|inversion|renta corta|renta tradicional|airbnb|booking|credito|crédito|iva|dfl2|proyecto|departamento|depto|agenda|reunion|llamada)/.test(n)) {
      profile.interesReal = true
    }
  }

  if (!profile.rentaTexto) {
    if (profile.rentaPareja) profile.rentaTexto = `${formatCLP(profile.rentaPareja)} conjunta`
    else if (profile.rentaIndividual) profile.rentaTexto = formatCLP(profile.rentaIndividual)
  }

  if (profile.nombre) profile.resumenHechos.push(`Nombre: ${profile.nombre}`)
  if (profile.objetivo) profile.resumenHechos.push(`Objetivo: ${profile.objetivo}`)
  if (profile.modelo) profile.resumenHechos.push(`Modelo: ${profile.modelo}`)
  if (profile.ubicacion) profile.resumenHechos.push(`Zona: ${profile.ubicacion}`)
  if (profile.rentaTexto) profile.resumenHechos.push(`Renta: ${profile.rentaTexto}`)
  if (profile.pie) profile.resumenHechos.push(`Pie/ahorros: ${profile.pie}`)
  if (profile.propiedades) profile.resumenHechos.push(`Propiedades: ${profile.propiedades}`)
  if (profile.experiencia) profile.resumenHechos.push(`Experiencia: ${profile.experiencia}`)
  if (profile.email) profile.resumenHechos.push(`Correo: ${profile.email}`)

  return profile
}

function isQualified(profile = {}, rentaMin = 1500000, rentaMinPareja = 2000000) {
  const rentaOk = (profile.rentaIndividual || 0) >= rentaMin || (profile.rentaPareja || 0) >= rentaMinPareja
  const hasPie = !!profile.pie && !/no tiene/i.test(profile.pie)
  return rentaOk || hasPie
}

function isSoftQualified(profile = {}, rentaMin = 1500000, rentaMinPareja = 2000000) {
  const rentaOk = (profile.rentaIndividual || 0) >= Math.round(rentaMin * 0.8) || (profile.rentaPareja || 0) >= Math.round(rentaMinPareja * 0.8)
  return rentaOk || !!profile.pie || profile.quiereAgenda
}

function getMissingSlots(profile = {}) {
  const missing = []
  if (!profile.objetivo) missing.push('objetivo')
  if (profile.objetivo === 'invertir' && !profile.modelo) missing.push('modelo')
  if (profile.objetivo === 'invertir' && !profile.ubicacion) missing.push('ubicacion')
  if (!profile.rentaIndividual && !profile.rentaPareja && !profile.pie) missing.push('renta')
  return missing
}

function summarizeProfile(profile = {}) {
  return profile.resumenHechos.join(' · ') || 'Sin datos relevantes todavía.'
}

function buildQuestionForSlot(slot, profile = {}) {
  switch (slot) {
    case 'objetivo':
      return '¿Esto lo estás viendo como inversión o para vivir?'
    case 'modelo':
      return 'Perfecto. ¿Te interesa más renta corta o renta tradicional?'
    case 'ubicacion':
      return profile.modelo === 'renta_corta'
        ? 'Perfecto. ¿Qué comuna, ciudad o país quieres evaluar para renta corta?'
        : 'Perfecto. ¿Qué comuna, ciudad o país quieres evaluar?'
    case 'renta':
      return 'Para ver capacidad real, ¿con qué renta líquida comprarías? Si es con pareja, dime la suma de ambos.'
    case 'pie':
      return '¿Tienes pie o ahorros para partir, aunque sea en cuotas?'
    case 'propiedades':
      return '¿Tienes alguna propiedad actualmente a tu nombre?'
    case 'experiencia':
      return '¿Ya has manejado Airbnb o sería primera vez?'
    case 'email':
      return '¿Me compartes tu correo para dejarte el caso bien tomado?'
    default:
      return 'Cuéntame un poco más para orientarte mejor.'
  }
}

function pickNextSlot(profile = {}, askedCounts = {}, complaintMode = false) {
  const missing = getMissingSlots(profile)
  const candidates = complaintMode ? missing.filter(slot => (askedCounts[slot] || 0) === 0) : missing
  if (candidates.length) return candidates[0]

  if (!profile.pie && (askedCounts.pie || 0) === 0 && profile.objetivo === 'invertir' && !complaintMode) return 'pie'
  if (!profile.experiencia && (askedCounts.experiencia || 0) === 0 && profile.modelo === 'renta_corta' && !complaintMode) return 'experiencia'
  return ''
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

  if (!['calificado', 'escalar', 'no_interesado', 'conversando'].includes(action)) action = 'conversando'

  return { reply: removeInternalMarkers(reply), action, leadUpdate: onlyAllowedLeadUpdate(leadUpdate) }
}

function buildLeadUpdate(profile = {}, localUpdate = {}, agendaLink = '') {
  return onlyAllowedLeadUpdate({
    ...localUpdate,
    nombre: profile.nombre,
    email: profile.email,
    renta: profile.rentaTexto,
    modelo: profile.modelo,
    objetivo: profile.objetivo,
    ubicacion: profile.ubicacion,
    propiedades: profile.propiedades,
    experiencia: profile.experiencia,
    pie: profile.pie,
    agenda_link: agendaLink
  })
}

function deriveLeadUpdateFromMessage(message = '') {
  const n = normalize(message)
  const update = {}
  const income = parseMoneyToNumber(message)
  if (income) update.renta = formatCLP(income)
  const pie = parseSavingsToNumber(message)
  if (pie) update.pie = formatCLP(pie)
  const email = extractEmail(message)
  if (email) update.email = email
  if (/\b(inversion|invertir|para invertir)\b/.test(n)) update.objetivo = 'invertir'
  if (/\b(vivir|para vivir)\b/.test(n)) update.objetivo = 'vivir'
  if (/\b(renta corta|airbnb|booking)\b/.test(n)) update.modelo = 'renta_corta'
  if (/\b(renta tradicional|arriendo tradicional)\b/.test(n)) update.modelo = 'renta_tradicional'
  return onlyAllowedLeadUpdate(update)
}

function buildRuleDrivenReply({ message, profile, history, agendaLink, rentaMin, rentaMinPareja }) {
  const intent = inferIntent(message, history)
  const askedCounts = countAskedSlots(history)
  const complaintMode = profile.reclamoRepeticion || intent === 'reclamo_repeticion'
  const qualified = isQualified(profile, rentaMin, rentaMinPareja)
  const softQualified = isSoftQualified(profile, rentaMin, rentaMinPareja)
  const firstName = getFirstName(profile.nombre)
  const intro = firstName ? `${firstName}, ` : ''

  if (profile.noInteresado || intent === 'no_interesado') {
    return {
      reply: `${intro}perfecto. No te molesto más. Si más adelante quieres revisar una inversión con números reales, me escribes por acá.`,
      action: 'no_interesado'
    }
  }

  if (profile.quiereHumano || intent === 'humano') {
    return {
      reply: `${intro}perfecto. Te conviene verlo directo en reunión para no perder tiempo por chat. Te dejo el link para elegir horario:\n${agendaLink}`,
      action: 'escalar'
    }
  }

  if ((profile.quiereAgenda || intent === 'agenda') && (qualified || softQualified || profile.interesReal)) {
    return {
      reply: `${intro}perfecto. Lo mejor es verlo en reunión y aterrizar proyectos, crédito, pie y estrategia según tu caso. Agenda aquí:\n${agendaLink}`,
      action: 'calificado'
    }
  }

  if ((complaintMode || profile.molesto || intent === 'molesto') && (qualified || softQualified || profile.interesReal)) {
    const nextSlot = pickNextSlot(profile, askedCounts, true)
    if (!nextSlot || (askedCounts[nextSlot] || 0) >= 1) {
      return {
        reply: `${intro}tienes razón. Ya no te voy a repetir lo mismo. Con lo que ya me diste, lo mejor es avanzar a reunión para mostrarte opciones reales. Te dejo el link:\n${agendaLink}`,
        action: qualified || softQualified ? 'calificado' : 'conversando'
      }
    }
    return {
      reply: `${intro}tienes razón. Voy directo. Ya tengo esto: ${summarizeProfile(profile)}.\n\nSolo me falta esto para orientarte mejor: ${buildQuestionForSlot(nextSlot, profile)}`,
      action: 'conversando'
    }
  }

  if (profile.objetivo === 'invertir' && profile.modelo && (profile.rentaIndividual || profile.rentaPareja || profile.pie) && (qualified || softQualified)) {
    return {
      reply: `${intro}perfecto. Ya tengo lo principal: ${summarizeProfile(profile)}.\n\nCon eso sí conviene revisar alternativas contigo en reunión. Agenda acá:\n${agendaLink}`,
      action: 'calificado'
    }
  }

  const nextSlot = pickNextSlot(profile, askedCounts, false)
  if (nextSlot && (askedCounts[nextSlot] || 0) < 2) {
    return {
      reply: `${intro}${buildQuestionForSlot(nextSlot, profile)}`,
      action: 'conversando'
    }
  }

  if (profile.interesReal) {
    return {
      reply: `${intro}ya tengo buen contexto: ${summarizeProfile(profile)}.\n\nPara no hacerte perder tiempo por chat, te dejo el link y lo revisamos con calma:\n${agendaLink}`,
      action: softQualified ? 'calificado' : 'conversando'
    }
  }

  return null
}

function sanitizeFinalReply(reply = '', message = '', profile = {}, agendaLink = DEFAULT_AGENDA, history = []) {
  let out = removeInternalMarkers(reply)
    .replace(/\*\*/g, '')
    .replace(/^[\s"']+|[\s"']+$/g, '')
    .trim()

  if (!out || containsForbiddenReply(out) || looksRobotic(out)) {
    const fallback = buildRuleDrivenReply({
      message,
      profile,
      history,
      agendaLink,
      rentaMin: 1500000,
      rentaMinPareja: 2000000
    })
    out = fallback?.reply || 'Cuéntame qué estás buscando y te oriento de forma directa.'
  }

  out = out
    .replace(/hola\s*👋\s*estoy con alta demanda.*$/gi, 'Hola. Estoy aquí. Cuéntame qué estás buscando y te oriento.')
    .replace(/estoy con alta demanda.*$/gi, 'Estoy aquí. Cuéntame qué estás buscando y te oriento.')
    .replace(/te respondo en unos minutos\.?/gi, 'te respondo ahora.')
    .replace(/soy una ia/gi, 'soy Rabito, el asistente comercial de Rabbitts Capital')
    .replace(/soy inteligencia artificial/gi, 'soy Rabito, el asistente comercial de Rabbitts Capital')
    .replace(/como modelo de lenguaje[^\.]*\.?/gi, '')
    .trim()

  const lines = out.split('\n').map(line => line.trim()).filter(Boolean)
  if (lines.length > 5) out = lines.slice(0, 5).join('\n')
  if (out.length > 900) out = out.slice(0, 860).replace(/\s+\S*$/, '') + '...'

  return out.trim()
}

function buildLeadContext(profile = {}) {
  return [
    profile.nombre ? `Nombre: ${profile.nombre}` : '',
    profile.email ? `Correo: ${profile.email}` : '',
    profile.objetivo ? `Objetivo: ${profile.objetivo}` : '',
    profile.modelo ? `Modelo: ${profile.modelo}` : '',
    profile.ubicacion ? `Zona: ${profile.ubicacion}` : '',
    profile.rentaTexto ? `Renta: ${profile.rentaTexto}` : '',
    profile.pie ? `Pie/ahorros: ${profile.pie}` : '',
    profile.propiedades ? `Propiedades: ${profile.propiedades}` : '',
    profile.experiencia ? `Experiencia: ${profile.experiencia}` : '',
    profile.quiereAgenda ? 'Pidió agenda/reunión' : '',
    profile.reclamoRepeticion ? 'Se quejó por repetición' : ''
  ].filter(Boolean).join('\n') || 'Sin datos consolidados todavía.'
}

async function getSupabaseClient() {
  const SB_URL = cleanText(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const SB_KEY = cleanText(process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY)
  if (!SB_URL || !SB_KEY) return null

  const { createClient } = await import('@supabase/supabase-js')
  return createClient(SB_URL, SB_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

async function loadKnowledgeContext(iaConfig = {}, sb = null) {
  const blocks = []

  if (Array.isArray(iaConfig.driveFiles) && iaConfig.driveFiles.length) {
    const txt = iaConfig.driveFiles
      .filter(file => file?.content || file?.text)
      .slice(0, 8)
      .map(file => `📄 ${file.name || 'Documento'}:\n${String(file.content || file.text || '').slice(0, 5000)}`)
      .join('\n\n───────────\n\n')
    if (txt) blocks.push('═══ DOCUMENTOS CARGADOS EN LA CONFIGURACIÓN ═══\n' + txt)
  }

  if (!sb) return blocks.join('\n\n')

  try {
    const keys = ['drive_content', 'rabito_knowledge', 'ia_knowledge']
    const { data, error } = await sb
      .from('crm_settings')
      .select('key,value')
      .in('key', keys)

    if (error) return blocks.join('\n\n')

    for (const row of data || []) {
      const value = row?.value
      if (!value) continue

      if (row.key === 'drive_content' && Array.isArray(value.files)) {
        const txt = value.files
          .slice(0, 12)
          .map(file => `📄 ${file.name || 'Documento'}${file.carpeta ? ' · Carpeta: ' + file.carpeta : ''}:\n${String(file.content || '').slice(0, 7000)}`)
          .join('\n\n───────────\n\n')
        if (txt) blocks.push('═══ BASE DE CONOCIMIENTO ═══\n' + txt)
      }

      if ((row.key === 'rabito_knowledge' || row.key === 'ia_knowledge') && Array.isArray(value.items)) {
        const txt = value.items
          .filter(item => item?.title || item?.content)
          .slice(0, 24)
          .map(item => `• ${item.title || 'Regla'}: ${String(item.content || '').slice(0, 1800)}`)
          .join('\n')
        if (txt) blocks.push(`═══ ${row.key.toUpperCase()} ═══\n${txt}`)
      }
    }
  } catch (_) {
    // noop
  }

  return blocks.join('\n\n')
}

async function loadFeedbackLearnings(sb = null) {
  if (!sb) return ''
  try {
    const { data, error } = await sb
      .from('crm_conv_feedback')
      .select('msg_content,feedback,correction,created_at')
      .eq('feedback', 'correccion')
      .order('created_at', { ascending: false })
      .limit(60)

    if (error || !Array.isArray(data)) return ''

    const blocks = data
      .filter(item => cleanText(item.correction))
      .slice(0, 50)
      .map((item, idx) => `[CORRECCION APRENDIDA ${idx + 1}] Si una situación se parece a esto: "${cleanText(item.msg_content).slice(0, 350)}" entonces una mejor respuesta o línea de acción es: "${cleanText(item.correction).slice(0, 500)}"`)

    return blocks.join('\n\n')
  } catch (_) {
    return ''
  }
}

function buildTrainingBlocks(iaConfig = {}, feedbackLearnings = '') {
  const permanentRules = Array.isArray(iaConfig.reglasEntrenamiento) ? iaConfig.reglasEntrenamiento : []
  const entrenamiento = Array.isArray(iaConfig.entrenamiento) ? iaConfig.entrenamiento : []

  const rules = permanentRules
    .filter(item => item?.title && item?.content)
    .slice(0, 80)
    .map((item, index) => `[REGLA PERMANENTE ${index + 1}] ${item.title}: ${item.content}`)

  const qa = entrenamiento
    .filter(item => item?.pregunta && item?.respuesta)
    .slice(0, 80)
    .map((item, index) => {
      let block = `[ENTRENAMIENTO ${index + 1}] Si el cliente pregunta o plantea algo parecido a: "${item.pregunta}", responde siguiendo esta idea: "${item.respuesta}"`
      if (item.razon) block += `\nContexto extra: ${item.razon}`
      return block
    })

  return [feedbackLearnings, ...rules, ...qa].filter(Boolean).join('\n\n')
}

function buildSystemPrompt({ iaConfig, agendaLink, rentaMin, rentaMinPareja, trainingBlocks, knowledgeContext, profile, history, nextSlot, currentIntent }) {
  const personalidad = cleanText(iaConfig.personalidad || 'Eres Rabito, asistente comercial de Rabbitts Capital.')
  const productosRabito = cleanText(iaConfig.productosRabito)
  const pasosRabito = cleanText(iaConfig.pasosRabito)
  const reglasRabito = cleanText(iaConfig.reglasRabito)
  const objecionesRabito = cleanText(iaConfig.objecionesRabito)
  const guion = cleanText(iaConfig.guion)
  const askedCounts = countAskedSlots(history)

  return `${personalidad}

═══ PRINCIPIO OPERATIVO ═══
Tu conducta no se basa en conversaciones pregrabadas. Debes responder usando:
1. Lo que el usuario ya dijo en esta conversación.
2. Las reglas del panel IA.
3. El entrenamiento y correcciones aprendidas.
4. La base de conocimiento cargada.

Si un dato ya existe en PERFIL CONSOLIDADO, NO lo vuelvas a pedir.
Si el cliente reclama por repetición, NO repitas preguntas. Resume lo que ya sabes y avanza.
Si ya tienes objetivo + modelo + renta o pie, invita a reunión. No sigas interrogando.

═══ OFERTA / CONTEXTO DE NEGOCIO ═══
${productosRabito || 'Sin oferta cargada. Usa el contexto general de Rabbitts Capital.'}

═══ PASOS A SEGUIR ═══
${pasosRabito || 'Entender objetivo → calificar → orientar → invitar a reunión si corresponde.'}

═══ REGLAS DURAS DEL PANEL ═══
${reglasRabito || 'Mensajes cortos, una pregunta por mensaje, sin inventar información.'}

═══ OBJECIONES Y RESPUESTAS ═══
${objecionesRabito || 'Responde con criterio comercial y sin prometer resultados.'}

═══ GUION / PROCESO ═══
${guion || 'No usar guion rígido. Conversar natural y avanzar con criterio.'}

═══ CRITERIOS DE CALIFICACIÓN ═══
- Renta individual mínima: ${formatCLP(rentaMin)}
- Renta conjunta mínima: ${formatCLP(rentaMinPareja)}
- También puede avanzar si tiene pie/ahorros o si quiere agendar y ya mostró interés real.

═══ PERFIL CONSOLIDADO ═══
${buildLeadContext(profile)}

═══ ESTADO DE LA CONVERSACIÓN ═══
Intención local detectada: ${currentIntent}
Próximo slot sugerido si falta algo: ${nextSlot || 'ninguno'}
Slots ya preguntados por el asistente: ${JSON.stringify(askedCounts)}

Regla obligatoria: si un slot ya fue preguntado 2 veces o más, NO lo preguntes otra vez.
Regla obligatoria: si el cliente dice "ya no quiero Santiago" u otro cambio, respeta el cambio y actualiza el foco.
Regla obligatoria: si el cliente quiere reunión y ya hay señales suficientes, entrega el link de agenda: ${agendaLink}

═══ BASE DE CONOCIMIENTO ═══
${knowledgeContext || 'Sin base adicional cargada.'}

═══ ENTRENAMIENTO Y APRENDIZAJES ═══
${trainingBlocks || 'Sin entrenamiento adicional cargado.'}

═══ ESTILO DE RESPUESTA ═══
- WhatsApp real.
- 1 a 4 líneas.
- Máximo una pregunta.
- Tono humano, comercial, claro y directo.
- Sin sonar bot.
- No usar listas largas salvo que sea imprescindible.
- No repetir frases exactas usadas por el asistente antes.
- Si el cliente está molesto, reconoce eso en una línea y corrige el rumbo.

═══ PROHIBIDO ═══
Nunca escribas ni insinúes: alta demanda, responder después, estoy ocupado, soy IA, como modelo de lenguaje, no puedo ayudarte.
No inventes precios, stock, rentabilidades, subsidios ni beneficios tributarios.
No pidas de nuevo renta, modelo, objetivo, ubicación o experiencia si ya están en el perfil.

═══ FORMATO INTERNO OBLIGATORIO ═══
Al final agrega estas marcas internas. El cliente NO las verá:
[ACCION: calificado|escalar|no_interesado|conversando]
[DATOS: nombre=X, email=X, renta=X, modelo=X, objetivo=X, ubicacion=X, propiedades=X, experiencia=X, pie=X]`
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
      temperature: 0.35,
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

  if (!response.ok || data?.error) throw new Error(data?.error?.message || `Anthropic HTTP ${response.status}`)
  return data
}

async function extractDocument({ anthropicKey, file, mediaType }) {
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
          { type: 'text', text: 'Extrae y devuelve TODO el texto de este documento exactamente como aparece, sin resumir.' }
        ]
      }]
    })
  })

  const textBody = await response.text()
  const data = safeJsonParse(textBody)
  if (!data) throw new Error(`Anthropic devolvió respuesta no JSON: ${textBody.slice(0, 180)}`)
  if (!response.ok || data?.error) throw new Error(data?.error?.message || 'Error extrayendo documento')
  return data?.content?.[0]?.text || ''
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' })

  const ANTHROPIC_KEY = cleanText(process.env.ANTHROPIC_KEY || process.env.VITE_ANTHROPIC_KEY)
  const ANTHROPIC_MODEL = cleanText(process.env.ANTHROPIC_MODEL || DEFAULT_MODEL)
  if (!ANTHROPIC_KEY) return res.status(500).json({ ok: false, error: 'ANTHROPIC_KEY no configurada en Vercel' })

  const body = req.body || {}
  const {
    message,
    conversationHistory = [],
    iaConfig = {},
    leadData = {},
    action,
    file,
    mediaType
  } = body

  if (action === 'extract' && file) {
    try {
      const text = await extractDocument({ anthropicKey: ANTHROPIC_KEY, file, mediaType })
      return res.status(200).json({ ok: true, text })
    } catch (error) {
      return res.status(200).json({ ok: false, error: error.message, text: '' })
    }
  }

  if (!message) return res.status(400).json({ ok: false, error: 'No message' })

  const safeHistory = sanitizeConversationHistory(conversationHistory)
  const localUpdate = deriveLeadUpdateFromMessage(message)
  const agendaLink = cleanText(iaConfig.agendaLink || iaConfig.calendlyLink || process.env.DEFAULT_AGENDA_LINK || DEFAULT_AGENDA)
  const rentaMin = Number(iaConfig.rentaMinima) || 1500000
  const rentaMinPareja = Number(iaConfig.rentaMinimaPareja) || 2000000
  const profile = extractProfile({ ...leadData, ...localUpdate }, safeHistory, message)
  const nextSlot = pickNextSlot(profile, countAskedSlots(safeHistory), profile.reclamoRepeticion)
  const currentIntent = inferIntent(message, safeHistory)
  const sb = await getSupabaseClient()
  const [knowledgeContext, feedbackLearnings] = await Promise.all([
    loadKnowledgeContext(iaConfig, sb),
    loadFeedbackLearnings(sb)
  ])
  const trainingBlocks = buildTrainingBlocks(iaConfig, feedbackLearnings)
  const leadUpdate = buildLeadUpdate(profile, localUpdate, agendaLink)

  const deterministic = buildRuleDrivenReply({
    message,
    profile,
    history: safeHistory,
    agendaLink,
    rentaMin,
    rentaMinPareja
  })

  if (deterministic) {
    return res.status(200).json({
      ok: true,
      reply: sanitizeFinalReply(deterministic.reply, message, profile, agendaLink, safeHistory),
      action: deterministic.action,
      leadUpdate,
      memory: summarizeProfile(profile),
      deterministic: true
    })
  }

  const systemPrompt = buildSystemPrompt({
    iaConfig,
    agendaLink,
    rentaMin,
    rentaMinPareja,
    trainingBlocks,
    knowledgeContext,
    profile,
    history: safeHistory,
    nextSlot,
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
    const finalReply = sanitizeFinalReply(parsed.reply, message, profile, agendaLink, safeHistory)

    let finalAction = parsed.action || 'conversando'
    if (currentIntent === 'no_interesado') finalAction = 'no_interesado'
    if (currentIntent === 'humano') finalAction = 'escalar'
    if (currentIntent === 'agenda' && isSoftQualified(profile, rentaMin, rentaMinPareja)) finalAction = 'calificado'

    return res.status(200).json({
      ok: true,
      reply: finalReply,
      action: finalAction,
      leadUpdate: onlyAllowedLeadUpdate({ ...leadUpdate, ...parsed.leadUpdate }),
      memory: summarizeProfile(profile)
    })
  } catch (error) {
    const fallback = buildRuleDrivenReply({
      message,
      profile,
      history: safeHistory,
      agendaLink,
      rentaMin,
      rentaMinPareja
    })

    return res.status(200).json({
      ok: true,
      reply: sanitizeFinalReply(fallback?.reply || 'Cuéntame qué estás buscando y te oriento de forma directa.', message, profile, agendaLink, safeHistory),
      action: fallback?.action || (currentIntent === 'humano' ? 'escalar' : currentIntent === 'no_interesado' ? 'no_interesado' : 'conversando'),
      leadUpdate,
      fallback: true,
      error: error?.message || 'agent_error'
    })
  }
}
