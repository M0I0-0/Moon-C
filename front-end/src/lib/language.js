// Detección de idioma por mensaje (es/en), sin red. Espejo de Backend/app/language.py:
// solo se usa cuando no hay enlace con el backend; con enlace manda lo que responde el backend.
const ES = new Set(
  'hola buenas buenos dias tardes noches gracias porfa por favor el la los las un una unos unas de del que como cuando donde quien cual es soy eres estoy esta estas estan tengo tienes tiene siento sientes puedo puede quiero necesito ayuda ayudame mi mis tu tus su muy mas pero y o con sin para pq porque si yo nosotros estamos tenemos duele dolor respirar sangre sangrado desmayo desmayado cansado cansada hablo espanol ingles entiendo entiendes dime cuentame algo nada todo bien mal hoy ahora aqui adios chao queme cai caigo golpee cabeza tobillo rodilla raspe torci corte lastime pecho infarto ahogo ahogando asfixio matar sangra sangrando desmaye cortada herida quemadura mano brazo pierna'.split(' '),
)
const EN = new Set(
  'hi hello hey thanks thank you please the an is are am was were be been i im ive my mine your yours his her their we they it this that these those what when where who why how do does did dont doesnt didnt cant cannot can could would should will have has had feel feeling feels need help want to of for with without and or but not very more speak english spanish understand tell something nothing everything good bad today now here pain breathe breathing bleeding fainted tired sleep sleepy bye goodbye burned burnt hit head fell fall ankle knee twisted sprained cut hurt chest heart attack drowning kill myself die hand arm leg'.split(' '),
)

const normalize = (text) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’‘`´ʼ]/g, '')
    .replace(/[^\p{L}\p{N}\s]|_/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)

/** 'es' | 'en' si el texto es claramente de uno; null si hay empate o no hay señal. */
export function detectLanguage(text) {
  let es = 0
  let en = 0
  for (const w of normalize(text)) {
    if (ES.has(w)) es++
    if (EN.has(w)) en++
  }
  if (es === en) return null
  return es > en ? 'es' : 'en'
}
