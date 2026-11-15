// Detección de idioma por mensaje (es/en/ru/de), sin red. Espejo de Backend/app/language.py:
// solo se usa cuando no hay enlace con el backend; con enlace manda lo que responde el backend.
//
// CONTRATO (para replicar en Python; devuelve 'es' | 'en' | 'ru' | 'de' | None):
//  1. ru: sobre el texto CRUDO, letras = caracteres \p{L}; cirílicas = \p{Script=Cyrillic}.
//     Si letras > 0 y cirílicas/letras >= 0.5 -> 'ru' (no se mira nada más). Cubre también otras
//     lenguas cirílicas (ucraniano, etc.); no se detecta ruso transliterado.
//  2. es/en: texto normalizado = minúsculas, NFD sin diacríticos, sin apóstrofos, todo lo que no sea
//     letra/número -> espacio. Cada palabra que esté en ES suma a es; en EN suma a en (listas de abajo).
//  3. de: texto crudo (minúsculas, NFC, sin apóstrofos, separado por no-letras; conserva ä ö ü ß).
//     Cada palabra en DE suma a de. Si no está en DE y contiene ä, ö o ß suma 1 (pista); ü suma 1 solo
//     si la palabra no contiene 'güe'/'güi' (español: pingüino). Las palabras de DE no están en ES ni EN
//     (se excluyeron die, an, was, hand, arm, will, es...) para que no haya doble conteo.
//  4. Gana el idioma con más puntos; si el máximo es 0 o hay empate en el máximo -> null.
const ES = new Set(
  'hola buenas buenos dias tardes noches gracias porfa por favor el la los las un una unos unas de del que como cuando donde quien cual es soy eres estoy esta estas estan tengo tienes tiene siento sientes puedo puede quiero necesito ayuda ayudame mi mis tu tus su muy mas pero y o con sin para pq porque si yo nosotros estamos tenemos duele dolor respirar sangre sangrado desmayo desmayado cansado cansada hablo espanol ingles entiendo entiendes dime cuentame algo nada todo bien mal hoy ahora aqui adios chao queme cai caigo golpee cabeza tobillo rodilla raspe torci corte lastime pecho infarto ahogo ahogando asfixio matar sangra sangrando desmaye cortada herida quemadura mano brazo pierna'.split(' '),
)
const EN = new Set(
  'hi hello hey thanks thank you please the an is are am was were be been i im ive my mine your yours his her their we they it this that these those what when where who why how do does did dont doesnt didnt cant cannot can could would should will have has had feel feeling feels need help want to of for with without and or but not very more speak english spanish understand tell something nothing everything good bad today now here pain breathe breathing bleeding fainted tired sleep sleepy bye goodbye burned burnt hit head fell fall ankle knee twisted sprained cut hurt chest heart attack drowning kill myself die hand arm leg'.split(' '),
)

const DE = new Set(
  'der das dem den des ein eine einen einem einer und ich du er wir ihr nicht kein keine ist sind bin bist habe hast hat haben kann kannst können koennen muss brauche brauchen will bitte danke hallo guten gute tag morgen abend nacht gut schlecht schlechter mir mich dir dich mein meine meinen meinem fühle fuhle fuehle fühlen müde mude muede krank hilfe helfen schmerz schmerzen atem atmen atemnot luft bekomme brust herz herzinfarkt blut blutung blutet ohnmacht ohnmächtig kopf bein knie knöchel knoechel verbrannt verbrannte gefallen sturz gestürzt verletzt wie wo wann warum wer sehr aber oder auch noch jetzt heute hier nichts alles etwas sprechen spreche deutsch englisch spanisch verstehe verstehen sag sage mit von bei nach aus zu auf für fur fuer über uber ueber wenn dass ja nein schwindel schwindelig übel übelkeit uebelkeit tut weh wehtut mal bisschen ganz immer nur schon sehr ersticke ersticken sterben umbringen schlafen schlaf zittern angst panik'.split(' '),
)
// DE sin lo que ya está en ES o EN (las listas es/en no se tocan): evita doble conteo.
const DE_ONLY = new Set([...DE].filter((w) => !ES.has(w) && !EN.has(w)))

const normalize = (text) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’‘`´ʼ]/g, '')
    .replace(/[^\p{L}\p{N}\s]|_/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)

// Palabras del texto crudo (conserva ä ö ü ß), solo para la pista alemana.
const rawWords = (text) =>
  text
    .toLowerCase()
    .normalize('NFC')
    .replace(/['’‘`´ʼ]/g, '')
    .replace(/[^\p{L}\p{N}\s]|_/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)

const PRIORITY = ['es', 'en', 'ru', 'de']
/** ¿El idioma (es, en-US, ru-RU, de…) es de los 4 prioritarios? Gancho para avisar en la UI. */
export const isPriorityLanguage = (lang) =>
  typeof lang === 'string' && PRIORITY.includes(lang.toLowerCase().slice(0, 2))

/** 'es' | 'en' | 'ru' | 'de' si el texto es claramente de uno; null si hay empate o no hay señal. */
export function detectLanguage(text) {
  if (typeof text !== 'string') return null
  const letters = text.match(/\p{L}/gu)?.length ?? 0
  const cyrillic = text.match(/\p{Script=Cyrillic}/gu)?.length ?? 0
  if (letters > 0 && cyrillic / letters >= 0.5) return 'ru'

  const score = { es: 0, en: 0, de: 0 }
  for (const w of normalize(text)) {
    if (ES.has(w)) score.es++
    if (EN.has(w)) score.en++
  }
  for (const w of rawWords(text)) {
    if (DE_ONLY.has(w)) score.de++
    else if (/[äöß]/.test(w) || (/ü/.test(w) && !/güe|güi/.test(w))) score.de++
  }
  const top = Math.max(score.es, score.en, score.de)
  if (top === 0) return null
  const winners = Object.keys(score).filter((k) => score[k] === top)
  return winners.length === 1 ? winners[0] : null
}
