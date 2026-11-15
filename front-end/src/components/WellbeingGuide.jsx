import { useCallback, useEffect, useRef, useState } from 'react'
import { tr } from '../lib/i18n'
import { BREATHING, GROUNDING_STEPS, createTicker, groundingText, phaseAt, voiceLine } from '../lib/wellbeing'
import { CloseIcon } from './Icons'

const typing = (el) => el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)

/** Atajos comunes: Esc cierra, P pausa/reanuda (no si se escribe o el menú está abierto). */
function useGuideKeys({ onClose, onToggle, onPrev, onNext }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || typing(e.target)) return
      if (document.querySelector('.drawer.open')) return
      if (e.key === 'Escape') onClose()
      else if (e.key === 'p' || e.key === 'P') onToggle?.()
      else if (e.key === 'ArrowRight') onNext?.()
      else if (e.key === 'ArrowLeft') onPrev?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onToggle, onPrev, onNext])
}

function Feeling({ lang, onBetter, onWorse, onMore }) {
  return (
    <div className="wb-feeling">
      <button className="btn btn-sm btn-primary btn-block" onClick={onBetter}>
        {tr(lang, 'wbBetter')}
      </button>
      <button className="btn btn-sm btn-ghost btn-block" onClick={onWorse}>
        {tr(lang, 'wbWorse')}
      </button>
      {onMore && (
        <button className="btn btn-sm btn-ghost btn-block" onClick={onMore}>
          {tr(lang, 'wbMore')}
        </button>
      )}
    </div>
  )
}

function Breathing({ lang, leadMs, onSpeak, onStopSpeak, onBetter, onWorse, onClose }) {
  const [cycles, setCycles] = useState(BREATHING.cycles)
  const [paused, setPaused] = useState(false)
  const [ms, setMs] = useState(-leadMs)
  const tickerRef = useRef(null)
  const cyclesRef = useRef(cycles)
  cyclesRef.current = cycles
  const st = phaseAt(ms, BREATHING, cycles)

  useEffect(() => {
    const t = createTicker(setMs, { offset: -leadMs })
    tickerRef.current = t
    t.start()
    return () => t.pause()
  }, [leadMs])

  // Fin de la ronda: el reloj se detiene y Moon-C pregunta cómo se siente.
  useEffect(() => {
    if (st.done) tickerRef.current?.pause()
  }, [st.done])

  // Voz: una frase corta al empezar la fase, solo en las fases del plan (no cada segundo).
  const spoken = useRef('')
  useEffect(() => {
    if (paused || st.phase === 'ready') return
    const key = `${st.cycle}:${st.phase}`
    if (spoken.current === key) return
    spoken.current = key
    const line = voiceLine(st.cycle, st.phase, lang)
    if (line) onSpeak(line)
  }, [st.cycle, st.phase, paused, lang, onSpeak])

  const toggle = useCallback(() => {
    const t = tickerRef.current
    if (!t || phaseAt(t.elapsed(), BREATHING, cyclesRef.current).done) return
    if (t.running) {
      t.pause()
      setPaused(true)
      onStopSpeak()
    } else {
      t.start()
      setPaused(false)
    }
  }, [onStopSpeak])
  useGuideKeys({ onClose, onToggle: toggle })

  const total = cycles * (BREATHING.inhale_s + BREATHING.pause_s + BREATHING.exhale_s)
  const canMore = cycles < BREATHING.max_cycles
  const more = () => {
    setCycles((c) => Math.min(BREATHING.max_cycles, c + BREATHING.cycles))
    spoken.current = ''
    tickerRef.current?.start()
  }
  const worse = () => {
    tickerRef.current?.pause()
    setPaused(true)
    onWorse()
  }

  const label = st.done
    ? tr(lang, 'wbDoneAsk')
    : st.phase === 'ready'
      ? tr(lang, 'wbReady')
      : tr(lang, st.phase === 'inhale' ? 'wbInhale' : st.phase === 'exhale' ? 'wbExhale' : 'wbHold')
  const barPct = st.phase === 'ready' ? 0 : Math.min(100, (Math.max(0, ms) / (total * 1000)) * 100)

  return (
    <>
      <div className={`wb-stage ${paused ? 'is-paused' : ''}`}>
        <div className="wb-circle-wrap" aria-hidden="true">
          <div className="wb-circle" style={{ transform: `scale(${0.45 + 0.55 * st.scale})` }} />
        </div>
        <div className="wb-phase" role="status" aria-live="polite" aria-atomic="true">
          {paused ? tr(lang, 'wbPaused') : label}
        </div>
        {!st.done && st.phase !== 'ready' && <div className="wb-count">{st.remaining}</div>}
        <div className="wb-bar" aria-hidden="true">
          <span style={{ width: `${st.done ? 100 : barPct}%` }} />
        </div>
        <div className="wb-cycles">{tr(lang, 'wbCycle', { n: Math.min(st.cycle, cycles), total: cycles })}</div>
      </div>
      {st.done || paused ? null : (
        <button className="btn btn-sm btn-ghost btn-block" onClick={toggle}>
          {tr(lang, 'wbPause')}
        </button>
      )}
      {paused && !st.done && (
        <button className="btn btn-sm btn-primary btn-block" onClick={toggle}>
          {tr(lang, 'wbResume')}
        </button>
      )}
      <Feeling lang={lang} onBetter={onBetter} onWorse={worse} onMore={st.done && canMore ? more : null} />
    </>
  )
}

