import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ManeuverPanel from './components/ManeuverPanel'
import { ENV_TO_MANEUVER, explicitManeuver, maneuverTitle, suggestedManeuver, toReportSummary } from './lib/maneuvers'
import Scene from './components/Scene'
import TopBar from './components/TopBar'
import MenuDrawer from './components/MenuDrawer'
import VitalsPanel from './components/VitalsPanel'
import CrewOverview, { EmergencyDetail } from './components/CrewOverview'
import Announcements from './components/Announcements'
import AlertBanner from './components/AlertBanner'
import { ALERT_LANGUAGE, alertText, reportedText } from './lib/alerts'
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
import { askBackend, askLocal, detectLanguage } from './lib/assistant'
import { api } from './lib/api'
import { speechLangFor } from './config'
import { I18nContext, makeI18n, toLanguage, translate } from './i18n'

let seq = 0
const uid = () => `${Date.now()}-${++seq}`
// Cada carga de la app es una sesión de chat propia: el contexto no se comparte entre tablets.
const DEVICE_ID = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`)
  .replace(/[^a-z0-9]/gi, '')
  .slice(0, 12)
const sessionFor = (accountId) => `${DEVICE_ID}-${accountId}`
// Igual que el backend (MOON_C_SESSION_TTL_S): la conversación se borra tras 10 min sin actividad.
const CHAT_TTL_MS = 10 * 60 * 1000
const QUICK_GENERAL = {
  es: ['¿Cómo mido la saturación?', 'Emergencia médica', 'Hola, Moon-C'],
  en: ['How do I measure my oxygen saturation?', 'Medical emergency', 'Hello, Moon-C'],
}
const QUICK_CREW = {
  es: ['¿Cómo mido mi temperatura?', 'Me siento raro', 'Dormí muy poco'],
  en: ['How do I measure my temperature?', 'I feel weird', 'I barely slept'],
}

export default function App() {
  const [accountId, setAccountId] = useLocalStorage('moonc.account', 'general')
  const [generalLang, setGeneralLang] = useLocalStorage('moonc.generalLang', 'es')
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
  const mctl = useRef(null)
  const spoken = useRef(new Set())

  const lastActivity = useRef(Date.now())
  const logsRef = useRef(logs)

  const account = accountId === 'general' ? null : crewById(accountId)
  const isGeneral = !account
  // Idioma de la pantalla, el chat y la voz. Cada tripulante usa el de su perfil (por nacionalidad);
  // la cuenta General cambia con el botón ES/EN, o sola cuando le escriben o hablan en el otro idioma.
  // Las alertas van siempre en inglés (src/lib/alerts.js).
  const lang = account?.preferredLanguage ?? toLanguage(generalLang)
  const i18n = useMemo(() => makeI18n(lang), [lang])
  const { t } = i18n
  const speechLang = speechLangFor(lang)

  const backend = useBackendStatus()
  // Voz propia de Moon-C (backend /tts, español) con la boca siguiendo el volumen real del audio.
  const mouthRef = useRef(null)
  const setMouth = useCallback((level) => {
    mouthRef.current = level
  }, [])
  const moonVoiceReady = backend.online && backend.info?.voice === 'ready'
  const tts = useSpeechOutput(lang, { moonVoice: moonVoiceReady, onMouth: setMouth })
  // Signos y alertas: del backend (una sola fuente para todas las pantallas) o, sin enlace, simulados aquí.
  const localCrew = useCrewSimulation()
  const remoteCrew = useRemoteCrew(backend.online)
  const sim = backend.online && remoteCrew.ready ? remoteCrew : localCrew
  const refreshCrew = remoteCrew.refresh
  const board = useAnnouncements(backend.online)
  const earth = useSyncStatus(backend.online)
  const reportSent = useRef(false)

  const env = ENVIRONMENTS.home // la app usa siempre la sala (modo hogar)
  const envId = env.id
  const audioAvailable = voiceOn && tts.supported && tts.hasVoices && tts.hasSpeakers !== false
  const showSubs = subtitleMode === 'on' || (subtitleMode === 'auto' && !audioAvailable)

  useEffect(() => {
    document.documentElement.lang = lang
    document.title = t('app.title')
  }, [lang, t])

  /**
   * Moon-C dice un texto (voz y/o subtítulo). Cada texto se lee con una voz de su idioma: las respuestas
   * en el de la respuesta, las alertas en inglés. Si no hay voz para ese idioma, se muestra el subtítulo
   * aunque el audio esté activo.
   */
  const say = useCallback(
    (text, { speaker = 'Moon-C', kind = 'reply', lang: textLang = lang } = {}) => {
      const id = uid()
      const clear = () => setCaption((c) => (c?.id === id ? null : c))
      const speakable = voiceOn && tts.hasSpeakers !== false && tts.canSpeak(textLang)
      setCaption({ id, speaker, kind, text, lang: textLang, silent: !speakable })
      const readMs = Math.max(4000, text.split(/\s+/).length * 420)
      if (speakable) tts.speak(text, { lang: textLang, onEnd: () => setTimeout(clear, 1200) })
      setTimeout(clear, speakable ? readMs * 2 : readMs)
    },
    [voiceOn, tts, lang],
  )

  const startManeuver = useCallback(
    (id, entorno) => {
      spoken.current = new Set()
      reportSent.current = false
      setMstate(null)
      setManeuver({ id, entorno: entorno ?? ENV_TO_MANEUVER[envId] ?? 'iss', nonce: Date.now() })
      setMenuOpen(false)
      setMobilePanel(null)
      // Prioridad 2: abrir una guía de emergencia avisa a la tripulación y al oficial médico.
      if (backend.online) {
        api
          .startManeuver({ crewId: account?.crew_id ?? null, maneuver: id })
          .then(() => refreshCrew())
          .catch(() => {})
      }
    },
    [envId, backend.online, account, refreshCrew],
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
    setManeuver(null)
    setMstate(null)
  }, [])

  // Avance de la maniobra (lo reporta el modelo 3D): paso, conteo, tiempo. Moon-C lee cada paso una sola vez.
  const maneuverEvents = useRef({})
  maneuverEvents.current = {
    onPaso: (index, paso, pasos) => {
      setMstate((s) => ({ ...s, index, paso, pasos, conteo: 0, tiempo: null }))
      if (!spoken.current.has(paso.id)) {
        spoken.current.add(paso.id)
        say(`${paso.titulo}. ${paso.texto}`)
      }
      if (paso.id === 'reporte' && !reportSent.current) {
        reportSent.current = true
        sendManeuverReport()
      }
    },
    onConteo: (conteo, total) => setMstate((s) => ({ ...s, conteo, total })),
    onTiempo: (tiempo) => setMstate((s) => (s?.tiempo === tiempo ? s : { ...s, tiempo })),
    onReady: (m) => setMstate((s) => ({ ...s, soloManos: m.soloManos })),
    onError: () => {
      setManeuver(null)
      setMstate(null)
    },
  }

  const appendLog = useCallback((key, entry) => {
    setLogs((l) => ({ ...l, [key]: [...(l[key] ?? []), { id: uid(), at: Date.now(), ...entry }] }))
  }, [])

  const send = useCallback(
    async (message) => {
      const key = accountId
      lastActivity.current = Date.now()
      appendLog(key, { who: 'user', name: account?.name ?? 'General', text: message })
      setSuggestions((s) => ({ ...s, [key]: [] }))
      // Cuenta General: Moon-C contesta en el idioma del mensaje (si se nota) y la pantalla cambia con ella.
      // Los tripulantes siempre en el idioma de su perfil.
      const messageLang = isGeneral ? (detectLanguage(message) ?? lang) : lang
      const asked = explicitManeuver(message)
      if (asked) {
        if (isGeneral) setGeneralLang(messageLang)
        appendLog(key, {
          who: 'assistant',
          name: 'Moon-C',
          text: translate(messageLang, 'chat.openingGuide', { title: maneuverTitle(asked, messageLang) }),
        })
        startManeuver(asked)
        return
      }
      setBusy(true)
      let res = null
      if (backend.online) {
        try {
          res = await askBackend({
            message,
            crewId: account?.crew_id ?? null,
            sessionId: sessionFor(key),
            language: lang,
            autoLanguage: isGeneral,
          })
        } catch {
          backend.markOffline()
        }
      }
      if (!res) {
        await new Promise((r) => setTimeout(r, 350))
        res = askLocal({ message, language: messageLang })
      }
      const replyLang = toLanguage(res.language ?? messageLang)
      if (isGeneral && replyLang !== lang) setGeneralLang(replyLang)
      lastActivity.current = Date.now()
      appendLog(key, {
        who: 'assistant',
        name: 'Moon-C',
        text: res.reply,
        protocol: res.protocol,
        category: res.category,
        via: res.via,
        maneuver: suggestedManeuver({ protocol: res.protocol, message }),
      })
      setSuggestions((s) => ({ ...s, [key]: res.suggestions ?? [] }))
      setBusy(false)
      say(res.reply, { lang: replyLang })
      if (res.category === 'emergency' && account) {
        sim.reportFromChat(account.crew_id, reportedText(res.protocol?.name)) // la alerta va en inglés
      }
    },
    [accountId, account, isGeneral, lang, appendLog, backend, say, sim, startManeuver, setGeneralLang],
  )

  const mic = useSpeechInput(speechLang, send)

  // Privacidad: tras 10 min sin actividad se borra la conversación aquí y en el backend.
  useEffect(() => {
    logsRef.current = logs
  }, [logs])
  useEffect(() => {
    const timer = setInterval(() => {
      const current = logsRef.current[accountId] ?? []
      if (Date.now() - lastActivity.current < CHAT_TTL_MS || !current.some((e) => e.who !== 'system')) return
      api.resetSession(sessionFor(accountId)).catch(() => {})
      setLogs((l) => ({
        ...l,
        [accountId]: [{ id: uid(), at: Date.now(), who: 'system', key: 'chat.cleared' }],
      }))
      setSuggestions((s) => ({ ...s, [accountId]: [] }))
    }, 30000)
    return () => clearInterval(timer)
  }, [accountId])

  // Anunciar alertas nuevas (voz y/o subtítulos) a la cuenta que corresponda. Siempre en inglés.
  const announced = useRef(new Set())
  useEffect(() => {
    for (const a of sim.alerts) {
      if (announced.current.has(a.id)) continue
      announced.current.add(a.id)
      if (isGeneral || a.crewId === accountId) say(alertText(a), { speaker: 'Alert', kind: 'alert', lang: ALERT_LANGUAGE })
    }
  }, [sim.alerts, isGeneral, accountId, say])

  // Moon-C saluda al abrir la app y al cambiar de cuenta.
  useEffect(() => {
    setGreeting(true)
    const timer = setTimeout(() => setGreeting(false), 2200)
    return () => clearTimeout(timer)
  }, [accountId])

  // Al cambiar de cuenta se cierra cualquier vista de emergencia abierta.
  const switchAccount = useCallback(
    (id) => {
      const prev = accountId
      setAccountId(id)
      setEmergencyView(null)
      setVitalDetail(null)
      setMobilePanel(null)
      if (prev !== id) {
        // Privacidad: la conversación de la cuenta anterior se borra aquí y en el backend.
        setLogs((l) => {
          const next = { ...l }
          delete next[prev]
          return next
        })
        setSuggestions((s) => ({ ...s, [prev]: [] }))
        api.resetSession(sessionFor(prev)).catch(() => {})
      }
      const crew = crewById(id)
      // Pulsera simulada: identifica al tripulante y empieza un contexto limpio para esta sesión.
      if (crew) api.identify({ braceletId: crew.bracelet_id, sessionId: sessionFor(id) }).catch(() => {})
      lastActivity.current = Date.now()
      appendLog(id, { who: 'system', key: 'chat.sessionStarted', vars: { name: crew ? crew.name : 'General' } })
    },
    [accountId, setAccountId, appendLog],
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

  // Los anuncios se leen con la voz del idioma en que están escritos.
  const postAnnouncement = ({ text, priority, readAloud }) => {
    board.post({ text, priority })
    if (readAloud) say(text, { speaker: t('speaker.announcement'), kind: 'announcement', lang: detectLanguage(text) ?? lang })
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
      : (isGeneral ? QUICK_GENERAL : QUICK_CREW)[lang]
  // Un texto que no se puede leer en voz alta en su idioma se muestra aunque los subtítulos estén en automático.
  const showCaption = showSubs || (caption?.silent && subtitleMode !== 'off')

  return (
    <I18nContext.Provider value={i18n}>
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
          onLanguage={setGeneralLang}
        />

        <AlertBanner alerts={visibleAlerts} isGeneral={isGeneral} onOpen={openEmergency} onAck={sim.acknowledge} />

        <aside className={`panel panel-left ${maneuver || mobilePanel === 'left' ? 'mobile-open' : ''}`}>
          {maneuver ? (
            <ManeuverPanel
              id={maneuver.id}
              entorno={maneuver.entorno}
              state={mstate}
              ctrlRef={mctl}
              onEnv={(entorno) => startManeuver(maneuver.id, entorno)}
              onSoloManos={(v) => {
                if (mctl.current) mctl.current.soloManos = v
                setMstate((s) => ({ ...s, soloManos: v }))
              }}
              onClose={stopManeuver}
            />
          ) : (
            <Announcements items={board.items} canPost={isGeneral} onPost={postAnnouncement} limit={isGeneral ? undefined : 3} />
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
              />
            ) : (
              <CrewOverview members={sim.members} activeAlerts={sim.activeAlerts} onOpen={openEmergency} />
            )
          ) : (
            <VitalsPanel
              member={member}
              subtitle={t('vitals.subtitle', { name: account.name, bracelet: account.bracelet_id })}
              onSelect={(indicator) => setVitalDetail({ crewId: account.crew_id, indicator })}
            />
          )}
        </aside>

        <div className="bottom">
          {showCaption && <Subtitles caption={caption} interim={mic.listening ? mic.interim : ''} />}
          <ChatDock
            log={log}
            suggestions={chips}
            busy={busy}
            onSend={send}
            onManeuver={startManeuver}
            mic={mic}
            placeholder={isGeneral ? t('chat.placeholderGeneral') : t('chat.placeholderCrew', { name: account.name })}
          />
        </div>

        {detailAllowed && (
          <VitalDetail
            crew={crewById(vitalDetail.crewId)}
            member={sim.members[vitalDetail.crewId]}
            indicator={vitalDetail.indicator}
            onClose={closeDetail}
            onNav={navDetail}
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
          online={backend.online}
          onLanguage={setGeneralLang}
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
    </I18nContext.Provider>
  )
}
