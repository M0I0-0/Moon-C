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
// y las mismas reglas que Backend/app/intent.py (frases claras, frases débiles y raíces,
// negaciones y dolor sin frase exacta). Todo lo demás espera al enlace.
// Idiomas: es, en, ru, de (los mismos que el backend).

// Plegado idéntico al de Backend/app/intent.py: minúsculas (la ß alemana -> ss, como casefold de Python), NFKD y
// sin marcas combinadas. Efecto: ä ö ü -> a o u; en ruso solo cambian ё -> е y й -> и. Las palabras clave pasan por
// la misma función, así que se pueden escribir con acentos o sin ellos.
const fold = (text) =>
  text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’‘`´ʼ]/g, '')

export function normalize(text) {
  return fold(text)
    .replace(/[^\p{L}\p{N}\s]|_/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const phrases = (node) =>
  Object.entries(node ?? {})
    .filter(([k, v]) => !k.startsWith('_') && Array.isArray(v))
    .flatMap(([, v]) => v.map(normalize))
    .filter(Boolean)

const nodes = Object.entries(keywords.emergency).filter(([name]) => !name.startsWith('_'))
const NOT_NEGATABLE = new Set(nodes.filter(([, node]) => node.negatable === false).map(([name]) => name))
const rows = (list, pick) => list.flatMap(([name, node]) => phrases(pick(node)).map((kw) => [name, kw]))
const STRONG = rows(
  nodes.filter(([, node]) => !node.fallback),
  (node) => node,
)
// La emergencia general ("fallback") solo aplica si no hay una específica.
const GENERAL = rows(
  nodes.filter(([, node]) => node.fallback),
  (node) => node,
)
const WEAK = rows(nodes, (node) => node.weak)
const STEMS = rows(nodes, (node) => node.stems)

const NEGATORS = new Set(phrases(keywords.negation.negators))
const FILLERS = new Set(phrases(keywords.negation.fillers))
const EXEMPT = new Set([...NEGATORS, ...phrases(keywords.negation.exempt)])
const PAIN = Object.entries(keywords.pain_question)
  .filter(([name]) => !name.startsWith('_'))
  .map(([name, cfg]) => ({
    name,
    where: phrases(cfg.where),
    feel: phrases(cfg.feel),
    feelWords: new Set(phrases(cfg.feel_words)),
  }))
const SAFETY_HELP = phrases(keywords.safety_help)
const SAFETY_PROTOCOL = keywords.safety_help.protocol ?? 'general_emergency'
// Un número de emergencia solo ("112", "911") es una emergencia general; dentro de una frase ("mi pulso es 112") no.
const EXACT = new Set(phrases(keywords.emergency_exact))
const EXACT_PROTOCOL = keywords.emergency_exact?.protocol ?? 'general_emergency'
const YES = new Set(phrases(keywords.followup.yes))
const NO = new Set(phrases(keywords.followup.no))
// "no sé", "не знaю", "weiß nicht": al inicio de una respuesta no es un "no".
const UNSURE = phrases(keywords.followup.unsure).map((p) => p.split(' '))
const HEAVY = phrases(keywords.followup.heavy)
const LIGHT = phrases(keywords.followup.light)
// Salud y apoyo: un mensaje así es un tema nuevo, no la respuesta a una pregunta (igual que el backend).
const OTHER_TOPICS = [
  ...phrases(keywords.health.symptoms),
  ...Object.entries(keywords.health.indicators)
    .filter(([k]) => !k.startsWith('_'))
    .flatMap(([, v]) => phrases(v)),
  ...Object.entries(keywords.support)
    .filter(([k]) => !k.startsWith('_'))
    .flatMap(([, v]) => phrases(v)),
]

const BREAK = 'xbreakx'

/** Igual que tokenize() del backend: palabras normalizadas y, por palabra, si una coma/punto va justo antes. */
export function tokenize(message) {
  const text = fold(message)
    .replace(/[,;.:!?¿¡()…\n\r]|\s[-–—]\s/g, ` ${BREAK} `)
    .replace(/[^\p{L}\p{N}\s]|_/gu, ' ')
  const tokens = []
  const breaks = []
  let pending = false
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (word === BREAK) {
      pending = true
      continue
    }
    tokens.push(word)
    breaks.push(pending)
    pending = false
  }
  return { tokens, breaks }
}

/** Un negador a 3 palabras como máximo, solo con palabras de relleno entre medias y sin puntuación. */
function negatedBefore(tokens, breaks, start) {
  let j = start
  for (let step = 0; step < 3; step++) {
    if (j === 0 || breaks[j]) return false
    j -= 1
    if (NEGATORS.has(tokens[j])) return true
    if (!FILLERS.has(tokens[j])) return false
  }
  return false
}

function findPhrase(tokens, words) {
  const found = []
  for (let i = 0; i + words.length <= tokens.length; i++) {
    if (words.every((w, k) => tokens[i + k] === w)) found.push(i)
  }
  return found
}

const byPosition = (a, b) => a[0] - b[0] || a[1] - b[1]

/** ['direct'|'safety'|'negated', protocolo] o null. Misma regla que KeywordRouter._scan_emergency. */
function scanEmergencyTokens(tokens, breaks) {
  const covered = new Set() // palabras dentro de una frase: una raíz no las relee ("no me da un infarto")
  const hits = (table, stem = false) => {
    const plain = []
    const negated = []
    for (const [protocol, kw] of table) {
      const words = kw.split(' ')
      let starts
      if (stem) {
        starts = tokens.flatMap((t, i) => (t.startsWith(kw) && !covered.has(i) ? [i] : []))
      } else {
        starts = findPhrase(tokens, words)
        for (const i of starts) for (let k = 0; k < words.length; k++) covered.add(i + k)
      }
      for (const i of starts) {
        const isNeg =
          !NOT_NEGATABLE.has(protocol) && !words.some((w) => EXEMPT.has(w)) && negatedBefore(tokens, breaks, i)
        const entry = [i, -kw.length, protocol]
        if (isNeg) negated.push(entry)
        else plain.push(entry)
      }
    }
    return [plain.sort(byPosition), negated.sort(byPosition)]
  }
  const [strong, strongNeg] = hits(STRONG)
  if (strong.length) return ['direct', strong[0][2]]
  const [general, generalNeg] = hits(GENERAL)
  if (general.length) return ['direct', general[0][2]]
  const [weak, weakNeg] = hits(WEAK)
  const [stem, stemNeg] = hits(STEMS, true)
  const soft = [...weak, ...stem].sort(byPosition)
  if (soft.length) return ['safety', soft[0][2]]
  const negated = [...strongNeg, ...generalNeg, ...weakNeg, ...stemNeg].sort(byPosition)
  if (negated.length) return ['negated', negated[0][2]]
  return null
}

/** Dolor de pecho o respiración sin la frase exacta. Misma regla que KeywordRouter._scan_pain. */
function scanPain(tokens, breaks) {
  for (const { name, where, feel, feelWords } of PAIN) {
    const whereAt = new Set(tokens.flatMap((t, i) => (where.some((w) => t.startsWith(w)) ? [i] : [])))
    const feelAt = tokens.flatMap((t, i) =>
      !whereAt.has(i) && (feelWords.has(t) || feel.some((f) => t.startsWith(f))) ? [i] : [],
    )
    if (whereAt.size && feelAt.length) {
      return [feelAt.every((i) => negatedBefore(tokens, breaks, i)) ? 'negated' : 'pain', name]
    }
  }
  return null
}

/**
 * Qué hace el mensaje ante una emergencia, igual que el backend:
 * { kind: 'direct' | 'safety' | 'negated' | 'pain', protocol } o null.
 * Solo 'direct' abre el protocolo; los demás piden confirmación antes.
 */
export function scanEmergency(message) {
  const { tokens, breaks } = tokenize(message)
  if (!tokens.length) return null
  if (tokens.length === 1 && EXACT.has(tokens[0])) return { kind: 'direct', protocol: EXACT_PROTOCOL }
  const scan = scanEmergencyTokens(tokens, breaks)
  if (scan) return { kind: scan[0], protocol: scan[1] }
  const padded = ` ${tokens.join(' ')} `
  if (tokens.length <= 4 && SAFETY_HELP.some((kw) => padded.includes(` ${kw} `))) {
    return { kind: 'safety', protocol: SAFETY_PROTOCOL }
  }
  const pain = scanPain(tokens, breaks)
  return pain ? { kind: pain[0], protocol: pain[1] } : null
}

/** Nombre del protocolo de emergencia que se abre directamente con el mensaje, o null. */
export function detectEmergency(message) {
  const scan = scanEmergency(message)
  return scan?.kind === 'direct' ? scan.protocol : null
}

/** Respuesta a una pregunta de Moon-C: 'yes' | 'no' | null. Igual que KeywordRouter.answer. */
export function answer(message, graded = true) {
  const { tokens, breaks } = tokenize(message)
  if (!tokens.length) return null
  if (graded) {
    for (let i = 0; i < tokens.length; i++) {
      if (HEAVY.some((stem) => tokens[i].startsWith(stem))) return negatedBefore(tokens, breaks, i) ? 'no' : 'yes'
    }
    if (tokens.some((t) => LIGHT.some((stem) => t.startsWith(stem)))) return 'no'
  }
  if (YES.has(tokens[0])) return 'yes'
  if (NO.has(tokens[0]) && !UNSURE.some((u) => u.every((w, k) => tokens[k] === w))) return 'no'
  return null
}

const OFFLINE = {
  es: {
    intro: 'Esto puede ser una emergencia. Llama ahora a un compañero y al oficial médico a bordo.',
    reply:
      'Ahora no tengo enlace con mi sistema, así que solo puedo ayudarte con emergencias. Si es una, dime qué pasa: dolor de pecho, no puede respirar, desmayo o sangrado.',
    suggestions: ['Dolor de pecho', 'No puede respirar', 'Se desmayó', 'Sangrado'],
    // Mismos textos y botones que Backend/app/chat.py. supuesto: validar con experto médico
    questions: {
      safety: 'Quiero asegurarme de que estás bien. ¿Estás en peligro o necesitas ayuda ahora?',
      negated: 'Entendido. ¿Seguro que todo está bien?',
      pain_chest_pain: '¿Es un dolor fuerte u opresión?',
      pain_breathing_difficulty: '¿Te falta el aire o respiras con mucha dificultad?',
    },
    buttons: {
      safety: ['Sí, necesito ayuda', 'No, estoy bien'],
      negated: ['Sí, todo bien', 'No, sí ocurre'],
      pain_chest_pain: ['Sí, es fuerte', 'No, es leve'],
      pain_breathing_difficulty: ['Sí, me falta el aire', 'No, es leve'],
    },
    retry: 'Quiero estar segura. ',
    reassure: {
      safety: 'Me alegra. Sigo aquí: si algo cambia, dímelo.',
      negated: 'Qué bueno. Si algo cambia, dímelo y te guío al momento.',
      pain: 'Entendido. Si aumenta o se vuelve opresión, dímelo y te guío. El oficial médico a bordo también puede revisarte.',
    },
  },
  en: {
    intro: 'This may be an emergency. Call a crewmate and the on-board medical officer now.',
    reply:
      "I can't reach my system right now, so I can only help with emergencies. If this is one, tell me what's happening: chest pain, can't breathe, fainting or bleeding.",
    suggestions: ['Chest pain', "Can't breathe", 'Passed out', 'Bleeding'],
    questions: {
      safety: "I want to make sure you're okay. Are you in danger or do you need help right now?",
      negated: 'Understood. Are you sure everything is okay?',
      pain_chest_pain: 'Is it a strong pain or pressure?',
      pain_breathing_difficulty: 'Are you short of breath or breathing with a lot of difficulty?',
    },
    buttons: {
      safety: ['Yes, I need help', "No, I'm okay"],
      negated: ['Yes, all good', 'No, it is happening'],
      pain_chest_pain: ["Yes, it's strong", "No, it's mild"],
      pain_breathing_difficulty: ["Yes, I'm short of breath", "No, it's mild"],
    },
    retry: 'I want to be sure. ',
    reassure: {
      safety: "I'm glad. I'm still here: if anything changes, tell me.",
      negated: "Good to hear. If anything changes, tell me and I'll guide you right away.",
      pain: "Understood. If it gets stronger or turns into pressure, tell me and I'll guide you. The on-board medical officer can also check you.",
    },
  },
  // supuesto: traducción por validar con traductor médico (mismos textos que Backend/app/chat.py)
  ru: {
    intro: 'Это может быть экстренная ситуация. Сейчас же позови члена экипажа и бортового медицинского офицера.',
    reply:
      'Сейчас у меня нет связи с системой, поэтому я могу помочь только в экстренных ситуациях. Если это она, скажи, что происходит: боль в груди, не могу дышать, потеря сознания или кровотечение.',
    suggestions: ['Боль в груди', 'Не могу дышать', 'Потерял сознание', 'Кровотечение'],
    questions: {
      safety: 'Хочу убедиться, что с тобой всё в порядке. Ты в опасности или тебе нужна помощь прямо сейчас?',
      negated: 'Поняла. Всё точно в порядке?',
      pain_chest_pain: 'Это сильная боль или давление?',
      pain_breathing_difficulty: 'Тебе не хватает воздуха или дышать очень трудно?',
    },
    buttons: {
      safety: ['Да, мне нужна помощь', 'Нет, я в порядке'],
      negated: ['Да, всё хорошо', 'Нет, это происходит'],
      pain_chest_pain: ['Да, сильная', 'Нет, слабая'],
      pain_breathing_difficulty: ['Да, не хватает воздуха', 'Нет, слабо'],
    },
    retry: 'Хочу быть уверена. ',
    reassure: {
      safety: 'Рада слышать. Я рядом: если что-то изменится, скажи.',
      negated: 'Хорошо. Если что-то изменится, скажи, и я сразу помогу.',
      pain: 'Поняла. Если боль усилится или появится давление, скажи, и я помогу. Бортовой медицинский офицер тоже может тебя осмотреть.',
    },
  },
  de: {
    intro: 'Das könnte ein Notfall sein. Ruf jetzt sofort einen Kameraden und den medizinischen Offizier an Bord.',
    reply:
      'Ich habe gerade keine Verbindung zu meinem System und kann deshalb nur bei Notfällen helfen. Wenn es einer ist, sag mir, was passiert: Brustschmerzen, kann nicht atmen, Ohnmacht oder Blutung.',
    suggestions: ['Brustschmerzen', 'Ich kann nicht atmen', 'Bewusstlos', 'Blutung'],
    questions: {
      safety: 'Ich möchte sichergehen, dass es dir gut geht. Bist du in Gefahr oder brauchst du jetzt Hilfe?',
      negated: 'Verstanden. Bist du sicher, dass alles in Ordnung ist?',
      pain_chest_pain: 'Ist es ein starker Schmerz oder Druck?',
      pain_breathing_difficulty: 'Bekommst du schlecht Luft oder atmest du sehr mühsam?',
    },
    buttons: {
      safety: ['Ja, ich brauche Hilfe', 'Nein, mir geht es gut'],
      negated: ['Ja, alles gut', 'Nein, es passiert'],
      pain_chest_pain: ['Ja, es ist stark', 'Nein, es ist leicht'],
      pain_breathing_difficulty: ['Ja, ich bekomme keine Luft', 'Nein, es ist leicht'],
    },
    retry: 'Ich möchte sichergehen. ',
    reassure: {
      safety: 'Das freut mich. Ich bin weiter da: Wenn sich etwas ändert, sag es mir.',
      negated: 'Gut zu hören. Wenn sich etwas ändert, sag es mir, dann helfe ich sofort.',
      pain: 'Verstanden. Wenn es stärker wird oder zu Druck wird, sag es mir, dann führe ich dich. Der medizinische Offizier an Bord kann dich auch untersuchen.',
    },
  },
}

const PENDING_TTL_MS = 120_000
// Pregunta de seguridad pendiente (solo sin enlace; con enlace la guarda la sesión del backend).
let pending = null

/** Olvida la pregunta pendiente (al cambiar de tripulante o reiniciar la conversación). */
export function resetLocal() {
  pending = null
}

const numbered = (steps) => steps.map((s, i) => `${i + 1}. ${s}`).join(' ')

export function askLocal({ message, language = 'es', now = Date.now() }) {
  const lang = OFFLINE[language] ? language : 'es'
  const t = OFFLINE[lang]
  const base = { ai_used: false, language: lang, suggestions: [], via: 'local' }
  const emergency = (name) => {
    const p = protocolView(name, lang)
    // La crisis emocional trae su propia introducción en el manual; las demás usan la genérica.
    return { ...base, category: 'emergency', protocol: p, reply: `${p.intro ?? t.intro} ${p.title}: ${numbered(p.steps)}` }
  }
  const ask = (kind, protocol, tries = 0, prefix = '') => {
    pending = { kind, protocol, tries, expires: now + PENDING_TTL_MS }
    return { ...base, category: 'ambiguous', reply: prefix + t.questions[kind], suggestions: t.buttons[kind] }
  }

  const scan = scanEmergency(message)
  const previous = pending && now < pending.expires ? pending : null
  pending = null
  if (scan?.kind === 'direct') return emergency(scan.protocol)

  if (previous) {
    const text = normalize(message)
    const otherTopic = OTHER_TOPICS.some((kw) => ` ${text} `.includes(` ${kw} `))
    const reply = otherTopic ? null : answer(message, previous.kind.startsWith('pain'))
    if (reply) {
      // "negated": la pregunta es "¿seguro que todo está bien?", así que "no" es la respuesta que alarma.
      const alarming = previous.kind === 'negated' ? reply === 'no' : reply === 'yes'
      if (alarming) return emergency(previous.protocol)
      return { ...base, category: 'ambiguous', reply: t.reassure[previous.kind.split('_')[0]] }
    }
    if (!otherTopic && !scan && previous.tries < 1 && tokenize(message).tokens.length <= 3) {
      return ask(previous.kind, previous.protocol, previous.tries + 1, t.retry)
    }
  }

  if (scan) return ask(scan.kind === 'pain' ? `pain_${scan.protocol}` : scan.kind, scan.protocol)
  return { ...base, category: 'fallback', reply: t.reply, suggestions: t.suggestions }
}
