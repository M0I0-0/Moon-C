import { useCallback, useEffect, useRef, useState } from 'react'
import ManeuverPanel from './components/ManeuverPanel'
import { ENV_TO_MANEUVER, MANIOBRAS, explicitManeuver, suggestedManeuver, toReportSummary } from './lib/maneuvers'
import Scene from './components/Scene'
import TopBar from './components/TopBar'
import MenuDrawer from './components/MenuDrawer'
import VitalsPanel from './components/VitalsPanel'
import CrewOverview, { EmergencyDetail } from './components/CrewOverview'
import Announcements from './components/Announcements'
import AlertBanner from './components/AlertBanner'
import { alertText } from './lib/alerts'
import ChatDock from './components/ChatDock'
import Subtitles from './components/Subtitles'
import VitalDetail from './components/VitalDetail'
import { ENVIRONMENTS } from './data/environments'
import { useAnnouncements } from './hooks/useAnnouncements'
import { useSyncStatus } from './hooks/useSyncStatus'
import { INDICATORS, STATUS_LABEL, classify, crewById, worstStatus } from './data/manual'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useCrewSimulation } from './hooks/useCrewSimulation'
import { useRemoteCrew } from './hooks/useRemoteCrew'
import { useSpeechInput, useSpeechOutput } from './hooks/useSpeech'
import { useBackendStatus } from './hooks/useBackendStatus'
import { askBackend, askLocal } from './lib/assistant'
import { api } from './lib/api'
import { speechLangFor } from './config'

let seq = 0
const uid = () => `${Date.now()}-${++seq}`
// Cada carga de la app es una sesión de chat propia: el contexto no se comparte entre tablets.
const DEVICE_ID = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`)
  .replace(/[^a-z0-9]/gi, '')
  .slice(0, 12)
const sessionFor = (accountId) => `${DEVICE_ID}-${accountId}`
// Igual que el backend (MOON_C_SESSION_TTL_S): la conversación se borra tras 10 min sin actividad.
const CHAT_TTL_MS = 10 * 60 * 1000
const QUICK_GENERAL = ['¿Cómo mido la saturación?', 'Emergencia médica', 'Hola, Moon-C']
const QUICK_CREW = {
  es: ['¿Cómo mido mi temperatura?', 'Me siento raro', 'Dormí muy poco'],
  en: ['How do I measure my temperature?', 'I feel weird', 'I barely slept'],
}

export default function App() {
  const [accountId, setAccountId] = useLocalStorage('moonc.account', 'general')
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
  // Chat y voz en el idioma del tripulante (la cuenta General usa español).
  const lang = account?.preferredLanguage ?? 'es'
  const speechLang = speechLangFor(lang)

  const tts = useSpeechOutput(speechLang)
  const backend = useBackendStatus()
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
  const showSubs = subtitleMode === 'on' || (subtitleMode === 'auto' && !audioAvailable)

  const say = useCallback(
    (text, speaker = 'Moon-C') => {
      const id = uid()
      const clear = () => setCaption((c) => (c?.id === id ? null : c))
      setCaption({ id, speaker, text })
      const readMs = Math.max(4000, text.split(/\s+/).length * 420)
      if (audioAvailable) tts.speak(text, { onEnd: () => setTimeout(clear, 1200) })
      setTimeout(clear, audioAvailable ? readMs * 2 : readMs)
    },
    [audioAvailable, tts],
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
      const asked = explicitManeuver(message)
      if (asked) {
        appendLog(key, { who: 'assistant', name: 'Moon-C', text: `Abro la guía 3D: ${MANIOBRAS[asked].titulo}.` })
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
          })
        } catch {
          backend.markOffline()
        }
      }
      if (!res) {
        await new Promise((r) => setTimeout(r, 350))
        res = askLocal({ message, language: lang })
      }
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
      say(res.reply)
      if (res.category === 'emergency' && account) {
        sim.reportFromChat(account.crew_id, res.protocol?.title?.split(':')[0] ?? 'una emergencia')
      }
    },
    [accountId, account, lang, appendLog, backend, say, sim, startManeuver],
  )

  const mic = useSpeechInput(speechLang, send)

  // Privacidad: tras 10 min sin actividad se borra la conversación aquí y en el backend.
  useEffect(() => {
    logsRef.current = logs
  }, [logs])
  useEffect(() => {
    const t = setInterval(() => {
      const current = logsRef.current[accountId] ?? []
      if (Date.now() - lastActivity.current < CHAT_TTL_MS || !current.some((e) => e.who !== 'system')) return
      api.resetSession(sessionFor(accountId)).catch(() => {})
      setLogs((l) => ({
        ...l,
        [accountId]: [{ id: uid(), at: Date.now(), who: 'system', text: 'Conversación borrada tras 10 min sin actividad.' }],
      }))
      setSuggestions((s) => ({ ...s, [accountId]: [] }))
    }, 30000)
    return () => clearInterval(t)
  }, [accountId])

  // Anunciar alertas nuevas (voz y/o subtítulos) a la cuenta que corresponda.
  const announced = useRef(new Set())
  useEffect(() => {
    for (const a of sim.alerts) {
      if (announced.current.has(a.id)) continue
      announced.current.add(a.id)
      if (isGeneral || a.crewId === accountId) say(alertText(a), 'Alerta')
    }
  }, [sim.alerts, isGeneral, accountId, say])

  // Moon-C saluda al abrir la app y al cambiar de cuenta.
  useEffect(() => {
    setGreeting(true)
    const t = setTimeout(() => setGreeting(false), 2200)
    return () => clearTimeout(t)
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
      appendLog(id, { who: 'system', text: `Sesión iniciada · ${crew ? crew.name : 'General'}` })
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

  const postAnnouncement = ({ text, priority, readAloud }) => {
    board.post({ text, priority })
    if (readAloud) say(text, 'Anuncio')
  }

  const member = account ? sim.members[account.crew_id] : null
  const modelStatus = member
    ? worstStatus(INDICATORS.map((i) => classify(i, member.values[i])))
    : sim.activeAlerts.length
      ? 'urgent'
      : 'normal'
  const talking = tts.speaking || Boolean(caption && caption.speaker !== 'Anuncio')
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
        ? QUICK_GENERAL
        : (QUICK_CREW[lang] ?? QUICK_CREW.es)

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
            title="Mis signos"
            subtitle={`${account.name} · pulsera ${account.bracelet_id}`}
            onSelect={(indicator) => setVitalDetail({ crewId: account.crew_id, indicator })}
          />
        )}
      </aside>

      <div className="bottom">
        {showSubs && <Subtitles caption={caption} interim={mic.listening ? mic.interim : ''} />}
        <ChatDock
          log={log}
          suggestions={chips}
          busy={busy}
          onSend={send}
          onManeuver={startManeuver}
          mic={mic}
          placeholder={isGeneral ? 'Escribe o usa el micrófono (cuenta General)' : `Escribe o usa el micrófono, ${account.name}`}
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
        language={lang}
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
