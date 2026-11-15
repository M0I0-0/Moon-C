import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { createMoonVoice } from '../lib/moonVoice'
import { tr } from '../lib/i18n'

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
 * Con `moonVoice` (voz propia del backend lista y texto en español) habla con la voz de Moon-C y
 * manda el volumen a `onMouth` (0..1, o null al terminar) para mover la boca. Si esa voz falla,
 * o el idioma es otro, usa una voz local del navegador.
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

  // onEnd de la frase en curso: se ejecuta una sola vez, al terminar o al ser interrumpida (cancel / frase nueva).
  const pending = useRef(null)
  const settle = useCallback(() => {
    const fn = pending.current
    pending.current = null
    fn?.()
  }, [])
  const finish = useCallback(
    (id) => {
      if (utterance.current !== id) return // frase obsoleta: ya la resolvió quien la interrumpió
      setSpeaking(false)
      settle()
    },
    [settle],
  )

  const speakWithBrowser = useCallback(
    (text, id, forLang = lang) => {
      const voice = synth ? pickVoice(voices, forLang) : null
      if (!voice) {
        // Sin voz local para este idioma no se habla (el navegador elegiría una voz de red).
        finish(id)
        return
      }
      synth.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.voice = voice
      u.lang = voice.lang
      u.rate = 1.02
      u.onstart = () => {
        if (utterance.current === id) setSpeaking(true)
      }
      u.onend = u.onerror = () => finish(id)
      synth.speak(u)
    },
    [voices, lang, finish],
  )

  // `lang` por frase: Moon-C contesta en el idioma del mensaje, que puede no ser el de la cuenta.
  // `onEnd` se llama siempre (también si otra frase o cancel() la interrumpe); `onPartial` si la voz propia se corta.
  const speak = useCallback(
    (text, { onEnd, onPartial, lang: forLang = lang } = {}) => {
      settle() // la frase anterior queda interrumpida
      const id = ++utterance.current
      pending.current = onEnd ?? null
      if (!moonVoice || !forLang.startsWith('es')) {
        player.stop()
        speakWithBrowser(text, id, forLang)
        return
      }
      synth?.cancel()
      setSpeaking(true)
      player
        .speak(text)
        .then((complete) => {
          if (utterance.current !== id) return
          if (complete === false) onPartial?.()
          finish(id)
        })
        .catch(() => {
          // La voz de Moon-C no respondió: esta vez habla una voz local del navegador.
          if (utterance.current !== id) return
          setSpeaking(false)
          speakWithBrowser(text, id, forLang)
        })
    },
    [moonVoice, lang, player, speakWithBrowser, finish, settle],
  )

  const cancel = useCallback(() => {
    utterance.current += 1
    player.stop()
    synth?.cancel()
    setSpeaking(false)
    settle()
  }, [player, settle])

  // ¿Hay voz para ese idioma? Moon-C (Piper) solo habla español; ru, de, en… dependen de voces locales del navegador.
  const hasVoiceFor = useCallback(
    (forLang = lang) => (moonVoice && forLang.startsWith('es')) || Boolean(pickVoice(voices, forLang)),
    [moonVoice, voices, lang],
  )

  return {
    supported: moonVoice || Boolean(synth),
    hasVoiceFor,
    // Hay voz para el idioma actual (la de Moon-C, solo español, o una local); si no, la app muestra subtítulos.
    hasVoices: (moonVoice && lang.startsWith('es')) || Boolean(pickVoice(voices, lang)),
    moonVoice,
    hasSpeakers,
    speaking,
    speak,
    cancel,
  }
}

const RECOGNITION_ERRORS = {
  'not-allowed': 'errNotAllowed',
  'service-not-allowed': 'errServiceNotAllowed',
  'no-speech': 'errNoSpeech',
  'audio-capture': 'errAudioCapture',
  network: 'errNetwork',
}

/** Mensaje de error del dictado en el idioma de reconocimiento (es-MX, en-US…). */
export const recognitionError = (code, lang) => tr(lang, RECOGNITION_ERRORS[code] ?? 'errMic')

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
    rec.onerror = (e) => setError(recognitionError(e.error, lang))
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
