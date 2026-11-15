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
