import { SHORT_LABEL, crewById, formatValue } from '../data/manual'

export function alertText(a) {
  const crew = crewById(a.crewId)
  if (a.kind === 'report') return `Alerta: ${crew?.name ?? 'Tripulante'} reportó ${a.text.toLowerCase()}`
  return `Alerta: ${crew?.name ?? 'Tripulante'}, ${SHORT_LABEL[a.indicator]} ${formatValue(a.indicator, a.value)} ${a.unit}`
}
