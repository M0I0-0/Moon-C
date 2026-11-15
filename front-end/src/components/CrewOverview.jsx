import { CREW, crewById, protocolView, PROTOCOL_FOR_INDICATOR, roleLabel } from '../data/manual'
import { alertReason } from '../lib/alerts'
import { formatTime, tr } from '../lib/i18n'
import { BackIcon, LockIcon, AlertIcon } from './Icons'
import VitalsPanel from './VitalsPanel'

export function EmergencyDetail({ crewId, member, alerts, accessAt, onBack, onResolve, onSelectVital, lang = 'es' }) {
  const crew = crewById(crewId)
  const vital = alerts.find((a) => a.kind === 'vital')
  const p = protocolView(vital ? PROTOCOL_FOR_INDICATOR[vital.indicator] : 'general_emergency', lang)
  return (
    <div className="emergency-detail">
      <button className="link-btn" onClick={onBack}>
        <BackIcon width={16} height={16} /> {tr(lang, 'crewTitle')}
      </button>
      <div className="access-note">
        <AlertIcon width={16} height={16} />
        {tr(lang, 'crewAccess', { name: crew.name, time: formatTime(accessAt, lang) })}
      </div>
      <ul className="alert-reasons">
        {alerts.map((a) => (
          <li key={a.id}>
            {alertReason(a, lang)}
            <span>{formatTime(a.createdAt, lang)}</span>
          </li>
        ))}
      </ul>
      <VitalsPanel member={member} title={crew.name} subtitle={roleLabel(crew.role, lang)} onSelect={onSelectVital} lang={lang} />
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
        {tr(lang, 'crewResolve')}
      </button>
    </div>
  )
}

export default function CrewOverview({ members, activeAlerts, onOpen, lang = 'es' }) {
  return (
    <div className="crew">
      <div className="panel-head">
        <h2>{tr(lang, 'crewTitle')}</h2>
        <span className="panel-sub">{tr(lang, 'crewPrivate')}</span>
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
                  {tr(lang, 'crewOpen')}
                </button>
              ) : (
                <span className="crew-ok">
                  <LockIcon width={14} height={14} /> {tr(lang, 'crewNoAlerts')}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <p className="fineprint">
        {tr(lang, 'crewLastReading', { time: formatTime(Math.max(...Object.values(members).map((m) => m.updatedAt)), lang) })}
      </p>
    </div>
  )
}
