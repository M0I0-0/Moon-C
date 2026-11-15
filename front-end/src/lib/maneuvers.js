// Maniobras guiadas de Model3D (RCP, torniquete, atragantamiento): archivos, atajos y detección de intención.
// La lógica de pasos vive en Model3D/moonc/maniobras.js; aquí solo se conecta con la app.
import { MANIOBRAS, ENTORNOS, FUENTES } from '@model3d/moonc/maniobras.js'
import rcpUrl from '@model3d/moonc/maniqui_rcp.glb?url'
import brazoUrl from '@model3d/moonc/maniqui_brazo.glb?url'
import torsoUrl from '@model3d/moonc/maniqui_torso.glb?url'
import pinoUrl from '@model3d/moonc/metodo_pino.jpg?url'
import heimlichUrl from '@model3d/moonc/heimlich.jpg?url'

export { MANIOBRAS, ENTORNOS, FUENTES }

// Los .glb se sirven con la URL que genera Vite (maniobras.js los pediría a `base + nombre`).
export const MANEUVER_FILES = {
  'maniqui_rcp.glb': rcpUrl,
  'maniqui_brazo.glb': brazoUrl,
  'maniqui_torso.glb': torsoUrl,
}
export const MANEUVER_IMAGES = { 'metodo_pino.jpg': pinoUrl, 'heimlich.jpg': heimlichUrl }

// Ambiente de la app -> entorno de maniobras.
export const ENV_TO_MANEUVER = { iss: 'iss', moon: 'luna', mars: 'marte', home: 'tierra' }

export const MANEUVER_LIST = [
  { id: 'rcp', label: 'RCP', hint: 'Paro cardiaco' },
  { id: 'torniquete', label: 'Torniquete', hint: 'Sangrado grave en brazo o pierna' },
  { id: 'atragantamiento', label: 'Atragantamiento', hint: 'Adulto consciente' },
]

// Cámara por maniobra, en el espacio del modelo de Moon-C (copiado de Model3D/moonc/moonc-escena.js).
// [posición, objetivo]
export const MANEUVER_CAMS = {
  rcp: [[1.2, 1.0, 4.2], [0.15, -0.4, 0.55]],
  torniquete: [[0.9, 0.35, 2.3], [-0.12, -0.45, 0.5]],
  atragantamiento: [[-2.6, 0.4, 2.4], [0, -0.4, 0.45]],
}

const EXPLICIT = [
  ['rcp', /\b(rcp|reanimacion|reanimar|resucitacion|masaje cardiaco)\b/],
  ['torniquete', /\b(torniquete)\b/],
  ['atragantamiento', /\b(atragant\w*|heimlich)\b/],
]
const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** El usuario pide la guía por nombre ("guíame con la RCP"). */
export function explicitManeuver(message) {
  const t = norm(message)
  return EXPLICIT.find(([, re]) => re.test(t))?.[0] ?? null
}

/** Guía sugerida para una respuesta del chat (se ofrece con un botón, nunca se abre sola). */
export function suggestedManeuver({ protocol, message }) {
  const byProtocol = { fainting_unresponsive: 'rcp', bleeding: 'torniquete' }[protocol?.name]
  if (byProtocol) return byProtocol
  if (protocol?.name === 'breathing_difficulty' && /atragant|ahog|choking|se atoro|atoro/.test(norm(message))) {
    return 'atragantamiento'
  }
  return null
}

// Palabras inequívocas para abrir la guía sola (todo sobre texto normalizado, sin acentos).
const NO_RESPONSE =
  /\b(no (me )?(responde|respira|reacciona|despierta|tiene pulso|contesta)|ya no (respira|responde)|sin (respirar|respuesta|pulso|conocimiento)|inconsciente|paro (cardiaco|respiratorio|cardiorespiratorio)|un paro|en paro|unresponsive|not (breathing|responding)|isn'?t (breathing|responding)|no pulse|cardiac arrest)\b/
const LIMB = /\b(brazos?|antebrazos?|piernas?|manos?|pies?|muslos?|extremidad(es)?|arms?|legs?|hands?|feet|foot|thighs?|limbs?)\b/
const HEAVY_BLEED =
  /\b(mucho|mucha|abundante|profus\w*|a chorros|arterial|no (para|se detiene|deja de)|won'?t stop|wont stop|spurting|gushing|heavy|severe|massive)\b/
const MINOR_SITE = /\b(nariz|nasal|encias?|nose|gums?)\b/

/**
 * Decisión PURA de abrir la guía 3D sola desde el chat (solo con palabras inequívocas):
 * RCP: protocolo de desmayo Y mensaje de falta de respuesta/respiración;
 * torniquete: sangrado Y extremidad o sangrado fuerte (no sangrado de nariz);
 * atragantamiento: igual que la sugerencia. Si no es inequívoco devuelve null (queda el botón).
 */
export function autoOpenManeuver({ category, protocol, message }) {
  if (category !== 'emergency') return null
  const guide = suggestedManeuver({ protocol, message })
  const t = norm(message ?? '')
  if (guide === 'rcp') return NO_RESPONSE.test(t) ? 'rcp' : null
  if (guide === 'torniquete') {
    const limb = LIMB.test(t)
    if (MINOR_SITE.test(t) && !limb) return null
    return limb || HEAVY_BLEED.test(t) ? 'torniquete' : null
  }
  return guide
}

/** Frase(s) de emergencia de una respuesta: lo que va antes del protocolo, o la primera oración. */
export function replyIntro(reply, protocol) {
  const text = String(reply ?? '').trim()
  const cut = protocol?.title ? text.split(protocol.title)[0].trim() : ''
  if (cut) return cut
  const first = text.split(/(?<=[.!?…])\s+/)[0] ?? ''
  return first.slice(0, 240)
}

const toInt = (n) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : null)
const clip = (text, max) => (typeof text === 'string' ? text.slice(0, max) : null)

/**
 * "Resumen para Tierra" de Model3D (paqueteTierra()) -> resumen que guarda el backend
 * (POST /maneuvers/reports). Solo datos que genera la guía; nunca texto del chat.
 */
export function toReportSummary(pkg) {
  return {
    title: clip(pkg.maniobra, 200) ?? 'Maniobra',
    environment: clip(pkg.entorno, 100) ?? '',
    comm_delay: clip(pkg.retrasoComunicacion, 100),
    evacuation: clip(pkg.evacuacion, 100),
    started_at: pkg.inicio ?? null,
    duration_s: toInt(pkg.duracionSeg) ?? 0,
    compressions: toInt(pkg.compresiones),
    cycles: toInt(pkg.ciclos),
    tourniquet_time: clip(pkg.torniquete, 40),
    events: (pkg.eventos ?? []).slice(-500).map((e) => ({
      at: e.hora,
      elapsed_s: toInt(e.seg) ?? 0,
      event: clip(e.evento, 200) ?? '',
    })),
  }
}
