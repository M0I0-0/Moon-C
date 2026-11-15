import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { createMoonVoice } from '../lib/moonVoice'
import { speechLangFor } from '../config'

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
 * `lang` ('es' | 'en') es el idioma de la pantalla; cada texto puede pedir otro (speak(text, { lang })),
 * por ejemplo las alertas, que van en inglés. Con `moonVoice` (voz propia del backend lista) el
 * español se habla con la voz de Moon-C y el volumen va a `onMouth` (0..1, o null al terminar) para
 * mover la boca. Si esa voz falla, o el texto está en otro idioma, usa una voz local del navegador.
 * hasSpeakers: true/false si el navegador lista dispositivos de salida, null si no lo sabe.
 */
export function useSpeechOutput(lang, { moonVoice = false, onMouth } = {}) {
  const [voices, setVoices] = useState(() => synth?.getVoices() ?? [])
  const [speaking, setSpeaking] = useState(false)
  const [hasSpeakers, setHasSpeakers] = useState(null)
  const onMouthRef = useRef(onMouth)
  const utterance = useRef(0)
  const [player] = useState(() =>
    createMoonVoice({ fetchAudio: (text) => api.tts(text, 'es'), onLevel: (v) => onMouthRef.current?.(v) }),
  )

  useEffect(() => {
    onMouthRef.current = onMouth
  }, [onMouth])

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

  // La voz de Moon-C solo habla español; cualquier otro idioma usa una voz local del navegador.
  const moonFor = useCallback((l) => moonVoice && l === 'es', [moonVoice])
  const voiceFor = useCallback((l) => pickVoice(voices, speechLangFor(l)), [voices])

  const speakWithBrowser = useCallback(
    (text, l, onEnd) => {
      if (!synth) {
        onEnd?.()
        return
      }
      const voice = voiceFor(l)
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
    [voiceFor],
  )

  const speak = useCallback(
    (text, { onEnd, lang: textLang = lang } = {}) => {
      const id = ++utterance.current
      if (!moonFor(textLang)) {
        player.stop()
        speakWithBrowser(text, textLang, onEnd)
        return
      }
      synth?.cancel()
      setSpeaking(true)
      player
        .speak(text)
        .then(() => {
          if (utterance.current !== id) return
          setSpeaking(false)
          onEnd?.()
        })
        .catch(() => {
          // La voz de Moon-C no respondió: esta vez habla una voz local del navegador.
          if (utterance.current !== id) return
          setSpeaking(false)
          speakWithBrowser(text, textLang, onEnd)
        })
    },
    [lang, moonFor, player, speakWithBrowser],
  )

  /** Hay voz para ese idioma: la de Moon-C (español) o una local del equipo. Si no, la app muestra subtítulos. */
  const canSpeak = useCallback(
    (l = lang) => moonFor(l) || (Boolean(synth) && Boolean(voiceFor(l))),
    [lang, moonFor, voiceFor],
  )

  const cancel = useCallback(() => {
    utterance.current += 1
    player.stop()
    synth?.cancel()
    setSpeaking(false)
  }, [player])

  return {
    supported: moonVoice || Boolean(synth),
    // Hay voz para el idioma de la pantalla (la de Moon-C o una local); si no, la app muestra subtítulos.
    hasVoices: canSpeak(lang),
    moonVoice: moonFor(lang),
    canSpeak,
    hasSpeakers,
    speaking,
    speak,
    cancel,
  }
}

// Errores conocidos del dictado; el texto de cada uno está en src/i18n/strings.js (mic.error.*).
const RECOGNITION_ERRORS = ['not-allowed', 'service-not-allowed', 'no-speech', 'audio-capture', 'network']

/**
 * Entrada por micrófono (speech-to-text del navegador), en `lang` (es-MX, en-US).
 * `error` es un código: uno de RECOGNITION_ERRORS o 'generic'.
 */
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
    rec.onerror = (e) => setError(RECOGNITION_ERRORS.includes(e.error) ? e.error : 'generic')
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
