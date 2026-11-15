import { describe, expect, it } from 'vitest'
import { detectLanguage } from './language'

describe('detectLanguage', () => {
  it.each([
    ['i dont speak spanish', 'en'],
    ['hi', 'en'],
    ['Hola, buenos días', 'es'],
    ['no puedo respirar', 'es'],
    ['ok', null],
  ])('%s -> %s', (text, expected) => {
    expect(detectLanguage(text)).toBe(expected)
  })
})
