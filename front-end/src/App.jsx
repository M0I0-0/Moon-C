import { useCallback, useEffect, useRef, useState } from 'react'
import ManeuverPanel from './components/ManeuverPanel'
import { ENV_TO_MANEUVER, MANIOBRAS, explicitManeuver, suggestedManeuver } from './lib/maneuvers'
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
import { SEED_ANNOUNCEMENTS } from './data/announcements'
import { INDICATORS, STATUS_LABEL, classify, crewById, worstStatus } from './data/manual'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useCrewSimulation } from './hooks/useCrewSimulation'
import { useSpeechInput, useSpeechOutput } from './hooks/useSpeech'
import { useBackendStatus } from './hooks/useBackendStatus'
import { askBackend, askLocal } from './lib/assistant'
import { SPEECH_LANG } from './config'

let seq = 0
const uid = () => `${Date.now()}-${++seq}`
const QUICK_GENERAL = ['¿Cómo mido la saturación?', 'Emergencia médica', 'Hola, Moon-C']
const QUICK_CREW = ['¿Cómo mido mi temperatura?', 'Me siento raro', 'Dormí muy poco']

export default function App() {
  const [accountId, setAccountId] = useLocalStorage('moonc.account', 'general')
  const [voiceOn, setVoiceOn] = useLocalStorage('moonc.voice', true)
  const [subtitleMode, setSubtitleMode] = useLocalStorage('moonc.subtitles', 'auto')
  const [menuOpen, setMenuOpen] = useState(false)
  const [mobilePanel, setMobilePanel] = useState(null)
  const [announcements, setAnnouncements] = useState(SEED_ANNOUNCEMENTS)
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

  const sim = useCrewSimulation()
  const tts = useSpeechOutput(SPEECH_LANG)
  const backend = useBackendStatus()

  const env = ENVIRONMENTS.home // la app usa siempre la sala (modo hogar)
  const envId = env.id
  const account = accountId === 'general' ? null : crewById(accountId)
  const isGeneral = !account
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
      setMstate(null)
      setManeuver({ id, entorno: entorno ?? ENV_TO_MANEUVER[envId] ?? 'iss', nonce: Date.now() })
      setMenuOpen(false)
      setMobilePanel(null)
    },
    [envId],
  )
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
      appendLog(key, { who: 'user', name: account?.name ?? 'General', text: message })
      setSuggestions((s) => ({ ...s, [key]: [] }))
      const asked = explicitManeuver(message)
      if (asked) {
        appendLog(key, { who: 'assistant', name: 'Moon-C', text: `Abro la guía 3D: ${MANIOBRAS[asked].titulo}.`, via: 'local' })
        startManeuver(asked)
        return
      }
      setBusy(true)
      let res = null
      if (backend.online) {
        try {
          res = await askBackend({ message, crewId: account?.crew_id ?? null, sessionId: `tablet-${key}` })
        } catch {
          backend.markOffline()
        }
      }
      if (!res) {
        await new Promise((r) => setTimeout(r, 350))
        res = askLocal({ message, crew: account })
      }
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
    [accountId, account, appendLog, backend, say, sim, startManeuver],
  )

  const mic = useSpeechInput(SPEECH_LANG, send)

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
      setAccountId(id)
      setEmergencyView(null)
      setVitalDetail(null)
      setMobilePanel(null)
      const crew = crewById(id)
      appendLog(id, { who: 'system', text: `Sesión iniciada · ${crew ? crew.name : 'General'}` })
    },
    [setAccountId, appendLog],
  )

  const openEmergency = (crewId) => {
    setEmergencyView(crewId)
    setMobilePanel('right')
    setAccessLog((l) => (l[crewId] ? l : { ...l, [crewId]: Date.now() }))
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
    setAnnouncements((list) => [
      { id: uid(), author: 'General', priority, text, at: new Date().toISOString() },
      ...list,
    ])
    if (readAloud) say(text, 'Anuncio')
  }

  const member = account ? sim.members[account.crew_id] : null
  const modelStatus = member
    ? worstStatus(INDICATORS.map((i) => classify(i, member.values[i])))
    : sim.activeAlerts.length
      ? 'urgent'
      : 'normal'
  const talking = tts.speaking || Boolean(caption && caption.speaker !== 'Anuncio')
  const assistantMood = mic.listening
    ? 'escuchando'
    : busy
      ? 'pensando'
      : talking
        ? 'hablando'
        : modelStatus === 'urgent'
          ? 'alerta'
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
  const chips = suggestions[accountId]?.length ? suggestions[accountId] : log.length ? [] : isGeneral ? QUICK_GENERAL : QUICK_CREW

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
          <Announcements items={announcements} canPost={isGeneral} onPost={postAnnouncement} limit={isGeneral ? undefined : 3} />
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
