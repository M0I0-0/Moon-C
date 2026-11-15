import protocols from '@shared/protocols.json'
import keywords from '@shared/keywords.json'
import crewFile from '@shared/crew.json'

export { protocols, keywords }

// Indicadores que el manual del backend todavía no tiene. Rangos de ejemplo solo para la demo.
const EXTRA_INDICATORS = {
  blood_pressure: {
    name: { es: 'Presión arterial (sistólica)' },
    ranges: { normal: [{ min: 90, max: 129 }], urgent: [{ gte: 180 }, { lt: 80 }] },
    what_to_do: {
      attention: {
        es: ['Siéntate 5 minutos en calma y vuelve a medir.', 'Evita cafeína y esfuerzo antes de la siguiente lectura.'],
      },
      urgent: {
        es: ['Deja lo que estés haciendo y siéntate o recuéstate.', 'Avisa ahora al oficial médico a bordo.'],
      },
    },
  },
  respiratory_rate: {
    name: { es: 'Frecuencia respiratoria' },
    ranges: { normal: [{ min: 12, max: 20 }], urgent: [{ lt: 8 }, { gt: 30 }] },
    what_to_do: {
      attention: { es: ['Respira lento por la nariz durante un minuto y vuelve a medir.'] },
      urgent: { es: ['Revisa el nivel de oxígeno de la cabina.', 'Avisa ahora al oficial médico a bordo.'] },
    },
  },
  radiation: {
    name: { es: 'Radiación (dosímetro personal)' },
    ranges: { normal: [{ min: 0, max: 50 }], urgent: [{ gt: 100 }] },
    what_to_do: {
      attention: { es: ['Reduce el tiempo en módulos poco blindados.', 'Revisa la dosis acumulada al final del turno.'] },
      urgent: {
        es: ['Ve al refugio de tormenta o al módulo más blindado.', 'Avisa a la cuenta General y espera instrucciones.'],
      },
    },
  },
}

const indicatorInfo = (indicator) => protocols.indicators[indicator] ?? EXTRA_INDICATORS[indicator]
export const fromManual = (indicator) => Boolean(protocols.indicators[indicator])

export const INDICATORS = [
  'heart_rate',
  'blood_pressure',
  'spo2',
  'respiratory_rate',
  'body_temperature',
  'radiation',
  'sleep_hours',
  'mood',
]
export const LIVE_INDICATORS = ['heart_rate', 'blood_pressure', 'spo2', 'respiratory_rate', 'body_temperature', 'radiation']

export const SHORT_LABEL = {
  heart_rate: 'Pulso',
  blood_pressure: 'Presión',
  spo2: 'SpO₂',
  respiratory_rate: 'Respiración',
  radiation: 'Radiación',
  body_temperature: 'Temperatura',
  sleep_hours: 'Sueño',
  mood: 'Ánimo',
}

export const UNIT = {
  heart_rate: 'lpm',
  blood_pressure: 'mmHg',
  spo2: '%',
  respiratory_rate: 'rpm',
  radiation: 'µSv/h',
  body_temperature: '°C',
  sleep_hours: 'h',
  mood: '/5',
}

export const STATUS_LABEL = { normal: 'Normal', attention: 'Atención', urgent: 'Urgente' }

const ROLES = {
  flight_engineer: 'Ingeniería de vuelo',
  medical_officer: 'Oficial médica',
  commander: 'Comandante',
  mission_specialist: 'Especialista de misión',
}

export const CREW = crewFile.crew.map((c) => ({
  ...c,
  roleLabel: ROLES[c.role] ?? c.role,
  initials: c.name.slice(0, 2).toUpperCase(),
}))

export const crewById = (id) => CREW.find((c) => c.crew_id === id) ?? null

function bandMatches(band, v) {
  if (band.min != null && v < band.min) return false
  if (band.max != null && v > band.max) return false
  if (band.lt != null && !(v < band.lt)) return false
  if (band.lte != null && !(v <= band.lte)) return false
  if (band.gt != null && !(v > band.gt)) return false
  if (band.gte != null && !(v >= band.gte)) return false
  return true
}

/** Misma regla que Backend/app/evaluator.py: urgente > normal > atención. */
export function classify(indicator, value) {
  const r = indicatorInfo(indicator).ranges
  if (r.urgent.some((b) => bandMatches(b, value))) return 'urgent'
  if (r.normal.some((b) => bandMatches(b, value))) return 'normal'
  return 'attention'
}

export function normalRange(indicator) {
  const [band] = indicatorInfo(indicator).ranges.normal
  return { min: band.min, max: band.max, text: `${band.min}–${band.max} ${UNIT[indicator]}` }
}

export function indicatorName(indicator) {
  return indicatorInfo(indicator).name.es
}

export function whatToDo(indicator, status) {
  return indicatorInfo(indicator).what_to_do?.[status]?.es ?? []
}

export function protocolView(name, lang = 'es') {
  const p = protocols.protocols[name]
  if (!p) return null
  const t = (texts) => texts?.[lang] ?? texts?.es
  return { name, type: p.type, title: t(p.title), audience: t(p.audience), steps: t(p.steps), source: p.source }
}

export const PROTOCOL_FOR_INDICATOR = {
  heart_rate: 'general_emergency',
  blood_pressure: 'general_emergency',
  spo2: 'breathing_difficulty',
  respiratory_rate: 'breathing_difficulty',
  radiation: 'general_emergency',
  body_temperature: 'feeling_unwell',
  sleep_hours: 'feeling_unwell',
  mood: 'feeling_unwell',
}

export function worstStatus(statuses) {
  if (statuses.includes('urgent')) return 'urgent'
  if (statuses.includes('attention')) return 'attention'
  return 'normal'
}

/** Valor para mostrar; la presión se muestra como sistólica/diastólica. */
export function displayValue(indicator, values) {
  if (indicator === 'blood_pressure') return `${Math.round(values.blood_pressure)}/${Math.round(values.bp_diastolic)}`
  return formatValue(indicator, values[indicator])
}

export function formatValue(indicator, value) {
  if (indicator === 'body_temperature' || indicator === 'sleep_hours') return value.toFixed(1)
  return String(Math.round(value))
}
