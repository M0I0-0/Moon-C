import { INDICATORS, classify, displayValue, shortLabel, unitLabel } from '../data/manual'
import { ChevronIcon } from './Icons'
import { useI18n } from '../i18n'

export default function VitalsPanel({ member, title, subtitle, onSelect }) {
  const { lang, t } = useI18n()
  const rows = INDICATORS.map((ind) => ({ ind, status: classify(ind, member.values[ind]) }))
  const off = rows.filter((r) => r.status !== 'normal').length
  return (
    <div className="vitals">
      <div className="panel-head">
        <h2>{title ?? t('vitals.mine')}</h2>
        {subtitle && <span className="panel-sub">{subtitle}</span>}
      </div>
      <p className={`vitals-summary ${off ? 'vitals-summary--off' : ''}`}>
        {off ? (off === 1 ? t('vitals.offOne') : t('vitals.offMany', { count: off })) : t('vitals.allOk')}
      </p>
      <ul className="vrows">
        {rows.map(({ ind, status }) => (
          <li key={ind}>
            <button
              className={`vrow vrow--${status}`}
              onClick={() => onSelect?.(ind)}
              title={t('vitals.rowTitle', { status: t(`status.${status}`) })}
            >
              <span className="vrow-dot" aria-label={t(`status.${status}`)} />
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
      <p className="fineprint">{t('vitals.hint')}</p>
    </div>
  )
}
