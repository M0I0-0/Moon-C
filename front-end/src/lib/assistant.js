import { API_URL } from '../config'
import { keywords, protocolView, indicatorName, normalRange, protocols } from '../data/manual'

const withTimeout = (ms) => (AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined)

export async function checkBackend() {
  try {
    const res = await fetch(`${API_URL}/status`, { signal: withTimeout(1500) })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

export async function askBackend({ message, crewId, sessionId }) {
  const res = await fetch(`${API_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, crew_id: crewId, message, language: 'es' }),
    signal: withTimeout(30000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return { ...(await res.json()), via: 'backend' }
}

// ---------------------------------------------------------------------------
// Respuestas simuladas cuando el backend no está corriendo. Sigue las mismas
// reglas que Backend/app/intent.py y chat.py, usando shared/keywords.json y
// shared/protocols.json, para que la demo se comporte igual.

export function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’‘`´ʼ]/g, '')
    .replace(/[^\p{L}\p{N}\s]|_/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const phrases = (node) =>
  Object.entries(node)
    .filter(([k, v]) => !k.startsWith('_') && Array.isArray(v))
    .flatMap(([, v]) => v.map(normalize))
    .filter(Boolean)

const contains = (text, list) => {
  const padded = ` ${text} `
  return list.some((p) => padded.includes(` ${p} `))
}

const numbered = (steps) => steps.map((s, i) => `${i + 1}. ${s}`).join(' ')

const CANNED = {
  greeting: ['¡Hola! Aquí estoy para lo que necesites.', '¡Hola! ¿Cómo va tu día?', '¡Qué gusto saludarte! Te escucho.'],
  thanks: ['¡De nada! Siempre estoy aquí.', 'Cuando quieras. Para eso estoy.', 'No hay de qué. Somos un equipo.'],
  farewell: ['¡Hasta pronto! Aquí estaré.', 'Nos vemos. ¡Cuídate mucho!'],
  casual: [
    'Soy Moon-C, tu compañera a bordo. Puedo explicarte tus signos o guiarte si algo pasa.',
    'Te escucho. Cuéntame lo que quieras.',
    'Cada día aquí es parte de algo grande. Me alegra estar en esta misión contigo.',
  ],
}
const pick = (list) => list[Math.floor(Math.random() * list.length)]

const TOPICS = ['Frecuencia cardiaca', 'Temperatura', 'Oxígeno (SpO2)', 'Sueño', 'Estado de ánimo']

export function classifyLocal(message) {
  const text = normalize(message)
  const groups = Object.entries(keywords.emergency).filter(([k]) => !k.startsWith('_'))
  for (const [name, node] of groups) {
    if (!node.fallback && contains(text, phrases(node))) return { category: 'emergency', protocol: name }
  }
  for (const [name, node] of groups) {
    if (node.fallback && contains(text, phrases(node))) return { category: 'emergency', protocol: name }
  }
  for (const [ind, node] of Object.entries(keywords.health.indicators)) {
    if (!ind.startsWith('_') && contains(text, phrases(node))) return { category: 'health', indicator: ind }
  }
  if (contains(text, phrases(keywords.health.symptoms))) return { category: 'health', symptom: true }
  if (contains(text, phrases(keywords.ambiguous))) return { category: 'ambiguous' }
  for (const [type, node] of Object.entries(keywords.small_talk)) {
    if (!type.startsWith('_') && contains(text, phrases(node))) return { category: 'small_talk', type }
  }
  return { category: 'fallback' }
}

export function askLocal({ message, crew }) {
  const intent = classifyLocal(message)
  const base = { category: intent.category, ai_used: false, language: 'es', suggestions: [], via: 'local' }

  if (intent.category === 'emergency') {
    const p = protocolView(intent.protocol)
    return {
      ...base,
      protocol: p,
      reply: `Esto puede ser una emergencia. Llama ahora a un compañero y al oficial médico a bordo. ${p.title}: ${numbered(p.steps)}`,
    }
  }
  if (intent.category === 'health') {
    if (intent.symptom) {
      const p = protocolView('feeling_unwell')
      return { ...base, protocol: p, reply: `${p.title}: ${numbered(p.steps)}` }
    }
    const spec = protocols.indicators[intent.indicator]
    return {
      ...base,
      indicator: intent.indicator,
      reply: `${indicatorName(intent.indicator)}: ${spec.explanation.es} Rango normal (valores de ejemplo): ${
        normalRange(intent.indicator).text
      }. Cómo medir: ${numbered(spec.how_to_measure.es)}`,
    }
  }
  if (intent.category === 'ambiguous') {
    return {
      ...base,
      reply: 'Quiero asegurarme de entenderte. ¿Te duele algo o sientes cansancio?',
      suggestions: ['Me duele algo', 'Siento cansancio', 'Estoy bien'],
    }
  }
  if (intent.category === 'small_talk') {
    const name = crew && intent.type === 'greeting' ? `, ${crew.name}` : ''
    return { ...base, reply: pick(CANNED[intent.type] ?? CANNED.casual).replace(/^¡Hola!/, `¡Hola${name}!`) }
  }
  return {
    ...base,
    reply:
      'No estoy segura de haberte entendido. Puedo explicarte un indicador de salud, ayudarte a registrar una medición o guiarte en un protocolo de emergencia. ¿Qué quieres hacer?',
    suggestions: TOPICS,
  }
}
