import { describe, expect, it } from 'vitest'
import { ALERT_LANGUAGE, alertReason, alertText, reportedText } from './alerts'

// Las alertas sobre un tripulante van siempre en inglés, sea cual sea el idioma de la pantalla.
describe('alertas en inglés', () => {
  it('el idioma de las alertas es inglés', () => {
    expect(ALERT_LANGUAGE).toBe('en')
  })

  it('alerta de signo vital (simulación local)', () => {
    const a = { kind: 'vital', crewId: 'moises', indicator: 'spo2', value: 86, unit: '%' }
    expect(alertText(a)).toBe('Alert: Moisés, oxygen saturation (SpO2) 86 %')
    expect(alertReason(a)).toBe('SpO₂ in urgent range')
  })

  it('la unidad del manual cuando la alerta no trae una', () => {
    expect(alertText({ kind: 'vital', crewId: 'ruben', indicator: 'heart_rate', value: 138 })).toBe(
      'Alert: Rubén, heart rate 138 bpm',
    )
  })

  it('emergencia reportada en el chat de un tripulante que habla español', () => {
    const a = { kind: 'report', crewId: 'valentina', text: reportedText('chest_pain') }
    expect(alertText(a)).toBe('Alert: Valentina reported chest pain')
    expect(alertReason(a)).toBe('Reported by voice/text: chest pain')
    expect(reportedText('emotional_crisis')).toBe('emotional crisis')
    expect(reportedText('general_emergency')).toBe('an emergency')
    expect(reportedText(undefined)).toBe('an emergency')
  })

  it('el texto del backend se usa tal cual (ya viene en inglés)', () => {
    expect(alertText({ kind: 'vital', message: 'Alert: Ana, body temperature 39.6 °C' })).toBe(
      'Alert: Ana, body temperature 39.6 °C',
    )
  })

  it('alerta de maniobra', () => {
    expect(alertReason({ kind: 'maneuver', text: 'CPR guide' })).toBe('CPR guide opened')
  })
})
