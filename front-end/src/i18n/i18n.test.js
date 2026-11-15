import { describe, expect, it } from 'vitest'
import { STRINGS } from './strings'
import { LANGUAGES, formatTime, makeI18n, toLanguage, translate } from '.'
import { EMERGENCY_TYPES } from '../hooks/useCrewSimulation'
import { MANEUVER_LIST } from '../lib/maneuvers'
import { detectLanguage } from '../lib/assistant'

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('textos de la interfaz', () => {
  it('cada clave existe en español e inglés, con los mismos {datos}', () => {
    expect(Object.keys(STRINGS).sort()).toEqual([...LANGUAGES].sort())
    expect(Object.keys(STRINGS.en).sort()).toEqual(Object.keys(STRINGS.es).sort())
    for (const key of Object.keys(STRINGS.es)) {
      expect(placeholders(STRINGS.en[key]), key).toEqual(placeholders(STRINGS.es[key]))
      expect(STRINGS.en[key].trim(), key).not.toBe('')
    }
  })

  it('ningún texto quedó en el otro idioma', () => {
    for (const [lang, other] of [
      ['es', 'en'],
      ['en', 'es'],
    ]) {
      for (const [key, text] of Object.entries(STRINGS[lang])) {
        expect(detectLanguage(text), `${lang} ${key}: ${text}`).not.toBe(other)
      }
    }
  })

  it('hay texto para cada escenario, maniobra, estado y error del micrófono', () => {
    const keys = [
      ...Object.keys(EMERGENCY_TYPES).map((id) => `scenario.${id}`),
      ...MANEUVER_LIST.flatMap((id) => [`maneuver.${id}.label`, `maneuver.${id}.hint`]),
      ...['normal', 'attention', 'urgent'].map((s) => `status.${s}`),
      ...['not-allowed', 'service-not-allowed', 'no-speech', 'audio-capture', 'network', 'generic'].map(
        (code) => `mic.error.${code}`,
      ),
      ...['sending', 'queued', 'synced', 'offline', 'error'].map((s) => `guide.report.${s}`),
      ...['validado', 'supuesto'].map((s) => `guide.state.${s}`),
      ...LANGUAGES.map((l) => `lang.${l}`),
    ]
    for (const key of keys) expect(STRINGS.es[key], key).toBeTruthy()
  })
})

describe('translate', () => {
  it('reemplaza {datos} y respeta el idioma', () => {
    expect(translate('es', 'chat.sessionStarted', { name: 'Ana' })).toBe('Sesión iniciada · Ana')
    expect(translate('en', 'chat.sessionStarted', { name: 'Ana' })).toBe('Session started · Ana')
    expect(translate('en', 'vitals.offMany', { count: 3 })).toBe('3 values out of range')
  })

  it('un idioma desconocido cae a español y una clave desconocida se devuelve tal cual', () => {
    expect(toLanguage('fr')).toBe('es')
    expect(translate('fr', 'topbar.menu')).toBe('Menú')
    expect(translate('en', 'no.such.key')).toBe('no.such.key')
  })

  it('makeI18n da t y la hora en el formato del idioma', () => {
    const { lang, t, time } = makeI18n('en')
    expect(lang).toBe('en')
    expect(t('topbar.menu')).toBe('Menu')
    expect(time('2026-11-15T14:05:00')).toBe(formatTime('2026-11-15T14:05:00', 'en'))
  })
})
