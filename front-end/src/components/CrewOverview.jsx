import { CREW, crewById, protocolView, PROTOCOL_FOR_INDICATOR, roleLabel } from '../data/manual'
import { alertReason } from '../lib/alerts'
import { BackIcon, LockIcon, AlertIcon } from './Icons'
import VitalsPanel from './VitalsPanel'
import { useI18n } from '../i18n'

export function EmergencyDetail({ crewId, member, alerts, accessAt, onBack, onResolve, onSelectVital }) {
  const { lang, t, time } = useI18n()
  const crew = crewById(crewId)
  const vital = alerts.find((a) => a.kind === 'vital')
  const p = protocolView(vital ? PROTOCOL_FOR_INDICATOR[vital.indicator] : 'general_emergency', lang)
  return (
    <div className="emergency-detail">
      <button className="link-btn" onClick={onBack}>
        <BackIcon width={16} height={16} /> {t('crew.title')}
      </button>
      <div className="access-note">
        <AlertIcon width={16} height={16} />
        {t('crew.access', { name: crew.name, time: time(accessAt) })}
      </div>
      {/* Motivos de las alertas: en inglés, como todas las alertas. */}
      <ul className="alert-reasons" lang="en">
        {alerts.map((a) => (
          <li key={a.id}>
            {alertReason(a)}
            <span>{time(a.createdAt)}</span>
          </li>
        ))}
      </ul>
      <VitalsPanel member={member} title={crew.name} subtitle={roleLabel(crew.role, lang)} onSelect={onSelectVital} />
      {p && (
        <div className="protocol">
          <h3>{p.title}</h3>
          {p.audience && <p className="panel-sub">{p.audience}</p>}
          <ol>
            {p.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      )}
      <button className="btn btn-ghost btn-block" onClick={() => onResolve(crewId)}>
        {t('crew.resolve')}
      </button>
    </div>
  )
}

export default function CrewOverview({ members, activeAlerts, onOpen }) {
  const { lang, t, time } = useI18n()
  return (
    <div className="crew">
      <div className="panel-head">
        <h2>{t('crew.title')}</h2>
        <span className="panel-sub">{t('crew.private')}</span>
      </div>
      <ul className="crew-list">
        {CREW.map((c) => {
          const alerts = activeAlerts.filter((a) => a.crewId === c.crew_id)
          const emergency = alerts.length > 0
          return (
            <li key={c.crew_id} className={`crew-row ${emergency ? 'crew-row--alert' : ''}`}>
              <span className="avatar">{c.initials}</span>
              <div className="crew-info">
                <span className="crew-name">{c.name}</span>
                <span className="crew-role">{roleLabel(c.role, lang)}</span>
              </div>
              {emergency ? (
                <button className="btn btn-danger btn-sm" onClick={() => onOpen(c.crew_id)}>
                  {t('crew.open')}
                </button>
              ) : (
                <span className="crew-ok">
                  <LockIcon width={14} height={14} /> {t('crew.noAlerts')}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <p className="fineprint">
        {t('crew.lastReading', { time: time(Math.max(...Object.values(members).map((m) => m.updatedAt))) })}
      </p>
    </div>
  )
}
