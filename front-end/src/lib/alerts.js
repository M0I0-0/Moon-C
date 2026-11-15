import { crewById, formatValue, protocolView, shortLabel, unitLabel } from '../data/manual'
import { tr } from './i18n'

// Las alertas van en el idioma de la cuenta que las ve. Las del backend ya traen su texto (se piden
// con ?language=); las de la simulación local (sin enlace) se arman aquí.

const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1)

/** Lo que se reportó en el chat: el título del protocolo sin el "cómo ayudar" ("dolor de pecho"). */
export function reportedText(protocolName, lang = 'es') {
  const title = protocolName && protocolName !== 'general_emergency' ? protocolView(protocolName, lang)?.title : null
  return title ? lowerFirst(title.split(':')[0]) : tr(lang, 'alertAnEmergency')
}

/** Nombre de la guía de una alerta de maniobra ("guía de RCP", "CPR guide"). */
export const maneuverGuideText = (maneuver, lang = 'es') => tr(lang, `maneuverGuide_${maneuver}`)

/** Texto de una alerta (banner y voz). */
export function alertText(a, lang = 'es') {
  if (a.message) return a.message
  const who = crewById(a.crewId)?.name ?? tr(lang, 'alertSomeone')
  if (a.kind === 'report') return tr(lang, 'alertReport', { who, what: a.protocol ? reportedText(a.protocol, lang) : a.text })
  const value = `${formatValue(a.indicator, a.value)} ${unitLabel(a.indicator, lang)}`
  return tr(lang, 'alertVital', { who, what: shortLabel(a.indicator, lang), value })
}

/** Motivo de una alerta en la vista de emergencia de la cuenta General. */
export function alertReason(a, lang = 'es') {
  if (a.kind === 'vital') return tr(lang, 'alertReasonVital', { label: shortLabel(a.indicator, lang) })
  if (a.kind === 'maneuver') return tr(lang, 'alertReasonManeuver', { guide: maneuverGuideText(a.protocol, lang) })
  return tr(lang, 'alertReasonReport', { what: a.protocol ? reportedText(a.protocol, lang) : a.text })
}
