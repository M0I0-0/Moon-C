import { describe, expect, it } from 'vitest'
import { alertFromBackend, memberFromVitals, membersFromVitals, toFrontIndicator } from './vitals'
import { PROTOCOL_FOR_INDICATOR, classify, fromManual, INDICATORS, indicatorName } from '../data/manual'

const live = (value, history = [value]) => ({ value, unit: '', status: 'normal', history })

const VITALS = {
  crew_id: 'moises',
  name: 'Moisés',
  updated_at: '2026-11-15T02:00:00Z',
  scenario: 'high_temperature',
  overall_status: 'urgent',
  indicators: {
    heart_rate: live(104, [100, 104]),
    blood_pressure_systolic: live(122, [120, 122]),
    blood_pressure_diastolic: live(77, [76, 77]),
    spo2: live(97),
    respiratory_rate: live(22),
    body_temperature: live(38.4),
    radiation: live(28),
    sleep_hours: live(6.4),
    mood: live(4),
  },
}

describe('memberFromVitals', () => {
  it('produce la misma forma que la simulación local', () => {
    const m = memberFromVitals(VITALS)
    expect(m.values).toMatchObject({ heart_rate: 104, blood_pressure: 122, bp_diastolic: 77, body_temperature: 38.4 })
    expect(m.history.blood_pressure).toEqual([120, 122])
    expect(m.history.blood_pressure_diastolic).toBeUndefined()
    expect(m.emergency).toBe('high_temperature')
    expect(m.updatedAt).toBe(Date.parse('2026-11-15T02:00:00Z'))
    expect(Object.keys(membersFromVitals([VITALS]))).toEqual(['moises'])
  })

  it('cada indicador que muestra el front existe en el manual', () => {
    const m = memberFromVitals(VITALS)
    for (const indicator of INDICATORS) {
      expect(fromManual(indicator)).toBe(true)
      expect(m.values[indicator]).toBeTypeOf('number')
    }
  })
})

describe('alertFromBackend', () => {
  const base = { id: 'a1', crew_id: 'moises', created_at: '2026-11-15T02:00:00Z', acknowledged: false, resolved: false }

  it('alerta de signo vital', () => {
    const a = alertFromBackend({
      ...base,
      kind: 'vital',
      indicator: 'blood_pressure_systolic',
      value: 188,
      unit: 'mmHg',
      message: 'Alerta: Moisés, presión arterial (sistólica) 188 mmHg',
    })
    expect(a).toMatchObject({ kind: 'vital', crewId: 'moises', indicator: 'blood_pressure', value: 188, text: null })
    expect(a.message).toContain('188 mmHg')
  })

  it('alerta reportada en el chat: solo el nombre del protocolo', () => {
    const a = alertFromBackend({ ...base, kind: 'report', protocol: 'chest_pain', message: 'Alerta: Moisés reportó dolor de pecho' })
    expect(a).toMatchObject({ kind: 'report', indicator: null, text: 'Dolor de pecho' })
  })

  it('alerta de maniobra', () => {
    expect(alertFromBackend({ ...base, kind: 'maneuver', protocol: 'rcp', message: '' }).text).toBe('guía de RCP')
  })
})

describe('manual compartido', () => {
  it('la presión del front usa la sistólica del manual', () => {
    expect(toFrontIndicator('blood_pressure_systolic')).toBe('blood_pressure')
    expect(indicatorName('blood_pressure')).toBe('Presión arterial (sistólica)')
    expect(classify('blood_pressure', 188)).toBe('urgent')
    expect(classify('blood_pressure', 118)).toBe('normal')
    expect(classify('radiation', 75)).toBe('attention')
    expect(classify('respiratory_rate', 31)).toBe('urgent')
  })

  it('el protocolo de cada signo urgente sale del manual', () => {
    expect(PROTOCOL_FOR_INDICATOR.spo2).toBe('breathing_difficulty')
    expect(PROTOCOL_FOR_INDICATOR.blood_pressure).toBe('general_emergency')
    expect(PROTOCOL_FOR_INDICATOR.body_temperature).toBe('feeling_unwell')
  })
})

describe('escenarios de simulación', () => {
  it('el front usa los mismos escenarios que Backend/app/bracelets.py', async () => {
    const { EMERGENCY_TYPES } = await import('../hooks/useCrewSimulation')
    // Si cambia esta lista, actualiza también SCENARIOS en Backend/app/bracelets.py (y su test).
    expect(Object.keys(EMERGENCY_TYPES)).toEqual([
      'low_oxygen',
      'high_heart_rate',
      'high_temperature',
      'high_blood_pressure',
      'solar_storm',
    ])
  })
})
