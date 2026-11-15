import { useEffect } from 'react'
import {
  INDICATORS,
  LIVE_INDICATORS,
  classify,
  displayValue,
  formatValue,
  fromManual,
  indicatorName,
  normalRange,
  shortLabel,
  unitLabel,
  whatToDo,
} from '../data/manual'
import { tr } from '../lib/i18n'
import Sparkline from './Sparkline'
import { BackIcon, ChevronIcon, CloseIcon } from './Icons'

export default function VitalDetail({ crew, member, indicator, onClose, onNav, lang = 'es' }) {
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
  const range = normalRange(indicator, lang)
  const history = member.history[indicator] ?? []
  const live = LIVE_INDICATORS.includes(indicator)
  const pad = (range.max - range.min) * 0.6 || 1
  const avg = history.reduce((a, b) => a + b, 0) / (history.length || 1)
  const steps = whatToDo(indicator, status, lang)
  const name = indicatorName(indicator, lang)

  return (
    <>
      <div className="vd-overlay" onClick={onClose} />
      <section className={`vd vd--${status}`} role="dialog" aria-label={tr(lang, 'detailAria', { indicator: name, name: crew.name })}>
        <header className="vd-head">
          <div>
            <span className="panel-sub">{crew.name}</span>
            <h2>{name}</h2>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={tr(lang, 'detailClose')}>
            <CloseIcon />
          </button>
        </header>

        <div className="vd-now">
          <span className="vd-value">
            {displayValue(indicator, member.values)}
            <small>{unitLabel(indicator, lang)}</small>
          </span>
          <span className={`chip chip--${status}`}>{tr(lang, `status_${status}`)}</span>
        </div>

        <div className="vd-chart">
          <Sparkline values={history} min={range.min - pad} max={range.max + pad} normal={range} width={480} height={110} fluid />
          <div className="vd-chart-caption">
            <span>{tr(lang, live ? 'detailLastReadings' : 'detailLastDays', { count: history.length })}</span>
            <span className="vd-legend">
              <i /> {tr(lang, 'detailNormalRange')}
            </span>
          </div>
        </div>

        <dl className="vd-stats">
          <div>
            <dt>{tr(lang, 'detailMin')}</dt>
            <dd>{formatValue(indicator, Math.min(...history))}</dd>
          </div>
          <div>
            <dt>{tr(lang, 'detailAvg')}</dt>
            <dd>{formatValue(indicator, avg)}</dd>
          </div>
          <div>
            <dt>{tr(lang, 'detailMax')}</dt>
            <dd>{formatValue(indicator, Math.max(...history))}</dd>
          </div>
          <div>
            <dt>{tr(lang, 'detailNormal')}</dt>
            <dd>{range.text}</dd>
          </div>
        </dl>

        <div className="vd-todo">
          <h3>{tr(lang, status === 'normal' ? 'detailNoAction' : 'detailWhatToDo')}</h3>
          {status === 'normal' ? (
            <p>{tr(lang, 'detailInRange')}</p>
          ) : (
            <ul>
              {steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
        </div>

        <p className="fineprint">
          {tr(lang, fromManual(indicator) ? 'detailFromManual' : 'detailFrontOnly')}
          {indicator === 'blood_pressure' && tr(lang, 'detailSystolic')}
        </p>

        <footer className="vd-nav">
          <button className="btn btn-ghost btn-sm" onClick={() => onNav(prev)}>
            <BackIcon width={14} height={14} /> {shortLabel(prev, lang)}
          </button>
          <span className="vd-pos">
            {idx + 1} / {INDICATORS.length}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => onNav(next)}>
            {shortLabel(next, lang)} <ChevronIcon width={14} height={14} />
          </button>
        </footer>
      </section>
    </>
  )
}
