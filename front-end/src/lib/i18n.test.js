import { describe, expect, it } from 'vitest'
import { DICT, localeFor, pickLang, tr } from './i18n'

describe('i18n', () => {
  it('es por defecto, en para cuentas en inglés, con variables', () => {
    expect(tr('es', 'sessionStarted', { name: 'Ana' })).toBe('Sesión iniciada · Ana')
    expect(tr('en-US', 'sessionStarted', { name: 'Ana' })).toBe('Session started · Ana')
    expect(tr(undefined, 'logTitle')).toBe('Bitácora')
    expect(localeFor('en')).toBe('en-US')
    expect(localeFor('es')).toBe('es-MX')
  })

  it('los 4 idiomas tienen las mismas claves', () => {
    for (const l of ['en', 'ru', 'de']) expect(Object.keys(DICT[l]).sort()).toEqual(Object.keys(DICT.es).sort())
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
    for (const l of ['en', 'ru', 'de']) for (const k of Object.keys(DICT.es)) expect(vars(DICT[l][k]), `${l}.${k}`).toBe(vars(DICT.es[k]))
  })
})
