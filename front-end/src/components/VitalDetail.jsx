import { useEffect } from 'react'
import {
  INDICATORS,
  LIVE_INDICATORS,
  SHORT_LABEL,
  STATUS_LABEL,
  UNIT,
  classify,
  displayValue,
  formatValue,
  fromManual,
  indicatorName,
  normalRange,
  whatToDo,
} from '../data/manual'
import Sparkline from './Sparkline'
import { BackIcon, ChevronIcon, CloseIcon } from './Icons'

export default function VitalDetail({ crew, member, indicator, onClose, onNav }) {
  const idx = INDICATORS.indexOf(indicator)
  const prev = INDICATORS[(idx - 1 + INDICATORS.length) % INDICATORS.length]
  const next = INDICATORS[(idx + 1) % INDICATORS.length]

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.key === 'ArrowLeft') onNav(prev)
      if (e.key === 'ArrowRight') onNav(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onNav, prev, next])

  const value = member.values[indicator]
  const status = classify(indicator, value)
  const range = normalRange(indicator)
  const history = member.history[indicator] ?? []
  const live = LIVE_INDICATORS.includes(indicator)
  const pad = (range.max - range.min) * 0.6 || 1
  const avg = history.reduce((a, b) => a + b, 0) / (history.length || 1)
  const steps = whatToDo(indicator, status)

  return (
    <>
      <div className="vd-overlay" onClick={onClose} />
      <section className={`vd vd--${status}`} role="dialog" aria-label={`${indicatorName(indicator)} de ${crew.name}`}>
        <header className="vd-head">
          <div>
            <span className="panel-sub">{crew.name}</span>
            <h2>{indicatorName(indicator)}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <CloseIcon />
          </button>
        </header>

        <div className="vd-now">
          <span className="vd-value">
            {displayValue(indicator, member.values)}
            <small>{UNIT[indicator]}</small>
          </span>
          <span className={`chip chip--${status}`}>{STATUS_LABEL[status]}</span>
        </div>

        <div className="vd-chart">
          <Sparkline values={history} min={range.min - pad} max={range.max + pad} normal={range} width={480} height={110} fluid />
          <div className="vd-chart-caption">
            <span>{live ? `Últimas ${history.length} lecturas · cada 2.5 s` : `Últimos ${history.length} días`}</span>
            <span className="vd-legend">
              <i /> rango normal
            </span>
          </div>
        </div>

        <dl className="vd-stats">
          <div>
            <dt>Mínimo</dt>
            <dd>{formatValue(indicator, Math.min(...history))}</dd>
          </div>
          <div>
            <dt>Promedio</dt>
            <dd>{formatValue(indicator, avg)}</dd>
          </div>
          <div>
            <dt>Máximo</dt>
            <dd>{formatValue(indicator, Math.max(...history))}</dd>
          </div>
          <div>
            <dt>Normal</dt>
            <dd>{range.text}</dd>
          </div>
        </dl>

        <div className="vd-todo">
          <h3>{status === 'normal' ? 'Sin acciones' : 'Qué hacer'}</h3>
          {status === 'normal' ? (
            <p>El valor está dentro del rango. Sigue con tus registros de rutina.</p>
          ) : (
            <ul>
              {steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
        </div>

        <p className="fineprint">
          {fromManual(indicator)
            ? 'Rango del manual de Moon-C (shared/protocols.json), tomado de guías clínicas y estándares de la NASA (shared/REFERENCES.md). Pendiente de validación médica.'
            : 'Dato simulado solo en el front-end; todavía no está en el manual del backend.'}
          {indicator === 'blood_pressure' && ' El estado se calcula con la sistólica.'}
        </p>

        <footer className="vd-nav">
          <button className="btn btn-ghost btn-sm" onClick={() => onNav(prev)}>
            <BackIcon width={14} height={14} /> {SHORT_LABEL[prev]}
          </button>
          <span className="vd-pos">
            {idx + 1} / {INDICATORS.length}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => onNav(next)}>
            {SHORT_LABEL[next]} <ChevronIcon width={14} height={14} />
          </button>
        </footer>
      </section>
    </>
  )
}
