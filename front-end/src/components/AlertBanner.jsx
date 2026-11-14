import { alertText } from '../lib/alerts'
import { AlertIcon } from './Icons'

export default function AlertBanner({ alerts, isGeneral, onOpen, onAck }) {
  const pending = alerts.filter((a) => !a.acknowledged)
  if (pending.length === 0) return null
  const a = pending[pending.length - 1]
  return (
    <div className="alert-banner" role="alert">
      <AlertIcon />
      <div className="alert-text">
        <strong>{alertText(a)}</strong>
        <span>
          {isGeneral ? 'Se avisó al oficial médico.' : 'Avisa a un compañero. Ya se notificó a la cuenta General.'}
          {pending.length > 1 && ` · ${pending.length - 1} alerta(s) más`}
        </span>
      </div>
      {isGeneral && (
        <button className="btn btn-light btn-sm" onClick={() => onOpen(a.crewId)}>
          Ver datos
        </button>
      )}
      <button className="btn btn-outline-light btn-sm" onClick={() => onAck(a.id)}>
        Enterado
      </button>
    </div>
  )
}
