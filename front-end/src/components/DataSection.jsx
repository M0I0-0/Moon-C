import { useState } from 'react'
import { api } from '../lib/api'
import { formatTime, tr } from '../lib/i18n'

/** Cuenta General: enlace con la Tierra (simulado), exportar datos y borrado por privacidad. */
export default function DataSection({ online, sync, onChanged, lang = 'es' }) {
  const [message, setMessage] = useState('')

  if (!online) return <p className="fineprint">{tr(lang, 'dataNoLink')}</p>

  const simulate = async () => {
    try {
      const r = await api.syncSimulate()
      setMessage(tr(lang, 'dataSynced', { readings: r.synced_count, reports: r.synced_reports }))
      onChanged?.()
    } catch (err) {
      setMessage(err.message)
    }
  }

  const wipe = async () => {
    if (!window.confirm(tr(lang, 'dataConfirmWipe'))) return
    try {
      const r = await api.deleteAllData()
      setMessage(
        tr(lang, 'dataWiped', { readings: r.measurements_deleted, reports: r.reports_deleted, access: r.access_log_deleted }),
      )
      onChanged?.()
    } catch (err) {
      setMessage(err.message)
    }
  }

  return (
    <>
      {sync && (
        <p className="fineprint">
          {tr(lang, 'dataLink', {
            state: tr(lang, sync.earth_link === 'online' ? 'linkOnline' : 'linkOffline'),
            readings: sync.pending,
            reports: sync.pending_reports,
          })}
          {sync.awaiting_assignment ? tr(lang, 'dataUnassigned', { count: sync.awaiting_assignment }) : ''}
          {sync.last_sync ? tr(lang, 'dataLastSync', { time: formatTime(sync.last_sync, lang) }) : ''}
        </p>
      )}
      <div className="sim-row">
        <button className="btn btn-ghost btn-sm" onClick={simulate}>
          {tr(lang, 'dataSimulate')}
        </button>
      </div>
      <div className="sim-row">
        <a className="btn btn-ghost btn-sm" href={api.exportUrl('json')} download>
          {tr(lang, 'dataExportJson')}
        </a>
        <a className="btn btn-ghost btn-sm" href={api.exportUrl('csv')} download>
          {tr(lang, 'dataExportCsv')}
        </a>
      </div>
      <button className="btn btn-danger btn-sm" onClick={wipe}>
        {tr(lang, 'dataWipe')}
      </button>
      {message && (
        <p className="fineprint" role="status">
          {message}
        </p>
      )}
    </>
  )
}
