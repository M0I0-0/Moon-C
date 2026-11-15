import { describe, expect, it } from 'vitest'
import { DICT, localeFor, tr } from './i18n'

describe('i18n', () => {
  it('es por defecto, en para cuentas en inglés, con variables', () => {
    expect(tr('es', 'sessionStarted', { name: 'Ana' })).toBe('Sesión iniciada · Ana')
    expect(tr('en-US', 'sessionStarted', { name: 'Ana' })).toBe('Session started · Ana')
    expect(tr(undefined, 'logTitle')).toBe('Bitácora')
    expect(localeFor('en')).toBe('en-US')
    expect(localeFor('es')).toBe('es-MX')
  })

  it('ambos idiomas tienen las mismas claves', () => {
    expect(Object.keys(DICT.en).sort()).toEqual(Object.keys(DICT.es).sort())
  })
})
