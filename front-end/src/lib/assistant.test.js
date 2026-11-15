import { beforeEach, describe, expect, it } from 'vitest'
import cases from '@shared/router_cases.json'
import { answer, askLocal, detectEmergency, normalize, resetLocal, scanEmergency } from './assistant'

describe('detectEmergency (sin enlace) coincide con el router del backend', () => {
  it.each(cases.emergency)('"$text" -> $protocol', ({ text, protocol }) => {
    expect(detectEmergency(text)).toBe(protocol)
  })

  it.each(cases.not_emergency)('"%s" no es emergencia', (text) => {
    expect(detectEmergency(text)).toBeNull()
  })
})

describe('scanEmergency (sin enlace) coincide con el router del backend en las preguntas de seguridad', () => {
  it.each(['safety', 'negated', 'pain'])('grupo %s: pregunta antes de abrir el protocolo', (kind) => {
    for (const { text, protocol } of cases[kind]) {
      expect(scanEmergency(text), text).toEqual({ kind, protocol })
      expect(detectEmergency(text), text).toBeNull()
    }
  })

  it('"no puedo respirar" no es una negación: es el síntoma', () => {
    expect(scanEmergency('no, no puedo respirar')).toEqual({ kind: 'direct', protocol: 'breathing_difficulty' })
    expect(scanEmergency('No, sangra mucho')).toEqual({ kind: 'direct', protocol: 'bleeding' })
  })

  it('la crisis emocional nunca se trata como negada', () => {
    expect(scanEmergency('no me quiero matar').kind).toBe('direct')
  })
})

describe('answer', () => {
  it.each([
    ['poco', true, 'no'],
    ['no mucho', true, 'no'],
    ['bastante', true, 'yes'],
    ['No, es grave', true, 'yes'],
    ['no es grave', true, 'no'],
    ['Sí, necesito ayuda', false, 'yes'],
    ['No, estoy bien', false, 'no'],
    ['no sé', true, null],
  ])('"%s" (graded=%s) -> %s', (text, graded, expected) => {
    expect(answer(text, graded)).toBe(expected)
  })
})

