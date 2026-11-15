import { afterEach, describe, expect, it, vi } from 'vitest'
import { BREATHING, GROUNDING_STEPS, afterText, createTicker, groundingAt, guideFromResponse, phaseAt, phaseList, voiceLine } from './wellbeing'

describe('guideFromResponse', () => {
  it('solo acepta breathing y grounding', () => {
    expect(guideFromResponse({ guide: 'breathing' })).toBe('breathing')
    expect(guideFromResponse({ guide: 'grounding' })).toBe('grounding')
    expect(guideFromResponse({ guide: 'otra' })).toBeNull()
    expect(guideFromResponse({})).toBeNull()
    expect(guideFromResponse(null)).toBeNull()
  })
})

describe('phaseAt', () => {
  const cycleMs = (BREATHING.inhale_s + BREATHING.pause_s + BREATHING.exhale_s) * 1000
  it('omite la pausa en 0 s', () => {
    expect(phaseList().map((p) => p.id)).toEqual(['inhale', 'exhale'])
  })
  it('inhala, exhala y cambia de ciclo', () => {
    expect(phaseAt(0)).toMatchObject({ phase: 'inhale', cycle: 1, scale: 0, remaining: 4 })
    expect(phaseAt(2000)).toMatchObject({ phase: 'inhale', scale: 0.5, remaining: 2 })
    expect(phaseAt(4000)).toMatchObject({ phase: 'exhale', scale: 1, remaining: 6 })
    expect(phaseAt(7000).scale).toBeCloseTo(0.5)
    expect(phaseAt(cycleMs)).toMatchObject({ phase: 'inhale', cycle: 2 })
  })
  it('termina tras los ciclos y tiene cuenta previa', () => {
    expect(phaseAt(cycleMs * BREATHING.cycles - 1)).toMatchObject({ phase: 'exhale', cycle: BREATHING.cycles, done: false })
    expect(phaseAt(cycleMs * BREATHING.cycles)).toMatchObject({ phase: 'done', done: true })
    expect(phaseAt(-1500)).toMatchObject({ phase: 'ready', remaining: 2 })
  })
  it('con pausa la inserta entre inhalar y exhalar', () => {
    const cfg = { inhale_s: 4, pause_s: 2, exhale_s: 6, cycles: 1 }
    expect(phaseAt(4500, cfg)).toMatchObject({ phase: 'pause', scale: 1 })
    expect(phaseAt(6000, cfg).phase).toBe('exhale')
  })
})

describe('voiceLine', () => {
  it('habla poco y con textos del JSON', () => {
    expect(voiceLine(1, 'inhale', 'es')).toBe(BREATHING.cues.inhale.es)
    expect(voiceLine(1, 'exhale', 'en')).toBe(BREATHING.cues.exhale.en)
    expect(voiceLine(2, 'inhale', 'es')).toBeNull()
    expect(voiceLine(2, 'exhale', 'es')).toBeNull()
    expect(voiceLine(3, 'inhale', 'es')).toBe('Estoy aquí contigo.')
    expect(voiceLine(5, 'exhale', 'es')).toContain('Sigue soltando')
    expect(voiceLine(6, 'done', 'es')).toBe(BREATHING.cues.done.es)
    const all = [1, 2, 3, 4, 5, 6].flatMap((c) => ['inhale', 'exhale'].map((p) => voiceLine(c, p, 'es')))
    expect(all.join(' ')).not.toContain('a salvo')
  })
  it('cierre del JSON', () => {
    expect(afterText('en')).toMatch(/You did very well/)
  })
})

describe('groundingAt', () => {
  it('avanza por los segundos del JSON y termina', () => {
    expect(groundingAt(0)).toMatchObject({ index: 0, remaining: 12 })
    expect(groundingAt(12000).index).toBe(1)
    expect(groundingAt(22000).index).toBe(2)
    const total = GROUNDING_STEPS.reduce((a, s) => a + s.seconds * 1000, 0)
    expect(groundingAt(total - 1)).toMatchObject({ index: 4, done: false })
    expect(groundingAt(total).done).toBe(true)
  })
})

describe('createTicker (reloj simulado)', () => {
  afterEach(() => vi.useRealTimers())
  it('acumula, se detiene en pausa y reanuda', () => {
    vi.useFakeTimers()
    const seen = []
    const t = createTicker((ms) => seen.push(ms), { interval: 100, now: () => Date.now(), offset: -1000 })
    t.start()
    vi.advanceTimersByTime(1500)
    expect(t.elapsed()).toBe(500)
    t.pause()
    vi.advanceTimersByTime(5000)
    expect(t.elapsed()).toBe(500)
    t.start()
    vi.advanceTimersByTime(1000)
    expect(t.elapsed()).toBe(1500)
    expect(phaseAt(t.elapsed()).phase).toBe('inhale')
    t.pause()
    expect(seen.length).toBeGreaterThan(10)
  })
})
