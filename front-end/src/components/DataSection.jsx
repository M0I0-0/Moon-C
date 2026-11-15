import { useState } from 'react'
import { api } from '../lib/api'

const time = (iso) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

/** Cuenta General: enlace con la Tierra (simulado), exportar datos y borrado por privacidad. */
export default function DataSection({ online, sync, onChanged }) {
  const [message, setMessage] = useState('')

  if (!online) return <p className="fineprint">Sin enlace con el backend.</p>

  const simulate = async () => {
    try {
      const r = await api.syncSimulate()
      setMessage(`Contacto con Tierra: se enviaron ${r.synced_count} lecturas y ${r.synced_reports} reportes.`)
      onChanged?.()
    } catch (err) {
      setMessage(err.message)
    }
  }

  const wipe = async () => {
    const ok = window.confirm(
      '¿Borrar todas las lecturas, reportes de maniobras y registros de acceso? Los anuncios se conservan. No se puede deshacer.',
    )
    if (!ok) return
    try {
      const r = await api.deleteAllData()
      setMessage(
        `Borrado: ${r.measurements_deleted} lecturas, ${r.reports_deleted} reportes y ${r.access_log_deleted} registros de acceso.`,
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
          Enlace {sync.earth_link === 'online' ? 'en línea' : 'sin conexión'} · por enviar: {sync.pending} lecturas y{' '}
          {sync.pending_reports} reportes
          {sync.awaiting_assignment ? ` · ${sync.awaiting_assignment} sin asignar` : ''}
          {sync.last_sync ? ` · último contacto ${time(sync.last_sync)}` : ''}
        </p>
      )}
      <div className="sim-row">
        <button className="btn btn-ghost btn-sm" onClick={simulate}>
          Simular contacto con Tierra
        </button>
      </div>
      <div className="sim-row">
        <a className="btn btn-ghost btn-sm" href={api.exportUrl('json')} download>
          Exportar JSON
        </a>
        <a className="btn btn-ghost btn-sm" href={api.exportUrl('csv')} download>
          Exportar CSV
        </a>
      </div>
      <button className="btn btn-danger btn-sm" onClick={wipe}>
        Borrar todos los datos
      </button>
      {message && (
        <p className="fineprint" role="status">
          {message}
        </p>
      )}
    </>
  )
}