describe('askLocal con preguntas de seguridad', () => {
  beforeEach(() => resetLocal())

  it('una frase débil pregunta primero y solo un "sí" abre el protocolo', () => {
    const ask = askLocal({ message: 'me da un infarto', language: 'es' })
    expect(ask.category).toBe('ambiguous')
    expect(ask.protocol).toBeUndefined()
    expect(ask.suggestions).toEqual(['Sí, necesito ayuda', 'No, estoy bien'])
    const yes = askLocal({ message: ask.suggestions[0], language: 'es' })
    expect(yes).toMatchObject({ category: 'emergency' })
    expect(yes.protocol.title).toBe('Dolor de pecho: cómo ayudar')
  })

  it('un "no" no abre el protocolo', () => {
    askLocal({ message: 'quiero desaparecer', language: 'es' })
    expect(askLocal({ message: 'No, estoy bien', language: 'es' }).category).toBe('ambiguous')
  })

  it('"quiero desaparecer" -> "sí" abre la crisis emocional con su introducción', () => {
    askLocal({ message: 'quiero desaparecer', language: 'es' })
    const res = askLocal({ message: 'Sí, necesito ayuda', language: 'es' })
    expect(res.reply.startsWith('Gracias por decírmelo')).toBe(true)
  })

  it('una negación pide confirmación y "No, sí ocurre" abre el protocolo', () => {
    const ask = askLocal({ message: 'no sangra', language: 'es' })
    expect(ask.reply).toBe('Entendido. ¿Seguro que todo está bien?')
    expect(ask.suggestions).toEqual(['Sí, todo bien', 'No, sí ocurre'])
    expect(askLocal({ message: 'No, sí ocurre', language: 'es' }).protocol.title).toMatch(/Sangrado|sangrado|hemorragia/i)
    askLocal({ message: 'no sangra', language: 'es' })
    expect(askLocal({ message: 'Sí, todo bien', language: 'es' }).category).toBe('ambiguous')
  })

  it('dolor de pecho sin la frase exacta pregunta si es fuerte', () => {
    const ask = askLocal({ message: 'me molesta el pecho', language: 'es' })
    expect(ask.reply).toBe('¿Es un dolor fuerte u opresión?')
    expect(askLocal({ message: 'Sí, es fuerte', language: 'es' }).category).toBe('emergency')
    askLocal({ message: 'me molesta el pecho', language: 'es' })
    expect(askLocal({ message: 'No, es leve', language: 'es' }).category).toBe('ambiguous')
  })

  it('la pregunta caduca y un tema nuevo la reemplaza', () => {
    askLocal({ message: 'me da un infarto', language: 'es', now: 0 })
    // 3 minutos después ya no es la respuesta a nada.
    expect(askLocal({ message: 'Sí', language: 'es', now: 180_000 }).category).toBe('fallback')
    askLocal({ message: 'me da un infarto', language: 'es', now: 0 })
    expect(askLocal({ message: 'no me siento bien', language: 'es', now: 1000 }).category).toBe('fallback')
  })

  it('una emergencia directa siempre gana a la pregunta pendiente', () => {
    askLocal({ message: 'no sangra', language: 'es' })
    expect(askLocal({ message: 'no puedo respirar', language: 'es' }).protocol.title).toMatch(/respirar|Dificultad/i)
  })

  it('en inglés usa los textos en inglés', () => {
    const ask = askLocal({ message: "I don't have chest pain", language: 'en' })
    expect(ask.reply).toBe('Understood. Are you sure everything is okay?')
    expect(askLocal({ message: 'No, it is happening', language: 'en' }).category).toBe('emergency')
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

  it.each(['es', 'en', 'ru', 'de'])('sin emergencia avisa que no hay enlace (%s) y sugiere frases que sí son emergencias', (language) => {
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

// Mismo plegado que Backend/app/intent.py (tests/test_intent_languages.py comprueba las mismas cadenas).
it.each([
  ['Ich kann nicht ATMEN, Brustschmerzen, Straße', 'ich kann nicht atmen brustschmerzen strasse'],
  ['Müde Öl Übel', 'mude ol ubel'],
  ['Мне больно, ёлка, дышать не могу', 'мне больно елка дышать не могу'],
  ['Мой Й', 'мои и'],
])('normalize pliega ru/de igual que el backend: %s', (text, expected) => {
  expect(normalize(text)).toBe(expected)
})

describe('ru / de: emergencias directas, negaciones y respuestas', () => {
  it.each([
    ['У меня боль в груди', 'chest_pain'],
    ['Я задыхаюсь', 'breathing_difficulty'],
    ['Он потерял сознание', 'fainting_unresponsive'],
    ['Хочу умереть', 'emotional_crisis'],
    ['Ich kann nicht atmen', 'breathing_difficulty'],
    ['Er ist bewusstlos', 'fainting_unresponsive'],
    ['Ich will sterben', 'emotional_crisis'],
    ['SOS', 'general_emergency'],
    ['112', 'general_emergency'],
    ['Call 911', 'general_emergency'],
  ])('"%s" -> %s', (text, protocol) => {
    expect(detectEmergency(text)).toBe(protocol)
  })

  it('un número de emergencia dentro de una frase no es una emergencia', () => {
    expect(detectEmergency('Mi pulso es 112')).toBeNull()
    expect(detectEmergency('Мой пульс 112')).toBeNull()
  })

  it('negación en ru/de pide confirmación', () => {
    expect(scanEmergency('У меня нет боли в груди')).toEqual({ kind: 'negated', protocol: 'chest_pain' })
    expect(scanEmergency('Ich habe keine Brustschmerzen')).toEqual({ kind: 'negated', protocol: 'chest_pain' })
    expect(scanEmergency('Не знаю что делать, он потерял сознание').kind).toBe('direct')
  })

  it.each([
    ['не знаю', true, null],
    ['нет, я в порядке', false, 'no'],
    ['Да, мне нужна помощь', false, 'yes'],
    ['не сильно', true, 'no'],
    ['очень сильно', true, 'yes'],
    ['Nein weiß nicht', true, null],
    ['Nein, mir geht es gut', false, 'no'],
    ['Ja, ich brauche Hilfe', false, 'yes'],
    ['nicht schlimm', true, 'no'],
  ])('answer("%s", graded=%s) -> %s', (text, graded, expected) => {
    expect(answer(text, graded)).toBe(expected)
  })

  it.each([
    ['ru', 'Сердечный приступ', 'Да, мне нужна помощь', 'Нет, я в порядке'],
    ['de', 'Herzinfarkt', 'Ja, ich brauche Hilfe', 'Nein, mir geht es gut'],
  ])('(%s) frase débil -> pregunta; "sí" abre el protocolo, "no" no', (language, weak, yes, no) => {
    resetLocal()
    const ask = askLocal({ message: weak, language })
    expect(ask).toMatchObject({ category: 'ambiguous', language })
    expect(ask.suggestions).toEqual([yes, no])
    const open = askLocal({ message: yes, language })
    expect(open).toMatchObject({ category: 'emergency', language })
    expect(open.protocol.title).toBeTruthy() // sin traducción del manual cae al inglés
    askLocal({ message: weak, language })
    expect(askLocal({ message: no, language }).category).toBe('ambiguous')
  })

  it('"Не могу дышать" abre el protocolo (en ruso si el manual ya está traducido, si no en inglés)', () => {
    resetLocal()
    const res = askLocal({ message: 'Не могу дышать', language: 'ru' })
    expect(res).toMatchObject({ category: 'emergency', language: 'ru' })
    expect(res.reply).toContain(res.protocol.title)
  })
})
