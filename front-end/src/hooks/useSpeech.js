import { useCallback, useEffect, useRef, useState } from 'react'

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined
const Recognition =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined

/**
 * Solo voces instaladas en el equipo (localService). Las voces de red (por ejemplo "Google español")
 * mandan el texto a un servidor externo y no funcionan sin internet. Sin voz local: null (subtítulos).
 */
export function pickVoice(voices, lang) {
  const local = voices.filter((v) => v.localService)
  const base = lang.slice(0, 2)
  return (
    local.find((v) => v.lang === lang) ||
    local.find((v) => v.lang?.startsWith(`${base}-`)) ||
    local.find((v) => v.lang?.startsWith(base)) ||
    null
  )
}

/**
 * Salida de voz (text-to-speech) + detección de bocinas.
 * hasSpeakers: true/false si el navegador lista dispositivos de salida, null si no lo sabe.
 */
export function useSpeechOutput(lang) {
  const [voices, setVoices] = useState(() => synth?.getVoices() ?? [])
  const [speaking, setSpeaking] = useState(false)
  const [hasSpeakers, setHasSpeakers] = useState(null)

  useEffect(() => {
    if (!synth) return
    const update = () => setVoices(synth.getVoices())
    update()
    synth.addEventListener?.('voiceschanged', update)
    return () => synth.removeEventListener?.('voiceschanged', update)
  }, [])

  useEffect(() => {
    const md = navigator.mediaDevices
    if (!md?.enumerateDevices) return
    const check = async () => {
      try {
        const devices = await md.enumerateDevices()
        const reportsOutputs = devices.some((d) => d.kind === 'audiooutput')
        const anyKind = devices.length > 0
        // Chrome y Edge listan las salidas de audio; Firefox y Safari no, así que ahí no sabemos.
        if (reportsOutputs) setHasSpeakers(true)
        else if (anyKind && 'setSinkId' in HTMLMediaElement.prototype) setHasSpeakers(false)
        else setHasSpeakers(null)
      } catch {
        setHasSpeakers(null)
      }
    }
    check()
    md.addEventListener?.('devicechange', check)
    return () => md.removeEventListener?.('devicechange', check)
  }, [])

  const speak = useCallback(
    (text, { onEnd } = {}) => {
      if (!synth) {
        onEnd?.()
        return
      }
      const voice = pickVoice(voices, lang)
      if (!voice) {
        // Sin voz local para este idioma no se habla (el navegador elegiría una voz de red).
        onEnd?.()
        return
      }
      synth.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.voice = voice
      u.lang = voice.lang
      u.rate = 1.02
      u.onstart = () => setSpeaking(true)
      u.onend = u.onerror = () => {
        setSpeaking(false)
        onEnd?.()
      }
      synth.speak(u)
    },
    [voices, lang],
  )

  const cancel = useCallback(() => {
    synth?.cancel()
    setSpeaking(false)
  }, [])

  return {
    supported: Boolean(synth),
    // Hay voz local para el idioma actual; si no, la app muestra subtítulos.
    hasVoices: Boolean(pickVoice(voices, lang)),
    hasSpeakers,
    speaking,
    speak,
    cancel,
  }
}

const RECOGNITION_ERRORS = {
  'not-allowed': 'No hay permiso para usar el micrófono.',
  'service-not-allowed': 'El navegador bloqueó el dictado.',
  'no-speech': 'No escuché nada. Intenta de nuevo.',
  'audio-capture': 'No se encontró un micrófono.',
  network: 'El dictado del navegador necesita conexión. Escribe tu mensaje.',
}

/** Entrada por micrófono (speech-to-text del navegador). */
export function useSpeechInput(lang, onFinal) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState('')
  const recRef = useRef(null)
  const onFinalRef = useRef(onFinal)

  useEffect(() => {
    onFinalRef.current = onFinal
  }, [onFinal])

  const stop = useCallback(() => recRef.current?.stop(), [])

  const start = useCallback(() => {
    if (!Recognition) return
    setError('')
    setInterim('')
    const rec = new Recognition()
    rec.lang = lang
    rec.interimResults = true
    rec.continuous = false
    rec.maxAlternatives = 1
    rec.onresult = (e) => {
      let finalText = ''
      let partial = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript
        else partial += r[0].transcript
      }
      setInterim(partial)
      if (finalText.trim()) {
        setInterim('')
        onFinalRef.current?.(finalText.trim())
      }
    }
    rec.onerror = (e) => setError(RECOGNITION_ERRORS[e.error] ?? 'No se pudo usar el micrófono.')
    rec.onend = () => {
      setListening(false)
      setInterim('')
      recRef.current = null
    }
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }, [lang])

  useEffect(() => () => recRef.current?.abort(), [])

  return { supported: Boolean(Recognition), listening, interim, error, start, stop, clearError: () => setError('') }
}
