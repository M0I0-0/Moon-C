import protocols from '@shared/protocols.json'
import keywords from '@shared/keywords.json'
import crewFile from '@shared/crew.json'

export { protocols, keywords }

// Todos los indicadores salen del manual (shared/protocols.json). En el front la presión
// arterial se muestra como un solo indicador: su estado es el de la sistólica.
export const MANUAL_KEY = { blood_pressure: 'blood_pressure_systolic' }
export const toManualKey = (indicator) => MANUAL_KEY[indicator] ?? indicator

const indicatorInfo = (indicator) => protocols.indicators[toManualKey(indicator)]
export const fromManual = (indicator) => Boolean(indicatorInfo(indicator))

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

const SHORT_LABELS = {
  es: {
    heart_rate: 'Pulso',
    blood_pressure: 'Presión',
    spo2: 'SpO₂',
    respiratory_rate: 'Respiración',
    radiation: 'Radiación',
    body_temperature: 'Temperatura',
    sleep_hours: 'Sueño',
    mood: 'Ánimo',
  },
  en: {
    heart_rate: 'Pulse',
    blood_pressure: 'Pressure',
    spo2: 'SpO₂',
    respiratory_rate: 'Breathing',
    radiation: 'Radiation',
    body_temperature: 'Temperature',
    sleep_hours: 'Sleep',
    mood: 'Mood',
  },
}
export const shortLabel = (indicator, lang = 'es') => (SHORT_LABELS[lang] ?? SHORT_LABELS.es)[indicator]

// Unidad que se manda al backend (la acepta unit_aliases del manual) y la que se muestra en español.
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

const UNIT_EN = { heart_rate: 'bpm', respiratory_rate: 'br/min' }
/** Unidad para mostrar: lpm/rpm en español, bpm y br/min en inglés. */
export const unitLabel = (indicator, lang = 'es') => (lang === 'en' && UNIT_EN[indicator]) || UNIT[indicator]

const ROLES = {
  es: {
    flight_engineer: 'Ingeniería de vuelo',
    medical_officer: 'Oficial médica',
    commander: 'Comandante',
    mission_specialist: 'Especialista de misión',
  },
  en: {
    flight_engineer: 'Flight engineer',
    medical_officer: 'Medical officer',
    commander: 'Commander',
    mission_specialist: 'Mission specialist',
  },
}
export const roleLabel = (role, lang = 'es') => (ROLES[lang] ?? ROLES.es)[role] ?? role

export const CREW = crewFile.crew.map((c) => ({
  ...c,
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

export function normalRange(indicator, lang = 'es') {
  const [band] = indicatorInfo(indicator).ranges.normal
  return { min: band.min, max: band.max, text: `${band.min}–${band.max} ${unitLabel(indicator, lang)}` }
}

export function indicatorName(indicator, lang = 'es') {
  const name = indicatorInfo(indicator).name
  return name[lang] ?? name.es
}

export function whatToDo(indicator, status, lang = 'es') {
  const steps = indicatorInfo(indicator).what_to_do?.[status]
  return steps?.[lang] ?? steps?.es ?? []
}

export function protocolView(name, lang = 'es') {
  const p = protocols.protocols[name]
  if (!p) return null
  const t = (texts) => texts?.[String(lang).slice(0, 2)] ?? texts?.en ?? texts?.es
  return {
    name,
    type: p.type,
    title: t(p.title),
    intro: p.intro ? t(p.intro) : null,
    audience: t(p.audience),
    steps: t(p.steps),
    source: p.source,
  }
}

// Protocolo que se muestra cuando un indicador está en rango urgente (urgent_protocol del manual).
export const PROTOCOL_FOR_INDICATOR = Object.fromEntries(
  INDICATORS.map((indicator) => [indicator, indicatorInfo(indicator)?.urgent_protocol ?? 'general_emergency']),
)

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
