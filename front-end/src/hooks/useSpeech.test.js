import { describe, expect, it } from 'vitest'
import { pickVoice } from './useSpeech'

const voice = (name, lang, localService) => ({ name, lang, localService })
const VOICES = [
  voice('Google español de Estados Unidos', 'es-US', false),
  voice('Microsoft Sabina - Spanish (Mexico)', 'es-MX', true),
  voice('Microsoft Helena - Spanish (Spain)', 'es-ES', true),
  voice('Google US English', 'en-US', false),
  voice('Microsoft Irina - Russian (Russia)', 'ru-RU', true),
  voice('Google Deutsch', 'de-DE', false),
]

describe('pickVoice: solo voces locales', () => {
  it('elige la voz local del idioma exacto', () => {
    expect(pickVoice(VOICES, 'es-MX').name).toBe('Microsoft Sabina - Spanish (Mexico)')
  })

  it('si no hay exacta, otra variante local del mismo idioma', () => {
    expect(pickVoice(VOICES, 'es-AR').name).toBe('Microsoft Sabina - Spanish (Mexico)')
  })

  it('nunca una voz de red: sin voz local devuelve null (la app muestra subtítulos)', () => {
    expect(pickVoice(VOICES, 'en-US')).toBeNull()
    expect(pickVoice([voice('Google español', 'es-MX', false)], 'es-MX')).toBeNull()
  })

  it('ru: voz local; de: solo hay voz de red, así que null (subtítulos)', () => {
    expect(pickVoice(VOICES, 'ru-RU').name).toBe('Microsoft Irina - Russian (Russia)')
    expect(pickVoice(VOICES, 'de-DE')).toBeNull()
  })
})
