import { api } from './api'
import { keywords, protocolView } from '../data/manual'

export async function checkBackend() {
  try {
    return await api.status()
  } catch {
    return null
  }
}

export async function askBackend({ message, crewId, sessionId, language }) {
  return { ...(await api.chat({ message, crewId, sessionId, language })), via: 'backend' }
}

// ---------------------------------------------------------------------------
// Sin enlace con el backend, Moon-C solo atiende emergencias: usa las mismas
// palabras clave (shared/keywords.json), el mismo manual (shared/protocols.json)
// y la misma regla que Backend/app/intent.py. Todo lo demás espera al enlace.

export function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
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

// [protocolo, frase]. La emergencia general ("fallback") solo aplica si no hay una específica.
const EMERGENCY = []
const EMERGENCY_FALLBACK = []
for (const [name, node] of Object.entries(keywords.emergency)) {
  if (name.startsWith('_')) continue
  for (const phrase of phrases(node)) (node.fallback ? EMERGENCY_FALLBACK : EMERGENCY).push([name, phrase])
}

/** Igual que KeywordRouter._best: gana la coincidencia más temprana y, en empate, la frase más larga. */
function best(text, table) {
  const padded = ` ${text} `
  let found = null
  for (const [group, phrase] of table) {
    const pos = padded.indexOf(` ${phrase} `)
    if (pos < 0) continue
    if (!found || pos < found.pos || (pos === found.pos && phrase.length > found.phrase.length)) {
      found = { group, phrase, pos }
    }
  }
  return found
}

/** Nombre del protocolo de emergencia que corresponde al mensaje, o null. */
export function detectEmergency(message) {
  const text = normalize(message)
  if (!text) return null
  return (best(text, EMERGENCY) ?? best(text, EMERGENCY_FALLBACK))?.group ?? null
}

const OFFLINE = {
  es: {
    intro: 'Esto puede ser una emergencia. Llama ahora a un compañero y al oficial médico a bordo.',
    reply:
      'Ahora no tengo enlace con mi sistema, así que solo puedo ayudarte con emergencias. Si es una, dime qué pasa: dolor de pecho, no puede respirar, desmayo o sangrado.',
    suggestions: ['Dolor de pecho', 'No puede respirar', 'Se desmayó', 'Sangrado'],
  },
  en: {
    intro: 'This may be an emergency. Call a crewmate and the on-board medical officer now.',
    reply:
      "I can't reach my system right now, so I can only help with emergencies. If this is one, tell me what's happening: chest pain, can't breathe, fainting or bleeding.",
    suggestions: ['Chest pain', "Can't breathe", 'Passed out', 'Bleeding'],
  },
}

const numbered = (steps) => steps.map((s, i) => `${i + 1}. ${s}`).join(' ')

export function askLocal({ message, language = 'es' }) {
  const lang = OFFLINE[language] ? language : 'es'
  const t = OFFLINE[lang]
  const base = { ai_used: false, language: lang, suggestions: [], via: 'local' }
  const protocol = detectEmergency(message)
  if (protocol) {
    const p = protocolView(protocol, lang)
    // La crisis emocional trae su propia introducción en el manual; las demás usan la genérica.
    return { ...base, category: 'emergency', protocol: p, reply: `${p.intro ?? t.intro} ${p.title}: ${numbered(p.steps)}` }
  }
  return { ...base, category: 'fallback', reply: t.reply, suggestions: t.suggestions }
}
