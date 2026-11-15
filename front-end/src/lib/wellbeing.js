// Lógica pura de la guía de bienestar (respiración lenta y anclaje 5-4-3-2-1).
// Parámetros y textos: shared/support_advice.json (anxiety_crisis). Sin React ni DOM.
import advice from '@shared/support_advice.json'

const crisis = advice.anxiety_crisis
import { pickLang } from './i18n'
const pick = (obj, lang) => pickLang(obj, lang) ?? ''

export const BREATHING = crisis.breathing
export const GROUNDING_STEPS = crisis.grounding.steps

/** 'breathing' | 'grounding' | null a partir de la respuesta de /chat. */
export function guideFromResponse(res) {
  return res?.guide === 'breathing' || res?.guide === 'grounding' ? res.guide : null
}

/** Frases del JSON en el idioma pedido. */
export const cueText = (key, lang) => pick(BREATHING.cues[key], lang)
export const afterText = (lang) => pick(crisis.after, lang)
export const afterSuggestions = (lang) => pickLang(crisis.after.suggestions, lang) ?? []
export const groundingText = (step, lang) => pick(step.text, lang)

/** Fases de un ciclo en orden (la pausa se omite si dura 0). */
export function phaseList(cfg = BREATHING) {
  return [
    { id: 'inhale', s: cfg.inhale_s },
    { id: 'pause', s: cfg.pause_s },
    { id: 'exhale', s: cfg.exhale_s },
  ].filter((p) => p.s > 0)
}

/**
 * Estado de la respiración a los `ms` de iniciada (ms < 0 = cuenta previa "prepárate").
 * scale: 0..1, tamaño del círculo (crece al inhalar, se mantiene en la pausa, baja al exhalar).
 */
export function phaseAt(ms, cfg = BREATHING, cycles = cfg.cycles) {
  const phases = phaseList(cfg)
  const cycleMs = phases.reduce((a, p) => a + p.s * 1000, 0)
  if (ms < 0) return { phase: 'ready', cycle: 1, cycles, remaining: Math.ceil(-ms / 1000), progress: 0, scale: 0, done: false }
  if (ms >= cycleMs * cycles) return { phase: 'done', cycle: cycles, cycles, remaining: 0, progress: 1, scale: 0, done: true }
  const cycle = Math.floor(ms / cycleMs) + 1
  let within = ms % cycleMs
  for (const p of phases) {
    const len = p.s * 1000
    if (within < len) {
      const progress = within / len
      const scale = p.id === 'inhale' ? progress : p.id === 'exhale' ? 1 - progress : 1
      return { phase: p.id, cycle, cycles, remaining: Math.ceil((len - within) / 1000), progress, scale, done: false }
    }
    within -= len
  }
  return { phase: 'done', cycle: cycles, cycles, remaining: 0, progress: 1, scale: 0, done: true }
}

// Frases habladas por ciclo (en una ronda de 6): no se habla cada fase para no saturar.
// Solo las 4 primeras de "stay_with_me": la 5.ª ("estás a salvo") exige haber descartado síntomas físicos.
const VOICE_PLAN = {
  1: { inhale: 'inhale', exhale: 'exhale' },
  3: { inhale: 'stay0' },
  4: { inhale: 'inhale', exhale: 'exhale' },
  5: { exhale: 'stay3' },
}

/** Texto que Moon-C dice al empezar `phase` del ciclo `cycle` (o null si calla). */
export function voiceLine(cycle, phase, lang) {
  if (phase === 'done') return cueText('done', lang)
  const slot = VOICE_PLAN[((cycle - 1) % 6) + 1]?.[phase]
  if (!slot) return null
  if (slot.startsWith('stay')) return pickLang(crisis.stay_with_me, lang)?.[Number(slot[4])] ?? null
  return cueText(slot, lang) || null
}

/** Paso de anclaje a los `ms` dentro de la secuencia automática. */
export function groundingAt(ms, steps = GROUNDING_STEPS) {
  let acc = 0
  for (let i = 0; i < steps.length; i++) {
    const len = steps[i].seconds * 1000
    if (ms < acc + len) return { index: i, remaining: Math.ceil((acc + len - ms) / 1000), done: false }
    acc += len
  }
  return { index: steps.length - 1, remaining: 0, done: true }
}

/**
 * Reloj pausable con intervalo. `now` inyectable (pruebas con reloj simulado).
 * onTick recibe los ms acumulados (sin contar las pausas); `offset` inicial puede ser negativo.
 */
export function createTicker(onTick, { interval = 100, now = () => Date.now(), offset = 0 } = {}) {
  let acc = offset
  let last = null
  let timer = null
  const sample = () => {
    if (last !== null) {
      const t = now()
      acc += t - last
      last = t
    }
    return acc
  }
  return {
    start() {
      if (timer) return
      last = now()
      timer = setInterval(() => onTick(sample()), interval)
    },
    pause() {
      if (!timer) return
      sample()
      clearInterval(timer)
      timer = null
      last = null
    },
    reset(to = 0) {
      acc = to
      if (last !== null) last = now()
      onTick(acc)
    },
    elapsed: () => (timer ? sample() : acc),
    get running() {
      return Boolean(timer)
    },
  }
}
