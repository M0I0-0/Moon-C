import { describe, expect, it } from 'vitest'
import cases from '@shared/router_cases.json'
import { askLocal, detectEmergency, normalize } from './assistant'

describe('detectEmergency (sin enlace) coincide con el router del backend', () => {
  it.each(cases.emergency)('"$text" -> $protocol', ({ text, protocol }) => {
    expect(detectEmergency(text)).toBe(protocol)
  })

  it.each(cases.not_emergency)('"%s" no es emergencia', (text) => {
    expect(detectEmergency(text)).toBeNull()
  })
})

describe('askLocal', () => {
  it('responde la emergencia con el protocolo del manual en el idioma del tripulante', () => {
    const en = askLocal({ message: 'chest pain', language: 'en' })
    expect(en).toMatchObject({ category: 'emergency', language: 'en', ai_used: false, via: 'local' })
    expect(en.protocol.title).toBe('Chest pain: how to help')
    expect(en.reply.startsWith('This may be an emergency.')).toBe(true)

    const es = askLocal({ message: 'me duele el pecho', language: 'es' })
    expect(es.protocol.title).toBe('Dolor de pecho: cómo ayudar')
    expect(es.protocol.steps.length).toBeGreaterThan(3)
  })

  it.each(['es', 'en'])('sin emergencia avisa que no hay enlace (%s) y sugiere frases que sí son emergencias', (language) => {
    const res = askLocal({ message: 'hola, ¿qué tal?', language })
    expect(res.category).toBe('fallback')
    expect(res.language).toBe(language)
    expect(res.suggestions.length).toBe(4)
    for (const s of res.suggestions) expect(detectEmergency(s)).not.toBeNull()
  })

  it('un idioma desconocido cae a español', () => {
    expect(askLocal({ message: 'hola', language: 'fr' }).language).toBe('es')
  })
})

it('normalize quita acentos, apóstrofos y puntuación', () => {
  expect(normalize("¡No puedo RESPIRAR! Can't breathe… SpO₂?")).toBe('no puedo respirar cant breathe spo2')
})
