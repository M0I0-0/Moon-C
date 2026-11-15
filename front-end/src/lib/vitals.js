// Convierte las respuestas del backend (/vitals y /alerts) a la forma que usan los componentes,
// la misma que produce la simulación local (hooks/useCrewSimulation.js).
import { MANUAL_KEY, protocolView } from '../data/manual'

const FRONT_KEY = Object.fromEntries(Object.entries(MANUAL_KEY).map(([front, manual]) => [manual, front]))
export const toFrontIndicator = (indicator) => FRONT_KEY[indicator] ?? indicator

const MANEUVER_LABEL = { rcp: 'RCP', torniquete: 'torniquete', atragantamiento: 'atragantamiento' }

/** Un tripulante de /vitals -> { values, history, emergency, updatedAt }. */
export function memberFromVitals(vitals) {
  const values = {}
  const history = {}
  for (const [indicator, live] of Object.entries(vitals.indicators)) {
    if (indicator === 'blood_pressure_diastolic') {
      values.bp_diastolic = live.value
      continue
    }
    const key = toFrontIndicator(indicator)
    values[key] = live.value
    history[key] = live.history
  }
  return { values, history, emergency: vitals.scenario, updatedAt: Date.parse(vitals.updated_at) }
}

export const membersFromVitals = (list) => Object.fromEntries(list.map((v) => [v.crew_id, memberFromVitals(v)]))

/** Una alerta de /alerts -> la forma de las alertas locales (más `message`, ya traducido por el backend). */
export function alertFromBackend(alert) {
  let text = null
  if (alert.kind === 'report') text = protocolView(alert.protocol, 'es')?.title.split(':')[0] ?? 'una emergencia'
  if (alert.kind === 'maneuver') text = `guía de ${MANEUVER_LABEL[alert.protocol] ?? alert.protocol}`
  return {
    id: alert.id,
    kind: alert.kind,
    crewId: alert.crew_id,
    indicator: alert.indicator ? toFrontIndicator(alert.indicator) : null,
    value: alert.value,
    unit: alert.unit,
    protocol: alert.protocol,
    text,
    message: alert.message,
    createdAt: Date.parse(alert.created_at),
    acknowledged: alert.acknowledged,
    resolved: alert.resolved,
  }
}
