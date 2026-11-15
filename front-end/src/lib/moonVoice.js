// Voz propia de Moon-C (backend POST /tts, voz es_MX de moonc_voz/) con la boca sincronizada.
// Basado en moonc_voz/web/moonc-voz.js del equipo de voz: reproduce el WAV con Web Audio y mide
// el volumen real (RMS) para mover la boca de Moon-C (moon.setMouth).
// Diferencia: el texto se pide por oraciones y se reproduce mientras se prepara la siguiente,
// así una respuesta larga (por ejemplo un protocolo de emergencia) empieza a sonar enseguida.

const SENTENCE_END = /(?<=[.!?…;:])\s+/

function hardSplit(text, max) {
  const out = []
  let rest = text
  while (rest.length > max) {
    let cut = rest.lastIndexOf(', ', max)
    if (cut < max / 2) cut = rest.lastIndexOf(' ', max)
    if (cut <= 0) cut = max
    out.push(rest.slice(0, cut + 1).trim())
    rest = rest.slice(cut + 1).trim()
  }
  if (rest) out.push(rest)
  return out
}

/**
 * Parte un texto en trozos para sintetizar. El primero es la primera oración (suena enseguida);
 * los siguientes juntan oraciones hasta `max` caracteres. Los números (38.2) no se cortan.
 */
export function splitForSpeech(text, max = 220) {
  const pieces = text.replace(/\s+/g, ' ').trim().split(SENTENCE_END).filter(Boolean)
  const chunks = []
  for (const piece of pieces) {
    const last = chunks.at(-1)
    const merge = last !== undefined && (last.length < 12 || (chunks.length > 1 && last.length + 1 + piece.length <= max))
    if (merge) chunks[chunks.length - 1] = `${last} ${piece}`
    else chunks.push(piece)
  }
  return chunks.flatMap((c) => (c.length <= max ? [c] : hardSplit(c, max)))
}

let sharedContext = null
function audioContext() {
  if (!sharedContext) sharedContext = new (window.AudioContext || window.webkitAudioContext)()
  if (sharedContext.state === 'suspended') sharedContext.resume().catch(() => {})
  return sharedContext
}

// Los navegadores solo permiten audio después de un gesto: el primer clic o tecla lo habilita.
if (typeof window !== 'undefined') {
  const unlock = () => {
    try {
      audioContext()
    } catch {
      /* sin Web Audio */
    }
  }
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
}

/**
 * fetchAudio(texto) -> Promise<ArrayBuffer> (WAV); onLevel(0..1 | null) en cada cuadro mientras suena.
 * `ganancia` y `suavizado` calibran la boca igual que en moonc-voz.js.
 */
export function createMoonVoice({ fetchAudio, onLevel, ganancia = 6, suavizado = 0.35, cache = 32 }) {
  const memo = new Map()
  let source = null
  let raf = 0
  let level = 0
  let token = 0

  async function buffer(text) {
    if (memo.has(text)) return memo.get(text)
    const decoded = await audioContext().decodeAudioData(await fetchAudio(text))
    memo.set(text, decoded)
    if (memo.size > cache) memo.delete(memo.keys().next().value)
    return decoded
  }

  function stopMouth() {
    cancelAnimationFrame(raf)
    raf = 0
    level = 0
    onLevel?.(null)
  }

  function play(decoded) {
    const ctx = audioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    const data = new Float32Array(analyser.fftSize)
    source = ctx.createBufferSource()
    source.buffer = decoded
    source.connect(analyser).connect(ctx.destination)
    const tick = () => {
      analyser.getFloatTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
      level += (Math.min(1, Math.sqrt(sum / data.length) * ganancia) - level) * (1 - suavizado)
      onLevel?.(level < 0.04 ? 0 : level)
      raf = requestAnimationFrame(tick)
    }
    tick()
    return new Promise((resolve) => {
      const mine = source
      mine.onended = () => {
        if (source === mine) {
          source = null
          stopMouth()
        }
        resolve()
      }
      mine.start()
    })
  }

  function stop() {
    token += 1
    if (source) {
      try {
        source.onended = null
        source.stop()
      } catch {
        /* ya terminó */
      }
      source = null
    }
    stopMouth()
  }

  /** Dice el texto. Rechaza si el backend no pudo sintetizar el primer trozo (para usar otra voz). */
  async function speak(text) {
    stop()
    const mine = token
    const chunks = splitForSpeech(text)
    let next = buffer(chunks[0])
    for (let i = 0; i < chunks.length; i++) {
      const decoded = await next // el primer trozo puede fallar: el error sube a quien llamó
      if (mine !== token) return
      next = i + 1 < chunks.length ? buffer(chunks[i + 1]).catch(() => null) : null
      if (!decoded) return false // un trozo posterior falló: se corta aquí (quien llama lo avisa)
      await play(decoded)
      if (mine !== token) return
    }
    return true
  }

  return { speak, stop, get speaking() { return source !== null } }
}