function Grounding({ lang, leadMs, onSpeak, onStopSpeak, onBetter, onWorse, onClose }) {
  const [index, setIndex] = useState(0)
  const [auto, setAuto] = useState(true)
  const [finished, setFinished] = useState(false)
  const [lead, setLead] = useState(leadMs > 0)
  const [ms, setMs] = useState(0)
  const tickerRef = useRef(null)
  const indexRef = useRef(0)
  indexRef.current = index
  const step = GROUNDING_STEPS[index]

  const goTo = useCallback((i) => {
    tickerRef.current?.reset(0)
    setIndex(i)
    setFinished(false)
  }, [])

  // El reloj mide el tiempo dentro del paso actual; al agotarse avanza (si el automático está activo).
  const onTick = useCallback((t) => {
    setMs(t)
    const i = indexRef.current
    if (t >= GROUNDING_STEPS[i].seconds * 1000) {
      if (i < GROUNDING_STEPS.length - 1) {
        tickerRef.current.reset(0)
        setIndex(i + 1)
      } else {
        tickerRef.current.pause()
        setFinished(true)
      }
    }
  }, [])
  useEffect(() => {
    const t = createTicker(onTick)
    tickerRef.current = t
    return () => t.pause()
  }, [onTick])

  // Cuenta previa breve para no pisar la respuesta de Moon-C que acaba de hablar.
  useEffect(() => {
    if (!lead) return undefined
    const t = setTimeout(() => setLead(false), leadMs)
    return () => clearTimeout(t)
  }, [lead, leadMs])

  useEffect(() => {
    if (auto && !lead && !finished) tickerRef.current?.start()
    else tickerRef.current?.pause()
  }, [auto, lead, finished])

  useEffect(() => {
    if (lead || finished) return
    onSpeak(groundingText(step, lang))
  }, [index, lead, finished, step, lang, onSpeak])
  useEffect(() => {
    if (finished) onSpeak(tr(lang, 'wbDoneAsk'))
  }, [finished, lang, onSpeak])

  const prev = useCallback(() => goTo(Math.max(0, indexRef.current - 1)), [goTo])
  const next = useCallback(() => {
    if (indexRef.current >= GROUNDING_STEPS.length - 1) {
      tickerRef.current?.pause()
      setFinished(true)
    } else goTo(indexRef.current + 1)
  }, [goTo])
  const toggleAuto = useCallback(() => {
    setAuto((a) => {
      if (a) onStopSpeak()
      return !a
    })
  }, [onStopSpeak])
  useGuideKeys({ onClose, onToggle: toggleAuto, onPrev: prev, onNext: next })

  const remaining = Math.max(0, Math.ceil((step.seconds * 1000 - ms) / 1000))
  const worse = () => {
    setAuto(false)
    onWorse()
  }

  return (
    <>
      <div className="maneuver-progress" aria-hidden="true">
        {GROUNDING_STEPS.map((s, i) => (
          <span key={s.sense} className={finished || i < index ? 'done' : i === index ? 'on' : ''} />
        ))}
      </div>
      <div className="wb-ground">
        {finished ? (
          <div className="wb-phase" role="status" aria-live="polite">
            {tr(lang, 'wbDoneAsk')}
          </div>
        ) : (
          <>
            <div className="wb-count wb-count--big" aria-hidden="true">
              {step.count}
            </div>
            <div className="maneuver-step-n">{tr(lang, 'guideStep', { n: index + 1, total: GROUNDING_STEPS.length })}</div>
            <p className="wb-ground-text" role="status" aria-live="polite" aria-atomic="true">
              {groundingText(step, lang)}
            </p>
            {auto && !lead && <div className="wb-cycles">{remaining} s</div>}
          </>
        )}
      </div>
      {!finished && (
        <>
          <div className="maneuver-nav">
            <button className="btn btn-sm btn-ghost" onClick={prev} disabled={index === 0}>
              {tr(lang, 'guidePrev')}
            </button>
            <button className="btn btn-sm btn-primary" onClick={next}>
              {tr(lang, 'guideNext')}
            </button>
          </div>
          <label className="maneuver-check">
            <input type="checkbox" checked={auto} onChange={toggleAuto} />
            {tr(lang, 'wbAuto')}
          </label>
        </>
      )}
      <Feeling lang={lang} onBetter={onBetter} onWorse={worse} />
    </>
  )
}

/** Panel de bienestar junto a Moon-C: respiración lenta (círculo) o anclaje 5-4-3-2-1. */
export default function WellbeingGuide({ mode, lang = 'es', leadMs = 1500, onSpeak, onStopSpeak, onBetter, onWorse, onClose }) {
  const Body = mode === 'grounding' ? Grounding : Breathing
  return (
    <div className="maneuver wellbeing">
      <div className="maneuver-head">
        <div>
          <div className="maneuver-kicker">{tr(lang, 'wbKicker')}</div>
          <h2>{tr(lang, mode === 'grounding' ? 'wbGrounding' : 'wbBreathing')}</h2>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label={tr(lang, 'guideExit')}>
          <CloseIcon />
        </button>
      </div>
      <Body
        lang={lang}
        leadMs={leadMs}
        onSpeak={onSpeak}
        onStopSpeak={onStopSpeak}
        onBetter={onBetter}
        onWorse={onWorse}
        onClose={onClose}
      />
      <p className="maneuver-note">
        {tr(lang, 'wbDisclaimer')}
        <br />
        {tr(lang, mode === 'grounding' ? 'wbKeysGround' : 'wbKeysBreath')}
      </p>
    </div>
  )
}
