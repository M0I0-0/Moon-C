import { useCallback, useEffect, useRef, useState } from 'react'
import ManeuverPanel from './components/ManeuverPanel'
import WellbeingGuide from './components/WellbeingGuide'
import { afterSuggestions, afterText, guideFromResponse } from './lib/wellbeing'
import { ENV_TO_MANEUVER, MANIOBRAS, autoOpenManeuver, explicitManeuver, maneuverTitle, replyIntro, suggestedManeuver, toReportSummary } from './lib/maneuvers'
import { QUICK_CREW, QUICK_GENERAL, baseLang, tr } from './lib/i18n'
import Scene from './components/Scene'
import TopBar from './components/TopBar'
import MenuDrawer from './components/MenuDrawer'
import VitalsPanel from './components/VitalsPanel'
import CrewOverview, { EmergencyDetail } from './components/CrewOverview'
import Announcements from './components/Announcements'
import AlertBanner from './components/AlertBanner'
import AiMark from './components/AiMark'
import { alertText } from './lib/alerts'
import ChatDock from './components/ChatDock'
import Subtitles from './components/Subtitles'
import VitalDetail from './components/VitalDetail'
import { ENVIRONMENTS } from './data/environments'
import { useAnnouncements } from './hooks/useAnnouncements'
import { useSyncStatus } from './hooks/useSyncStatus'
import { INDICATORS, classify, crewById, worstStatus } from './data/manual'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useCrewSimulation } from './hooks/useCrewSimulation'
import { useRemoteCrew } from './hooks/useRemoteCrew'
import { useSpeechInput, useSpeechOutput } from './hooks/useSpeech'
import { useBackendStatus } from './hooks/useBackendStatus'
import { askBackend, askLocal } from './lib/assistant'
import { api } from './lib/api'
import { speechLangFor } from './config'
import { detectLanguage } from './lib/language'

