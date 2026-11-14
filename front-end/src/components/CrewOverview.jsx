import { CREW, SHORT_LABEL, crewById, protocolView, PROTOCOL_FOR_INDICATOR } from '../data/manual'
import { BackIcon, LockIcon, AlertIcon } from './Icons'
import VitalsPanel from './VitalsPanel'

const time = (ms) => new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

export function EmergencyDetail({ crewId, member, alerts, accessAt, onBack, onResolve, onSelectVital }) {
  const crew = crewById(crewId)
  const vital = alerts.find((a) => a.kind === 'vital')
  const p = protocolView(vital ? PROTOCOL_FOR_INDICATOR[vital.indicator] : 'general_emergency')
  return (
    <div className="emergency-detail">
      <button className="link-btn" onClick={onBack}>
        <BackIcon width={16} height={16} /> Tripulación
      </button>
      <div className="access-note">
        <AlertIcon width={16} height={16} />
        Acceso de emergencia a los datos de {crew.name} · registrado a las {time(accessAt)}
      </div>
      <ul className="alert-reasons">
        {alerts.map((a) => (
          <li key={a.id}>
            {a.kind === 'vital' ? `${SHORT_LABEL[a.indicator]} en rango urgente` : `Reporte por voz/texto: ${a.text}`}
            <span>{time(a.createdAt)}</span>
          </li>
        ))}
      </ul>
      <VitalsPanel member={member} title={crew.name} subtitle={crew.roleLabel} onSelect={onSelectVital} />
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
        Marcar emergencia como atendida
      </button>
    </div>
  )
}

export default function CrewOverview({ members, activeAlerts, onOpen }) {
  return (
    <div className="crew">
      <div className="panel-head">
        <h2>Tripulación</h2>
        <span className="panel-sub">Los datos individuales son privados. Se abren solo en una emergencia.</span>
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
                <span className="crew-role">{c.roleLabel}</span>
              </div>
              {emergency ? (
                <button className="btn btn-danger btn-sm" onClick={() => onOpen(c.crew_id)}>
                  Abrir datos
                </button>
              ) : (
                <span className="crew-ok">
                  <LockIcon width={14} height={14} /> Sin alertas
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <p className="fineprint">
        Última lectura de pulseras: {time(Math.max(...Object.values(members).map((m) => m.updatedAt)))}
      </p>
    </div>
  )
}
