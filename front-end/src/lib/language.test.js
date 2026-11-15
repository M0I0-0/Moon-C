import { describe, expect, it } from 'vitest'
import shared from '@shared/language_cases.json'
import { detectLanguage } from './language'

// Mismos casos que Backend/tests/test_language.py: las dos copias de las listas de palabras deben coincidir.
describe('detectLanguage coincide con Backend/app/language.py', () => {
  it.each(shared.cases)('"$text" -> $language', ({ text, language }) => {
    expect(detectLanguage(text)).toBe(language)
  })
})

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
