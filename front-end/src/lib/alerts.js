import { crewById, formatValue, indicatorName, manualUnit, protocolView, shortLabel } from '../data/manual'

// Las alertas sobre un tripulante van siempre en inglés: es el idioma común de la tripulación,
// sin importar el idioma de cada cuenta. Así también se piden al backend (GET /alerts) y así se leen
// en voz alta. Por eso estos textos no están en src/i18n/strings.js.
export const ALERT_LANGUAGE = 'en'

const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1)

/** Lo que se reportó en el chat, en inglés: el título del protocolo sin el "how to help" ("chest pain"). */
export function reportedText(protocolName) {
  const title = protocolName && protocolName !== 'general_emergency' ? protocolView(protocolName, ALERT_LANGUAGE)?.title : null
  return title ? lowerFirst(title.split(':')[0]) : 'an emergency'
}

/** Nombre corto de la guía de una alerta de maniobra ("CPR guide"). */
const MANEUVER_GUIDE = { rcp: 'CPR guide', torniquete: 'tourniquet guide', atragantamiento: 'choking guide' }
export const maneuverGuideText = (maneuver) => MANEUVER_GUIDE[maneuver] ?? `${maneuver} guide`

/** Texto de una alerta (banner y voz). */
export function alertText(a) {
  if (a.message) return a.message // del backend: ya viene en inglés
  const who = crewById(a.crewId)?.name ?? 'Crew member'
  if (a.kind === 'report') return `Alert: ${who} reported ${a.text}`
  const value = `${formatValue(a.indicator, a.value)} ${a.unit ?? manualUnit(a.indicator)}`
  return `Alert: ${who}, ${lowerFirst(indicatorName(a.indicator, ALERT_LANGUAGE))} ${value}`
}

/** Motivo de una alerta en la vista de emergencia de la cuenta General. */
export function alertReason(a) {
  if (a.kind === 'vital') return `${shortLabel(a.indicator, ALERT_LANGUAGE)} in urgent range`
  if (a.kind === 'maneuver') return `${a.text} opened`
  return `Reported by voice/text: ${a.text}`
}
