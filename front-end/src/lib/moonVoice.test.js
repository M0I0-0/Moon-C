import { describe, expect, it } from 'vitest'
import { splitForSpeech } from './moonVoice'

const EMERGENCY =
  'Esto puede ser una emergencia. Llama ahora a un compañero y al oficial médico a bordo. Dolor de pecho: cómo ayudar: ' +
  '1. Pon a la persona a salvo: detén su actividad, ayúdala a quedarse quieta y sujétala en una posición cómoda. ' +
  '2. Avisa ahora al oficial médico a bordo y al resto de la tripulación. 3. Sigue el procedimiento de emergencia del vehículo.'

describe('splitForSpeech', () => {
  it('la primera oración va sola para que la voz empiece enseguida', () => {
    const chunks = splitForSpeech(EMERGENCY)
    expect(chunks[0]).toBe('Esto puede ser una emergencia.')
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join(' ')).toBe(EMERGENCY)
  })

  it('junta oraciones hasta el máximo y no deja números de paso sueltos', () => {
    const chunks = splitForSpeech(EMERGENCY, 220)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(220)
    expect(chunks.some((c) => c === '1.' || c === '2.' || c === '3.')).toBe(false)
  })

  it('no corta decimales ni unidades', () => {
    expect(splitForSpeech('Alerta: Moisés, temperatura corporal 38.2 °C')).toEqual(['Alerta: Moisés, temperatura corporal 38.2 °C'])
  })

  it('un texto corto queda en un solo trozo', () => {
    expect(splitForSpeech('Hola, soy Moon-C.')).toEqual(['Hola, soy Moon-C.'])
  })

  it('una oración larguísima se corta en comas o espacios', () => {
    const long = Array.from({ length: 60 }, (_, i) => `palabra${i}`).join(', ')
    const chunks = splitForSpeech(long, 100)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(101)
  })
})
