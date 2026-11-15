import { describe, expect, it } from 'vitest'
import { DICT, LANGUAGES, formatTime, localeFor, pickLang, tr } from './i18n'
import { detectLanguage } from './language'
import { EMERGENCY_TYPES } from '../hooks/useCrewSimulation'
import { MANEUVER_LIST } from './maneuvers'

describe('i18n', () => {
  it('es por defecto, en para cuentas en inglés, con variables', () => {
    expect(tr('es', 'sessionStarted', { name: 'Ana' })).toBe('Sesión iniciada · Ana')
    expect(tr('en-US', 'sessionStarted', { name: 'Ana' })).toBe('Session started · Ana')
    expect(tr(undefined, 'logTitle')).toBe('Bitácora')
    expect(localeFor('en')).toBe('en-US')
    expect(localeFor('es')).toBe('es-MX')
  })

  it('es y en tienen las mismas claves; ru y de usan respaldo en las nuevas claves', () => {
    expect(Object.keys(DICT.en).sort()).toEqual(Object.keys(DICT.es).sort())
    expect(tr('ru', 'appTitle')).toBe(DICT.en.appTitle)
    expect(tr('de', 'appTitle')).toBe(DICT.en.appTitle)
  })

  it('ru y de traducen; idioma desconocido cae a es; locales', () => {
    expect(tr('ru-RU', 'sessionStarted', { name: 'Ana' })).toBe('Сеанс начат · Ana')
    expect(tr('de', 'logTitle')).toBe('Protokoll')
    expect(tr('fr', 'logTitle')).toBe('Bitácora')
    expect(localeFor('ru')).toBe('ru-RU')
    expect(localeFor('de-DE')).toBe('de-DE')
  })

  it('pickLang respalda a en y luego es', () => {
    expect(pickLang({ es: 'a', en: 'b' }, 'de')).toBe('b')
    expect(pickLang({ es: 'a' }, 'ru')).toBe('a')
    expect(pickLang({ es: 'a', de: 'c' }, 'de')).toBe('c')
  })

  it('las plantillas conservan los mismos {marcadores}', () => {
    const vars = (t) => (t.match(/\{\w+\}/g) ?? []).sort().join()
    for (const l of ['en', 'ru', 'de']) {
      for (const [key, text] of Object.entries(DICT[l])) {
        expect(vars(text), `${l}.${key}`).toBe(vars(DICT.es[key]))
      }
    }
  })

  it('cada texto tiene los mismos {datos} en los dos idiomas y ninguno está vacío', () => {
    const vars = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
    for (const key of Object.keys(DICT.es)) {
      expect(vars(DICT.en[key]), key).toEqual(vars(DICT.es[key]))
      expect(DICT.en[key].trim(), key).not.toBe('')
    }
  })

  it('ningún texto quedó en el otro idioma', () => {
    for (const [lang, other] of [
      ['es', 'en'],
      ['en', 'es'],
    ]) {
      for (const [key, text] of Object.entries(DICT[lang])) {
        // Sin los {datos}: {who} o {what} son nombres de variables, no texto.
        expect(detectLanguage(text.replace(/\{\w+\}/g, ' ')), `${lang} ${key}: ${text}`).not.toBe(other)
      }
    }
  })

  it('hay texto para cada escenario, maniobra, estado y paso de la guía', () => {
    const keys = [
      ...Object.keys(EMERGENCY_TYPES).map((id) => `scenario_${id}`),
      ...MANEUVER_LIST.flatMap((id) => [`maneuverLabel_${id}`, `maneuverHint_${id}`, `maneuverGuide_${id}`]),
      ...['normal', 'attention', 'urgent'].map((s) => `status_${s}`),
      ...['validado', 'supuesto'].map((s) => `guideState_${s}`),
      ...LANGUAGES.map((l) => `langName_${l}`),
    ]
    for (const key of keys) expect(DICT.es[key], key).toBeTruthy()
  })

  it('formatTime usa el formato del idioma', () => {
    expect(formatTime('2026-11-15T14:05:00', 'en')).toBe(
      new Date('2026-11-15T14:05:00').toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    )
  })
})
