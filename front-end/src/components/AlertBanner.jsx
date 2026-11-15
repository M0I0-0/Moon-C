import { alertText } from '../lib/alerts'
import { AlertIcon } from './Icons'

// Las alertas sobre un tripulante van siempre en inglés (el idioma común de la tripulación), así que
// este banner no cambia con el idioma de la pantalla.
export default function AlertBanner({ alerts, isGeneral, onOpen, onAck }) {
  const pending = alerts.filter((a) => !a.acknowledged)
  if (pending.length === 0) return null
  const a = pending[pending.length - 1]
  const more = pending.length - 1
  return (
    <div className="alert-banner" role="alert" lang="en">
      <AlertIcon />
      <div className="alert-text">
        <strong>{alertText(a)}</strong>
        <span>
          {isGeneral ? 'The medical officer has been notified.' : 'Tell a crewmate. The General account has been notified.'}
          {more > 0 && ` · ${more} more ${more === 1 ? 'alert' : 'alerts'}`}
        </span>
      </div>
      {isGeneral && (
        <button className="btn btn-light btn-sm" onClick={() => onOpen(a.crewId)}>
          View data
        </button>
      )}
      <button className="btn btn-outline-light btn-sm" onClick={() => onAck(a.id)}>
        Acknowledge
      </button>
    </div>
  )
}
