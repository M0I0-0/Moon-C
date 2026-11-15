import { alertText } from '../lib/alerts'
import { tr } from '../lib/i18n'
import { AlertIcon } from './Icons'

export default function AlertBanner({ alerts, isGeneral, onOpen, onAck, lang = 'es' }) {
  const pending = alerts.filter((a) => !a.acknowledged)
  if (pending.length === 0) return null
  const a = pending[pending.length - 1]
  const more = pending.length - 1
  return (
    <div className="alert-banner" role="alert">
      <AlertIcon />
      <div className="alert-text">
        <strong>{alertText(a, lang)}</strong>
        <span>
          {tr(lang, isGeneral ? 'alertMedicalNotified' : 'alertTellCrewmate')}
          {more > 0 && (more === 1 ? tr(lang, 'alertMoreOne') : tr(lang, 'alertMoreMany', { count: more }))}
        </span>
      </div>
      {isGeneral && (
        <button className="btn btn-light btn-sm" onClick={() => onOpen(a.crewId)}>
          {tr(lang, 'alertViewData')}
        </button>
      )}
      <button className="btn btn-outline-light btn-sm" onClick={() => onAck(a.id)}>
        {tr(lang, 'alertAck')}
      </button>
    </div>
  )
}
