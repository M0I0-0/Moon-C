import { describe, expect, it } from 'vitest'
import { alertReason, alertText, reportedText } from './alerts'

// Las alertas van en el idioma de la cuenta que las ve (las del backend ya traen su texto).
describe('alertas en el idioma de la cuenta', () => {
  it('alerta de signo vital (simulación local), igual que antes en español', () => {
    const a = { kind: 'vital', crewId: 'moises', indicator: 'spo2', value: 86, unit: '%' }
    expect(alertText(a, 'es')).toBe('Alerta: Moisés, SpO₂ 86 %')
    expect(alertText(a, 'en')).toBe('Alert: Moisés, SpO₂ 86 %')
    expect(alertReason(a, 'es')).toBe('SpO₂ en rango urgente')
    expect(alertReason(a, 'en')).toBe('SpO₂ in urgent range')
  })

  it('la unidad se muestra en el idioma de la cuenta', () => {
    const a = { kind: 'vital', crewId: 'ruben', indicator: 'heart_rate', value: 138, unit: 'lpm' }
    expect(alertText(a, 'es')).toBe('Alerta: Rubén, Pulso 138 lpm')
    expect(alertText(a, 'en')).toBe('Alert: Rubén, Pulse 138 bpm')
  })

  it('emergencia reportada en el chat', () => {
    const a = { kind: 'report', crewId: 'valentina', text: 'Dolor de pecho', protocol: 'chest_pain' }
    expect(alertText(a, 'es')).toBe('Alerta: Valentina reportó dolor de pecho')
    expect(alertText(a, 'en')).toBe('Alert: Valentina reported chest pain')
    expect(alertReason(a, 'en')).toBe('Reported by voice/text: chest pain')
    expect(reportedText('general_emergency', 'es')).toBe('una emergencia')
    expect(reportedText(undefined, 'en')).toBe('an emergency')
  })

  it('sin protocolo usa el texto que se guardó', () => {
    expect(alertText({ kind: 'report', crewId: 'ana', text: 'una emergencia' }, 'es')).toBe('Alerta: Ana reportó una emergencia')
  })

  it('el texto del backend se usa tal cual (ya viene en el idioma pedido)', () => {
    expect(alertText({ kind: 'vital', message: 'Alerta: Ana, temperatura corporal 39.6 °C' }, 'en')).toBe(
      'Alerta: Ana, temperatura corporal 39.6 °C',
    )
  })

  it('alerta de maniobra', () => {
    expect(alertReason({ kind: 'maneuver', protocol: 'rcp' }, 'es')).toBe('Se abrió la guía de RCP')
    expect(alertReason({ kind: 'maneuver', protocol: 'rcp' }, 'en')).toBe('CPR guide opened')
  })
})
