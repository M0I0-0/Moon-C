import { describe, expect, it } from 'vitest'
import { detectLanguage, isPriorityLanguage } from './language'
import shared from '@shared/language_cases.json'

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
    // ruso
    ['Мне плохо, помогите', 'ru'],
    ['У меня болит грудь и трудно дышать', 'ru'],
    ['да', 'ru'],
    ['Привет, Moon-C', 'ru'],
    // alemán
    ['Ich habe Schmerzen in der Brust', 'de'],
    ['Ich kann nicht atmen, bitte Hilfe', 'de'],
    ['Ich bin müde', 'de'],
    ['Mir ist schwindelig und übel', 'de'],
    ['Ich fühle mich schlecht', 'de'],
    ['Guten Morgen', 'de'],
    ['Straße', 'de'],
    ['ich kann nicht atmen und habe starke schmerzen', 'de'],
    // es/en no se contaminan
    ['Me duele el pecho y no puedo respirar', 'es'],
    ['I have chest pain and I cannot breathe', 'en'],
    ['Necesito ayuda, es una emergencia', 'es'],
    ['pingüino', null],
    // mezclas y sin señal
    ['Помогите, мне плохо, help', 'ru'],
    ['Помогите help me please', 'en'],
    ['help ayuda', null],
    ['', null],
    ['12345', null],
    ['😀😀', null],
    ['120/80', null],
  ])('%s -> %s', (text, expected) => {
    expect(detectLanguage(text)).toBe(expected)
  })

  it('tolera entradas no string', () => {
    expect(detectLanguage(undefined)).toBeNull()
  })
})

describe('isPriorityLanguage', () => {
  it('reconoce los 4 prioritarios con o sin región', () => {
    for (const l of ['es', 'en-US', 'ru-RU', 'de-DE', 'DE']) expect(isPriorityLanguage(l)).toBe(true)
    for (const l of ['fr', 'ja', '', null, undefined]) expect(isPriorityLanguage(l)).toBe(false)
  })
})
