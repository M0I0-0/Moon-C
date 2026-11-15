import { INDICATORS, classify, displayValue, shortLabel, unitLabel } from '../data/manual'
import { tr } from '../lib/i18n'
import { ChevronIcon } from './Icons'

export default function VitalsPanel({ member, title, subtitle, onSelect, lang = 'es' }) {
  const rows = INDICATORS.map((ind) => ({ ind, status: classify(ind, member.values[ind]) }))
  const off = rows.filter((r) => r.status !== 'normal').length
  return (
    <div className="vitals">
      <div className="panel-head">
        <h2>{title ?? tr(lang, 'mySigns')}</h2>
        {subtitle && <span className="panel-sub">{subtitle}</span>}
      </div>
      <p className={`vitals-summary ${off ? 'vitals-summary--off' : ''}`}>
        {off ? (off === 1 ? tr(lang, 'vitalsOffOne') : tr(lang, 'vitalsOffMany', { count: off })) : tr(lang, 'vitalsAllOk')}
      </p>
      <ul className="vrows">
        {rows.map(({ ind, status }) => (
          <li key={ind}>
            <button
              className={`vrow vrow--${status}`}
              onClick={() => onSelect?.(ind)}
              title={tr(lang, 'vitalsRowTitle', { status: tr(lang, `status_${status}`) })}
            >
              <span className="vrow-dot" aria-label={tr(lang, `status_${status}`)} />
              <span className="vrow-label">{shortLabel(ind, lang)}</span>
              <span className="vrow-value">
                {displayValue(ind, member.values)}
                <small>{unitLabel(ind, lang)}</small>
              </span>
              <ChevronIcon width={14} height={14} className="vrow-chev" />
            </button>
          </li>
        ))}
      </ul>
      <p className="fineprint">{tr(lang, 'vitalsHint')}</p>
    </div>
  )
}
