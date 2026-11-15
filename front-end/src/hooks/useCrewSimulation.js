import { useCallback, useEffect, useReducer } from 'react'
import { CREW, LIVE_INDICATORS, UNIT, classify } from '../data/manual'

// Datos simulados: no hay pulseras reales, así que cada tripulante tiene una
// línea base y los signos vitales "en vivo" varían un poco cada pocos segundos.
const BASELINE = {
  moises: { heart_rate: 74, blood_pressure: 122, spo2: 98, respiratory_rate: 15, body_temperature: 36.6, radiation: 28, sleep_hours: 6.4, mood: 4 },
  ana: { heart_rate: 66, blood_pressure: 112, spo2: 97, respiratory_rate: 14, body_temperature: 36.5, radiation: 24, sleep_hours: 7.6, mood: 4 },
  kenji: { heart_rate: 62, blood_pressure: 118, spo2: 98, respiratory_rate: 13, body_temperature: 36.7, radiation: 31, sleep_hours: 7.2, mood: 5 },
  valentina: { heart_rate: 79, blood_pressure: 126, spo2: 97, respiratory_rate: 17, body_temperature: 36.9, radiation: 26, sleep_hours: 8.1, mood: 3 },
}

// Mismos escenarios (y claves) que Backend/app/bracelets.py. Nombres neutros: Moon-C no diagnostica.
export const EMERGENCY_TYPES = {
  low_oxygen: { label: 'Baja saturación de oxígeno', target: { spo2: 86, heart_rate: 118, respiratory_rate: 32 } },
  high_heart_rate: { label: 'Frecuencia cardiaca muy alta', target: { heart_rate: 138, blood_pressure: 150 } },
  high_temperature: { label: 'Temperatura alta', target: { body_temperature: 38.7, heart_rate: 104, respiratory_rate: 22 } },
  high_blood_pressure: { label: 'Presión arterial muy alta', target: { blood_pressure: 188, heart_rate: 96 } },
  solar_storm: { label: 'Tormenta solar (radiación)', target: { radiation: 180 } },
}

// Ruido por lectura, límites físicos y decimales de cada indicador en vivo.
const SIM = {
  heart_rate: { noise: 2.2, min: 35, max: 200, dp: 0 },
  blood_pressure: { noise: 2.5, min: 60, max: 230, dp: 0 },
  spo2: { noise: 0.6, min: 70, max: 100, dp: 0 },
  respiratory_rate: { noise: 0.8, min: 5, max: 45, dp: 0 },
  body_temperature: { noise: 0.06, min: 34, max: 42, dp: 1 },
  radiation: { noise: 2.5, min: 5, max: 400, dp: 0 },
}
const DAILY = { sleep_hours: { noise: 0.9, min: 3, max: 10, dp: 1 }, mood: { noise: 0.8, min: 1, max: 5, dp: 0 } }
const HISTORY = 40
const DAYS = 14
const TICK_MS = 2500

function jitter(cfg, current, target, pull) {
  const noise = (Math.random() - 0.5) * 2 * cfg.noise
  const v = Math.min(cfg.max, Math.max(cfg.min, current + (target - current) * pull + noise))
  const f = 10 ** cfg.dp
  return Math.round(v * f) / f
}

const step = (indicator, current, target) => jitter(SIM[indicator], current, target, 0.22)
const diastolic = (sys) => Math.round(sys * 0.63 + (Math.random() - 0.5) * 3)

function initialState() {
  const members = {}
  for (const c of CREW) {
    const base = BASELINE[c.crew_id] ?? BASELINE.kenji
    const history = {}
    const values = { ...base }
    for (const [ind, cfg] of Object.entries(DAILY)) {
      history[ind] = Array.from({ length: DAYS - 1 }, () => jitter(cfg, base[ind], base[ind], 1))
      history[ind].push(base[ind])
    }
    for (const ind of LIVE_INDICATORS) {
      let v = base[ind]
      history[ind] = []
      for (let i = 0; i < HISTORY; i++) {
        v = step(ind, v, base[ind])
        history[ind].push(v)
      }
      values[ind] = v
    }
    values.bp_diastolic = diastolic(values.blood_pressure)
    members[c.crew_id] = { values, history, emergency: null, updatedAt: Date.now() }
  }
  return { members, alerts: [] }
}

let alertSeq = 0
const newAlertId = () => `al-${Date.now()}-${++alertSeq}`

function reducer(state, action) {
  switch (action.type) {
    case 'tick': {
      const members = {}
      const alerts = [...state.alerts]
      for (const [id, m] of Object.entries(state.members)) {
        const base = BASELINE[id] ?? BASELINE.kenji
        const target = { ...base, ...(m.emergency ? EMERGENCY_TYPES[m.emergency].target : {}) }
        const values = { ...m.values }
        const history = { ...m.history }
        for (const ind of LIVE_INDICATORS) {
          values[ind] = step(ind, m.values[ind], target[ind])
          history[ind] = [...m.history[ind].slice(1 - HISTORY), values[ind]]
          const open = alerts.some((a) => a.crewId === id && a.indicator === ind && !a.resolved)
          if (!open && classify(ind, values[ind]) === 'urgent') {
            alerts.push({
              id: newAlertId(),
              kind: 'vital',
              crewId: id,
              indicator: ind,
              value: values[ind],
              unit: UNIT[ind],
              createdAt: Date.now(),
              acknowledged: false,
              resolved: false,
            })
          }
        }
        values.bp_diastolic = diastolic(values.blood_pressure)
        members[id] = { ...m, values, history, updatedAt: Date.now() }
      }
      return { members, alerts }
    }
    case 'emergency':
      return {
        ...state,
        members: {
          ...state.members,
          [action.crewId]: { ...state.members[action.crewId], emergency: action.kind },
        },
      }
    case 'report':
      return {
        ...state,
        alerts: [
          ...state.alerts,
          {
            id: newAlertId(),
            kind: 'report',
            crewId: action.crewId,
            text: action.text,
            createdAt: Date.now(),
            acknowledged: false,
            resolved: false,
          },
        ],
      }
    case 'ack':
      return {
        ...state,
        alerts: state.alerts.map((a) => (a.id === action.id ? { ...a, acknowledged: true } : a)),
      }
    case 'resolve': {
      const ids = action.crewId ? [action.crewId] : Object.keys(state.members)
      const members = { ...state.members }
      for (const id of ids) members[id] = { ...members[id], emergency: null }
      return {
        members,
        alerts: state.alerts.map((a) => (ids.includes(a.crewId) ? { ...a, resolved: true } : a)),
      }
    }
    default:
      return state
  }
}

export function useCrewSimulation() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)

  useEffect(() => {
    const t = setInterval(() => dispatch({ type: 'tick' }), TICK_MS)
    return () => clearInterval(t)
  }, [])

  const triggerEmergency = useCallback((crewId, kind) => dispatch({ type: 'emergency', crewId, kind }), [])
  const reportFromChat = useCallback((crewId, text) => dispatch({ type: 'report', crewId, text }), [])
  const acknowledge = useCallback((id) => dispatch({ type: 'ack', id }), [])
  const resolve = useCallback((crewId) => dispatch({ type: 'resolve', crewId }), [])

  const activeAlerts = state.alerts.filter((a) => !a.resolved)
  const inEmergency = (crewId) => activeAlerts.some((a) => a.crewId === crewId)

  return {
    members: state.members,
    alerts: state.alerts,
    activeAlerts,
    inEmergency,
    triggerEmergency,
    reportFromChat,
    acknowledge,
    resolve,
  }
}
