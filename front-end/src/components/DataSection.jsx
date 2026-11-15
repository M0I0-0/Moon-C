import { useState } from 'react'
import { api } from '../lib/api'
import { useI18n } from '../i18n'

/** Cuenta General: enlace con la Tierra (simulado), exportar datos y borrado por privacidad. */
export default function DataSection({ online, sync, onChanged }) {
  const { t, time } = useI18n()
  const [message, setMessage] = useState('')

  if (!online) return <p className="fineprint">{t('data.noLink')}</p>

  const simulate = async () => {
    try {
      const r = await api.syncSimulate()
      setMessage(t('data.synced', { readings: r.synced_count, reports: r.synced_reports }))
      onChanged?.()
    } catch (err) {
      setMessage(err.message)
    }
  }

  const wipe = async () => {
    if (!window.confirm(t('data.confirmWipe'))) return
    try {
      const r = await api.deleteAllData()
      setMessage(
        t('data.wiped', { readings: r.measurements_deleted, reports: r.reports_deleted, access: r.access_log_deleted }),
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
          {t('data.link', {
            state: t(sync.earth_link === 'online' ? 'topbar.online' : 'topbar.offline'),
            readings: sync.pending,
            reports: sync.pending_reports,
          })}
          {sync.awaiting_assignment ? t('data.unassigned', { count: sync.awaiting_assignment }) : ''}
          {sync.last_sync ? t('data.lastSync', { time: time(sync.last_sync) }) : ''}
        </p>
      )}
      <div className="sim-row">
        <button className="btn btn-ghost btn-sm" onClick={simulate}>
          {t('data.simulate')}
        </button>
      </div>
      <div className="sim-row">
        <a className="btn btn-ghost btn-sm" href={api.exportUrl('json')} download>
          {t('data.exportJson')}
        </a>
        <a className="btn btn-ghost btn-sm" href={api.exportUrl('csv')} download>
          {t('data.exportCsv')}
        </a>
      </div>
      <button className="btn btn-danger btn-sm" onClick={wipe}>
        {t('data.wipe')}
      </button>
      {message && (
        <p className="fineprint" role="status">
          {message}
        </p>
      )}
    </>
  )
}