let seq = 0
const uid = () => `${Date.now()}-${++seq}`
// Cada carga de la app es una sesión de chat propia: el contexto no se comparte entre tablets.
const DEVICE_ID = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`)
  .replace(/[^a-z0-9]/gi, '')
  .slice(0, 12)
const sessionFor = (accountId) => `${DEVICE_ID}-${accountId}`
// Igual que el backend (MOON_C_SESSION_TTL_S): la conversación se borra tras 10 min sin actividad.
const CHAT_TTL_MS = 10 * 60 * 1000

export default function App() {
  const [storedAccount, setAccountId] = useLocalStorage('moonc.account', 'general')
  const [voiceOn, setVoiceOn] = useLocalStorage('moonc.voice', true)
  const [subtitleMode, setSubtitleMode] = useLocalStorage('moonc.subtitles', 'auto')
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState(null)
  const [logs, setLogs] = useState({})
  const [suggestions, setSuggestions] = useState({})
  const [caption, setCaption] = useState(null)
  const [busy, setBusy] = useState(false)
  const [emergencyView, setEmergencyView] = useState(null)
  const [accessLog, setAccessLog] = useState({})
  const [vitalDetail, setVitalDetail] = useState(null)
  const [greeting, setGreeting] = useState(true)
  const [maneuver, setManeuver] = useState(null) // { id, entorno, nonce }
  const [mstate, setMstate] = useState(null)
  const [autoGuide, setAutoGuide] = useState(null) // guía abierta sola por una emergencia: { nonce, reply, lang, slow }
  const [wellbeing, setWellbeing] = useState(null) // guía de respiración/anclaje: { mode, nonce, lead }
  const autoGuideRef = useRef(null)
  const convLangRef = useRef('es')
  const ttsRef = useRef(null)
  const mstateRef = useRef(null)
  const maneuverLoaded = useRef(false)
  const resumeRef = useRef(null) // paso a restaurar tras cambiar de entorno
  const epochRef = useRef(0) // cambia al cambiar de cuenta o reiniciar por inactividad
  const sayRef = useRef(null)
  const mctl = useRef(null)
  const maneuverRef = useRef(null)
  const spoken = useRef(new Set())

  const lastActivity = useRef(Date.now())
  const logsRef = useRef(logs)

  // Una cuenta inválida en localStorage cae a General en todo (estado, sesión y logs).
  const account = storedAccount === 'general' ? null : (crewById(storedAccount) ?? null)
  const accountId = account ? storedAccount : 'general'
  const isGeneral = !account
  const accountRef = useRef(accountId)
  accountRef.current = accountId
  useEffect(() => {
    if (storedAccount !== accountId) setAccountId(accountId)
  }, [storedAccount, accountId, setAccountId])
  // Idioma de la cuenta: cada tripulante, el de su perfil (por nacionalidad); la cuenta General, el que se
  // eligió con el botón ES/EN (español al principio).
  const [generalLang, setGeneralLang] = useLocalStorage('moonc.generalLang', 'es')
  const accountLang = account?.preferredLanguage ?? baseLang(generalLang)
  // Idioma de la conversación: el último en que habló la persona (por cuenta); empieza en el de la cuenta.
  const [talkLang, setTalkLang] = useState({})
  const convLang = talkLang[accountId] ?? accountLang
  // Idioma de la pantalla: el del perfil para un tripulante; en la cuenta General, el de la conversación.
  const lang = isGeneral ? convLang : accountLang
  const speechLang = speechLangFor(convLang)
  convLangRef.current = convLang
  // Botón ES/EN de la cuenta General: cambia pantalla y conversación juntas.
  const chooseGeneralLang = useCallback(
    (l) => {
      setGeneralLang(l)
      setTalkLang((t) => {
        if (!('general' in t)) return t
        const next = { ...t }
        delete next.general
        return next
      })
    },
    [setGeneralLang],
  )
  useEffect(() => {
    document.documentElement.lang = lang
    document.title = tr(lang, 'appTitle')
  }, [lang])

  const backend = useBackendStatus()
  // Voz propia de Moon-C (backend /tts, español) con la boca siguiendo el volumen real del audio.
  const mouthRef = useRef(null)
  const setMouth = useCallback((level) => {
    mouthRef.current = level
  }, [])
  const moonVoice = backend.online && backend.info?.voice === 'ready'
  const tts = useSpeechOutput(speechLang, { moonVoice, onMouth: setMouth })
  // Signos y alertas: del backend (una sola fuente para todas las pantallas) o, sin enlace, simulados aquí.
  const localCrew = useCrewSimulation()
  const remoteCrew = useRemoteCrew(backend.online, lang)
  const sim = backend.online && remoteCrew.ready ? remoteCrew : localCrew
  const refreshCrew = remoteCrew.refresh
  const board = useAnnouncements(backend.online)
  const earth = useSyncStatus(backend.online)
  const reportSent = useRef(false)

  const env = ENVIRONMENTS.home // la app usa siempre la sala (modo hogar)
  const envId = env.id
  const audioAvailable = voiceOn && tts.supported && tts.hasVoices && tts.hasSpeakers !== false
  // Un texto que no se puede leer en voz alta en su idioma (`silent`) se muestra aunque los subtítulos estén en automático.
  const showSubs =
    subtitleMode === 'on' ||
    (subtitleMode === 'auto' && !audioAvailable) ||
    Boolean(caption?.cut) ||
    (Boolean(caption?.silent) && subtitleMode !== 'off')

  // kind: 'reply' | 'alert' | 'announcement' (estilo del subtítulo; los anuncios no mueven la boca).
  const say = useCallback(
    (text, speaker = 'Moon-C', spokenLang = convLang, kind = 'reply') => {
      const id = uid()
      const clear = () => setCaption((c) => (c?.id === id ? null : c))
      // Cada texto se lee con una voz de su idioma; si no hay voz para ese idioma, se muestra como subtítulo.
      const speakable = voiceOn && tts.hasSpeakers !== false && tts.canSpeak(spokenLang)
      setCaption({ id, speaker, text, kind, silent: !speakable })
      const readMs = Math.max(4000, text.split(/\s+/).length * 420)
      // Voz según el idioma de ESTA frase (puede ser ru/de sin voz local: entonces solo subtítulos).
      const audible = voiceOn && tts.supported && tts.hasSpeakers !== false && tts.hasVoiceFor(spokenLang)
      if (audible) {
        tts.speak(text, {
          lang: spokenLang,
          onEnd: () => setTimeout(clear, 1200),
          // La voz propia se cortó a la mitad: se muestra el texto completo aunque los subtítulos estén en automático.
          onPartial: () => {
            setCaption({ id, speaker, text, kind, cut: true })
            setTimeout(clear, readMs)
          },
        })
      }
      setTimeout(clear, audible ? readMs * 2 : readMs)
    },
    [voiceOn, tts, convLang],
  )
  sayRef.current = say
  ttsRef.current = tts

  const startManeuver = useCallback(
    (id, entorno, { notify = true, resume = false, auto = null } = {}) => {
      maneuverLoaded.current = false
      if (resume) {
        // Cambio de entorno: se vuelve a montar el maniquí pero se conserva el paso y lo ya hablado.
        resumeRef.current = mstateRef.current?.paso?.id ?? null
      } else {
        spoken.current = new Set()
        reportSent.current = false
        resumeRef.current = null
        setMstate(null)
        setAutoGuide(auto ? { nonce: Date.now(), ...auto, slow: false } : null)
      }
      setWellbeing(null) // una sola guía a la vez: la maniobra de emergencia manda
      setManeuver({ id, entorno: entorno ?? ENV_TO_MANEUVER[envId] ?? 'iss', nonce: Date.now() })
      setMenuOpen(false)
      setMobilePanel(null)
      // Prioridad 2: abrir una guía de emergencia avisa a la tripulación y al oficial médico.
      if (notify && backend.online) {
        api
          .startManeuver({ crewId: account?.crew_id ?? null, maneuver: id, language: lang })
          .then(() => refreshCrew())
          .catch(() => {})
      }
    },
    [envId, backend.online, account, lang, refreshCrew],
  )

  // "Reporta a Tierra": el resumen de la guía se guarda en el backend y queda en cola para la Tierra.
  const sendManeuverReport = () => {
    const pkg = mctl.current?.paqueteTierra?.()
    if (!pkg || !maneuver) return
    if (!backend.online) {
      setMstate((s) => ({ ...s, report: { status: 'offline' } }))
      return
    }
    setMstate((s) => ({ ...s, report: { status: 'sending' } }))
    api
      .sendManeuverReport({ crewId: account?.crew_id ?? null, maneuver: maneuver.id, summary: toReportSummary(pkg) })
      .then((r) => setMstate((s) => ({ ...s, report: { status: r.synced ? 'synced' : 'queued', id: r.id } })))
      .catch(() => setMstate((s) => ({ ...s, report: { status: 'error' } })))
  }
  const stopManeuver = useCallback(() => {
    maneuverRef.current = null
    setManeuver(null)
    setMstate(null)
    setAutoGuide(null)
  }, [])

  // Guía de bienestar: solo si no hay una maniobra 3D abierta (la emergencia manda).
  const openWellbeing = useCallback((mode, lead = 1500) => {
    if (maneuverRef.current) return
    setWellbeing({ mode, nonce: Date.now(), lead })
    setMenuOpen(false)
    setMobilePanel(null)
  }, [])
  const closeWellbeing = useCallback(() => {
    setWellbeing(null)
    ttsRef.current?.cancel()
  }, [])
  const wbSpeak = useCallback((text) => sayRef.current?.(text, 'Moon-C', convLangRef.current), [])
  const wbStopSpeak = useCallback(() => ttsRef.current?.cancel(), [])

  // Avance de la maniobra (lo reporta el modelo 3D): paso, conteo, tiempo. Moon-C lee cada paso una sola vez.
  const maneuverEvents = useRef({})
  mstateRef.current = mstate
  autoGuideRef.current = autoGuide
  maneuverEvents.current = {
    onPaso: (index, paso, pasos) => {
      setMstate((s) => ({ ...s, index, paso, pasos, conteo: 0, tiempo: null }))
      if (resumeRef.current) return // remontaje por cambio de entorno: onReady restaura el paso sin repetir la voz
      if (!spoken.current.has(paso.id)) {
        spoken.current.add(paso.id)
        // Los pasos vienen de Model3D en el idioma de la pantalla; "Reporta a Tierra" no afirma un envío que no ocurrió.
        const text = paso.id === 'reporte' && !backend.online ? tr(lang, 'reportOffline') : paso.texto
        say(`${paso.titulo}. ${text}`, 'Moon-C', lang)
      }
      if (paso.id === 'reporte' && !reportSent.current) {
        reportSent.current = true
        sendManeuverReport()
      }
    },
    onConteo: (conteo, total) => setMstate((s) => ({ ...s, conteo, total })),
    onTiempo: (tiempo) => setMstate((s) => (s?.tiempo === tiempo ? s : { ...s, tiempo })),
    onReady: (m) => {
      maneuverLoaded.current = true
      const wasSolo = Boolean(mstateRef.current?.soloManos)
      if (resumeRef.current && wasSolo) m.soloManos = true
      setMstate((s) => ({ ...s, soloManos: m.soloManos }))
      const target = resumeRef.current
      resumeRef.current = null
      if (!target) return
      if (m.pasos.some((p) => p.id === target)) m.ir(target)
      else if (m.paso && !spoken.current.has(m.paso.id)) {
        spoken.current.add(m.paso.id)
        say(`${m.paso.titulo}. ${m.paso.texto}`, 'Moon-C', lang)
      }
    },
    onError: () => {
      const auto = autoGuideRef.current
      stopManeuver()
      // Sin guía no hay quien hable: se lee y se muestra la respuesta completa (si no se había leído ya).
      if (auto && !auto.slow) say(auto.reply, 'Moon-C', auto.lang)
      appendLog(accountRef.current, { who: 'system', text: tr(lang, 'guideFailed') })
    },
  }

  const appendLog = useCallback((key, entry) => {
    setLogs((l) => ({ ...l, [key]: [...(l[key] ?? []), { id: uid(), at: Date.now(), ...entry }] }))
  }, [])

  // Al cambiar de cuenta o reiniciar por inactividad: lo que está en curso de la sesión saliente se descarta.
  const cancelTts = tts.cancel
  const dropContext = useCallback(
    (id) => {
      epochRef.current += 1 // invalida las respuestas en vuelo (send compara tras el await)
      cancelTts()
      setCaption(null)
      setBusy(false)
      stopManeuver()
      setWellbeing(null)
      setTalkLang((t) => {
        if (!(id in t)) return t
        const next = { ...t }
        delete next[id]
        return next
      })
    },
    [cancelTts, stopManeuver],
  )

  const send = useCallback(
    async (message) => {
      const key = accountId
      const epoch = epochRef.current
      const stale = () => epochRef.current !== epoch
      lastActivity.current = Date.now()
      appendLog(key, { who: 'user', name: account?.name ?? 'General', text: message })
      setSuggestions((s) => ({ ...s, [key]: [] }))
      const asked = explicitManeuver(message)
      if (asked) {
        appendLog(key, { who: 'assistant', name: 'Moon-C', text: tr(lang, 'guideOpening', { name: maneuverTitle(asked, lang) }) })
        startManeuver(asked)
        return
      }
      setBusy(true)
      try {
        // El mensaje manda: si se nota otro idioma, se contesta (y se escucha) en ese.
        const msgLang = detectLanguage(message) ?? convLang
        let res = null
        if (backend.online) {
          try {
            res = await askBackend({
              message,
              crewId: account?.crew_id ?? null,
              sessionId: sessionFor(key),
              language: msgLang,
            })
          } catch {
            backend.markOffline()
          }
        }
        if (stale()) return // la cuenta cambió con la respuesta en vuelo: se descarta
        if (!res) {
          await new Promise((r) => setTimeout(r, 350))
          if (stale()) return
          res = askLocal({ message, language: msgLang })
        }
        lastActivity.current = Date.now()
        appendLog(key, {
          who: 'assistant',
          name: 'Moon-C',
          text: res.reply,
          protocol: res.protocol,
          category: res.category,
          via: res.via,
          aiUsed: Boolean(res.ai_used), // written by the local AI: the log marks it (AI disclosure)
          maneuver: suggestedManeuver({ protocol: res.protocol, message }),
        })
        setSuggestions((s) => ({ ...s, [key]: res.suggestions ?? [] }))
        const replyLang = res.language ?? msgLang
        setTalkLang((t) => (t[key] === replyLang ? t : { ...t, [key]: replyLang }))
        // Guía 3D solo con palabras inequívocas (ver autoOpenManeuver); si no, queda el botón en la bitácora.
        // Con una guía ya abierta no se reemplaza. El backend ya avisó a la tripulación cuando hay cuenta.
        const guide = autoOpenManeuver({ category: res.category, protocol: res.protocol, message })
        // Una emergencia directa (protocolo) cierra la guía de bienestar; la guía 3D o el texto toman el relevo.
        const emergency = res.category === 'emergency' || Boolean(res.protocol)
        if (emergency) setWellbeing(null)
        const wbGuide = emergency ? null : guideFromResponse(res)
        if (res.measurement_recorded && backend.online) refreshCrew() // la alerta aparece al instante en todas las cuentas
        if (guide && !maneuverRef.current) {
          startManeuver(guide, undefined, { notify: !account, auto: { reply: res.reply, lang: replyLang } })
          say(replyIntro(res.reply, res.protocol), 'Moon-C', replyLang) // la frase de emergencia; luego habla la guía
        } else {
          say(res.reply, 'Moon-C', replyLang)
        }
        if (wbGuide) openWellbeing(wbGuide, 5000) // deja hablar a Moon-C antes del primer aviso
        if (res.category === 'emergency' && account) {
          sim.reportFromChat(account.crew_id, res.protocol?.title?.split(':')[0] ?? tr(lang, 'alertAnEmergency'), res.protocol?.name)
        }
      } catch {
        if (!stale()) appendLog(key, { who: 'system', text: tr(lang, 'answerFailed') })
      } finally {
        if (!stale()) setBusy(false)
      }
    },
    [accountId, account, lang, convLang, appendLog, backend, say, sim, startManeuver, openWellbeing, refreshCrew],
  )

  const mic = useSpeechInput(speechLang, send)

  const wellbeingBetter = () => {
    const text = afterText(convLang)
    closeWellbeing()
    appendLog(accountId, { who: 'assistant', name: 'Moon-C', text })
    setSuggestions((s) => ({ ...s, [accountId]: afterSuggestions(convLang) }))
    say(text, 'Moon-C', convLang)
  }
  // "Sigo mal": el backend cuenta las rondas y decide si escala; la guía queda en pausa hasta su respuesta.
  const wellbeingWorse = () => send(tr(convLang, 'wbWorseMsg'))

  // Privacidad: tras 10 min sin actividad se borra la conversación aquí y en el backend.
  useEffect(() => {
    logsRef.current = logs
  }, [logs])
  useEffect(() => {
    maneuverRef.current = maneuver
  }, [maneuver])
  useEffect(() => {
    const t = setInterval(() => {
      const current = logsRef.current[accountId] ?? []
      if (Date.now() - lastActivity.current < CHAT_TTL_MS || !current.some((e) => e.who !== 'system')) return
      // Una guía abierta cuenta como actividad: no se cierra en pleno procedimiento.
      if (maneuverRef.current) {
        lastActivity.current = Date.now()
        return
      }
      dropContext(accountId)
      api.resetSession(sessionFor(accountId)).catch(() => {})
      setLogs((l) => ({
        ...l,
        [accountId]: [{ id: uid(), at: Date.now(), who: 'system', text: tr(lang, 'chatCleared') }],
      }))
      setSuggestions((s) => ({ ...s, [accountId]: [] }))
    }, 30000)
    return () => clearInterval(t)
  }, [accountId, lang, dropContext])

  // Guía abierta sola: si el modelo 3D no carga en ~8 s, se lee y se muestra la respuesta completa.
  const autoNonce = autoGuide?.nonce
  useEffect(() => {
    if (!autoNonce) return undefined
    const t = setTimeout(() => {
      const auto = autoGuideRef.current
      if (maneuverLoaded.current || !auto) return
      setAutoGuide((g) => (g ? { ...g, slow: true } : g))
      sayRef.current?.(auto.reply, 'Moon-C', auto.lang)
    }, 8000)
    return () => clearTimeout(t)
  }, [autoNonce])

  // Anunciar alertas nuevas (voz y/o subtítulos) a la cuenta que corresponda.
  const announced = useRef(new Set())
  useEffect(() => {
    for (const a of sim.alerts) {
      if (announced.current.has(a.id)) continue
      announced.current.add(a.id)
      if (isGeneral || a.crewId === accountId) say(alertText(a, lang), tr(lang, 'speakerAlert'), lang, 'alert')
    }
  }, [sim.alerts, isGeneral, accountId, lang, say])

  // Moon-C saluda al abrir la app y al cambiar de cuenta.
  useEffect(() => {
    setGreeting(true)
    const t = setTimeout(() => setGreeting(false), 2200)
    return () => clearTimeout(t)
  }, [accountId])

  // Al cambiar de cuenta se cierra cualquier vista de emergencia abierta.
  const switchAccount = useCallback(
    (requested) => {
      const id = requested === 'general' || crewById(requested) ? requested : 'general'
      setEmergencyView(null)
      setVitalDetail(null)
      setMobilePanel(null)
      const prev = accountId
      if (prev === id) return // misma cuenta: no hay sesión nueva
      dropContext(prev)
      setAccountId(id)
      // Privacidad: la conversación de la cuenta anterior se borra aquí y en el backend.
      setLogs((l) => {
        const next = { ...l }
        delete next[prev]
        return next
      })
      setSuggestions((s) => ({ ...s, [prev]: [] }))
      api.resetSession(sessionFor(prev)).catch(() => {})
      const crew = crewById(id)
      // Pulsera simulada: identifica al tripulante y empieza un contexto limpio para esta sesión.
      if (crew) api.identify({ braceletId: crew.bracelet_id, sessionId: sessionFor(id) }).catch(() => {})
      lastActivity.current = Date.now()
      appendLog(id, {
        who: 'system',
        text: tr(crew?.preferredLanguage ?? baseLang(generalLang), 'sessionStarted', { name: crew ? crew.name : 'General' }),
      })
    },
    [accountId, setAccountId, appendLog, dropContext, generalLang],
  )

  const openEmergency = (crewId) => {
    setEmergencyView(crewId)
    setMobilePanel('right')
    if (accessLog[crewId]) return
    setAccessLog((l) => ({ ...l, [crewId]: Date.now() }))
    // Queda constancia en el backend de quién abrió los datos del tripulante, cuándo y por qué alerta.
    if (backend.online) {
      const alert = sim.activeAlerts.find((a) => a.crewId === crewId)
      api
        .logAccess({ crewId, viewer: 'general', reason: alert?.id ?? null })
        .then((entry) => setAccessLog((l) => ({ ...l, [crewId]: Date.parse(entry.at) })))
        .catch(() => {})
    }
  }

  const resolveEmergency = (crewId) => {
    sim.resolve(crewId)
    setEmergencyView(null)
    setAccessLog((l) => {
      const next = { ...l }
      delete next[crewId]
      return next
    })
  }

  const postAnnouncement = ({ text, priority, readAloud }) => {
    board.post({ text, priority })
    // Se lee con la voz del idioma en que está escrito.
    if (readAloud) say(text, tr(lang, 'speakerAnnouncement'), detectLanguage(text) ?? lang, 'announcement')
  }

  const member = account ? sim.members[account.crew_id] : null
  const modelStatus = member
    ? worstStatus(INDICATORS.map((i) => classify(i, member.values[i])))
    : sim.activeAlerts.length
      ? 'urgent'
      : 'normal'
  const talking = tts.speaking || Boolean(caption && caption.kind !== 'announcement')
  const linkDown = backend.checked && !backend.online
  const assistantMood = mic.listening
    ? 'escuchando'
    : busy
      ? 'pensando'
      : talking
        ? 'hablando'
        : modelStatus === 'urgent'
          ? 'alerta'
          : linkDown
            ? 'sin_enlace'
            : greeting
              ? 'saludo'
              : 'atenta'
  const visibleAlerts = sim.activeAlerts.filter((a) => isGeneral || a.crewId === accountId)
  const emergencyAlerts = emergencyView ? sim.activeAlerts.filter((a) => a.crewId === emergencyView) : []
  const detailAllowed =
    vitalDetail && (isGeneral ? sim.inEmergency(vitalDetail.crewId) : vitalDetail.crewId === accountId)
  const closeDetail = useCallback(() => setVitalDetail(null), [])
  const navDetail = useCallback((indicator) => setVitalDetail((d) => (d ? { ...d, indicator } : d)), [])
  const log = logs[accountId] ?? []
  const chips = suggestions[accountId]?.length
    ? suggestions[accountId]
    : log.length
      ? []
      : isGeneral
        ? QUICK_GENERAL[baseLang(lang)]
        : QUICK_CREW[baseLang(lang)]

  return (
    <div className={`app env-${env.id}`}>
      <Scene
        maneuver={maneuver}
        ctrlRef={mctl}
        onManeuverEvent={{
          onPaso: (...a) => maneuverEvents.current.onPaso(...a),
          onConteo: (...a) => maneuverEvents.current.onConteo(...a),
          onTiempo: (...a) => maneuverEvents.current.onTiempo(...a),
          onReady: (...a) => maneuverEvents.current.onReady(...a),
          onError: (...a) => maneuverEvents.current.onError(...a),
        }}
        envId={env.id}
        talking={talking}
        mood={assistantMood}
        mouthRef={mouthRef}
        language={lang}
      />

      <TopBar
        env={env}
        account={account}
        backendOnline={backend.online}
        earth={earth.status}
        audioAvailable={audioAvailable}
        showSubs={showSubs}
        onMenu={() => setMenuOpen(true)}
        mobilePanel={mobilePanel}
        setMobilePanel={setMobilePanel}
        isGeneral={isGeneral}
        lang={lang}
        onLanguage={chooseGeneralLang}
      />

      <AiMark lang={lang} />

      <AlertBanner alerts={visibleAlerts} isGeneral={isGeneral} onOpen={openEmergency} onAck={sim.acknowledge} lang={lang} />

      <aside className={`panel panel-left ${maneuver || wellbeing || mobilePanel === 'left' ? 'mobile-open' : ''}`}>
        {maneuver ? (
          <ManeuverPanel
            id={maneuver.id}
            entorno={maneuver.entorno}
            state={mstate}
            ctrlRef={mctl}
            onEnv={(entorno) => {
              // Sin remontar el maniquí si la guía ya lo permite (conserva paso, conteo y tiempo).
              if (mctl.current?.cambiarEntorno?.(entorno)) setManeuver((m) => (m ? { ...m, entorno } : m))
              else startManeuver(maneuver.id, entorno, { notify: false, resume: true })
            }}
            onSoloManos={(v) => {
              if (mctl.current) mctl.current.soloManos = v
              setMstate((s) => ({ ...s, soloManos: v }))
            }}
            onClose={stopManeuver}
            lang={lang}
            notice={autoGuide}
          />
        ) : wellbeing ? (
          <WellbeingGuide
            key={wellbeing.nonce}
            mode={wellbeing.mode}
            lang={convLang}
            leadMs={wellbeing.lead}
            onSpeak={wbSpeak}
            onStopSpeak={wbStopSpeak}
            onBetter={wellbeingBetter}
            onWorse={wellbeingWorse}
            onClose={closeWellbeing}
          />
        ) : (
          <Announcements
            items={board.items}
            canPost={isGeneral}
            onPost={postAnnouncement}
            limit={isGeneral ? undefined : 3}
            lang={lang}
          />
        )}
      </aside>

      <aside className={`panel panel-right ${mobilePanel === 'right' ? 'mobile-open' : ''}`}>
        {isGeneral ? (
          emergencyView && emergencyAlerts.length ? (
            <EmergencyDetail
              crewId={emergencyView}
              member={sim.members[emergencyView]}
              alerts={emergencyAlerts}
              accessAt={accessLog[emergencyView] ?? Date.now()}
              onBack={() => setEmergencyView(null)}
              onResolve={resolveEmergency}
              onSelectVital={(indicator) => setVitalDetail({ crewId: emergencyView, indicator })}
              lang={lang}
            />
          ) : (
            <CrewOverview members={sim.members} activeAlerts={sim.activeAlerts} onOpen={openEmergency} lang={lang} />
          )
        ) : (
          <VitalsPanel
            member={member}
            title={tr(lang, 'mySigns')}
            subtitle={tr(lang, 'vitalsSubtitle', { name: account.name, bracelet: account.bracelet_id })}
            onSelect={(indicator) => setVitalDetail({ crewId: account.crew_id, indicator })}
            lang={lang}
          />
        )}
      </aside>

      <div className="bottom">
        {showSubs && <Subtitles caption={caption} interim={mic.listening ? mic.interim : ''} lang={lang} />}
        <ChatDock
          log={log}
          suggestions={chips}
          busy={busy}
          onSend={send}
          onManeuver={startManeuver}
          mic={mic}
          lang={lang}
          placeholder={isGeneral ? tr(lang, 'placeholderGeneral') : tr(lang, 'placeholderCrew', { name: account.name })}
        />
      </div>

      {detailAllowed && (
        <VitalDetail
          crew={crewById(vitalDetail.crewId)}
          member={sim.members[vitalDetail.crewId]}
          indicator={vitalDetail.indicator}
          onClose={closeDetail}
          onNav={navDetail}
          lang={lang}
        />
      )}

      <MenuDrawer
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        accountId={accountId}
        setAccountId={switchAccount}
        inEmergency={sim.inEmergency}
        voiceOn={voiceOn}
        setVoiceOn={(v) => {
          setVoiceOn(v)
          if (!v) tts.cancel()
        }}
        subtitleMode={subtitleMode}
        setSubtitleMode={setSubtitleMode}
        audio={tts}
        onManeuver={startManeuver}
        onWellbeing={(mode) => openWellbeing(mode)}
        online={backend.online}
        lang={lang}
        onLanguage={chooseGeneralLang}
        sync={earth.status}
        onDataChanged={() => {
          earth.refresh()
          refreshCrew()
        }}
        onSimulate={(crewId, kind) => {
          sim.triggerEmergency(crewId, kind)
          setMenuOpen(false)
        }}
        onReset={() => {
          sim.resolve()
          setEmergencyView(null)
          setAccessLog({})
        }}
      />
    </div>
  )
}
