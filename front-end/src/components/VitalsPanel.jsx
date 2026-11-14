import { INDICATORS, SHORT_LABEL, STATUS_LABEL, UNIT, classify, displayValue } from '../data/manual'
import { ChevronIcon } from './Icons'

export default function VitalsPanel({ member, title = 'Mis signos', subtitle, onSelect }) {
  const rows = INDICATORS.map((ind) => ({ ind, status: classify(ind, member.values[ind]) }))
  const off = rows.filter((r) => r.status !== 'normal').length
  return (
    <div className="vitals">
      <div className="panel-head">
        <h2>{title}</h2>
        {subtitle && <span className="panel-sub">{subtitle}</span>}
      </div>
      <p className={`vitals-summary ${off ? 'vitals-summary--off' : ''}`}>
        {off ? `${off} ${off === 1 ? 'dato fuera de rango' : 'datos fuera de rango'}` : 'Todo en rango'}
      </p>
      <ul className="vrows">
        {rows.map(({ ind, status }) => (
          <li key={ind}>
            <button className={`vrow vrow--${status}`} onClick={() => onSelect?.(ind)} title={`${STATUS_LABEL[status]} · ver detalle`}>
              <span className="vrow-dot" aria-label={STATUS_LABEL[status]} />
              <span className="vrow-label">{SHORT_LABEL[ind]}</span>
              <span className="vrow-value">
                {displayValue(ind, member.values)}
                <small>{UNIT[ind]}</small>
              </span>
              <ChevronIcon width={14} height={14} className="vrow-chev" />
            </button>
          </li>
        ))}
      </ul>
      <p className="fineprint">Toca un dato para ver su detalle. Rangos de ejemplo.</p>
    </div>
  )
}
