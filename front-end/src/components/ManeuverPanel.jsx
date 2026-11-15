import { useState } from 'react'
import { ENTORNOS, FUENTES, MANIOBRAS, MANEUVER_IMAGES } from '../lib/maneuvers'
import { CloseIcon } from './Icons'

// Estado del "Resumen para Tierra" que guarda el backend (lo pone App al llegar al paso "Reporta a Tierra").
const REPORT_STATUS = {
  sending: 'Guardando el resumen en Moon-C…',
  queued: 'Resumen guardado en Moon-C. Se enviará a Tierra en la próxima ventana de comunicación.',
  synced: 'Resumen guardado y enviado a Tierra.',
  offline: 'Sin enlace con el backend: el resumen no se guardó. Anótalo a mano.',
  error: 'No se pudo guardar el resumen. Anótalo a mano.',
}

/** Panel de una maniobra guiada: paso actual, conteo/tiempo, atajos y resumen para Tierra. */
export default function ManeuverPanel({ id, entorno, state, ctrlRef, onEnv, onSoloManos, onClose }) {
  const [summary, setSummary] = useState(null)
  const def = MANIOBRAS[id]
  const ctrl = ctrlRef.current
  const { index = -1, paso, pasos = [], conteo = 0, total = 0, tiempo = null, soloManos = false } = state ?? {}
  const loading = !paso

  const go = (fn) => {
    setSummary(null)
    fn()
  }

  return (
    <div className="maneuver">
      <div className="maneuver-head">
        <div>
          <div className="maneuver-kicker">Guía 3D</div>
          <h2>{def.titulo}</h2>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Salir de la guía">
          <CloseIcon />
        </button>
      </div>

      <label className="maneuver-env">
        <span>Entorno</span>
        <select value={entorno} onChange={(e) => onEnv(e.target.value)}>
          {Object.entries(ENTORNOS).map(([key, e]) => (
            <option key={key} value={key}>
              {e.nombre}
            </option>
          ))}
        </select>
      </label>

      {loading ? (
        <p className="maneuver-loading">Preparando el maniquí…</p>
      ) : (
        <>
          <div className="maneuver-progress" aria-label={`Paso ${index + 1} de ${pasos.length}`}>
            {pasos.map((p, i) => (
              <span key={p.id} className={i === index ? 'on' : i < index ? 'done' : ''} />
            ))}
          </div>
          <div className="maneuver-step">
            <div className="maneuver-step-n">
              Paso {index + 1} de {pasos.length}
            </div>
            <h3>{paso.titulo}</h3>
            <p>{paso.texto}</p>
            {paso.imagen && MANEUVER_IMAGES[paso.imagen] && (
              <img className="maneuver-img" src={MANEUVER_IMAGES[paso.imagen]} alt={paso.imagenAlt ?? ''} />
            )}
            {paso.modo === 'conteo' && (
              <div className="maneuver-count" aria-live="polite">
                {conteo}
                <small> / {total}</small>
              </div>
            )}
            {paso.modo === 'tiempo' && tiempo != null && (
              <div className="maneuver-count" aria-live="polite">
                {tiempo}
                <small> s</small>
              </div>
            )}
            <div className="maneuver-source">
              <span className={`badge badge--${paso.estado}`}>{paso.estado}</span>
              <span>{FUENTES[paso.fuente] ?? paso.fuente}</span>
            </div>
          </div>

          <div className="maneuver-nav">
            <button className="btn btn-sm btn-ghost" onClick={() => go(() => ctrl?.anterior())} disabled={index <= 0}>
              Anterior
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => go(() => ctrl?.siguiente())}>
              Siguiente
            </button>
          </div>

          {ctrl?.atajos?.length > 0 && (
            <div className="maneuver-shortcuts">
              {ctrl.atajos.map((a) => (
                <button key={a.paso} className="chip-btn" onClick={() => go(() => ctrl.ir(a.paso))}>
                  {a.texto}
                </button>
              ))}
            </div>
          )}

          {id === 'rcp' && (
            <label className="maneuver-check">
              <input
                type="checkbox"
                checked={soloManos}
                onChange={(e) => onSoloManos(e.target.checked)}
              />
              Solo compresiones (sin ventilaciones)
            </label>
          )}

          <button className="btn btn-sm btn-ghost btn-block" onClick={() => setSummary(summary ? null : ctrl?.paqueteTierra())}>
            {summary ? 'Ocultar resumen' : 'Resumen para Tierra'}
          </button>
          {summary && (
            <pre className="maneuver-summary">
              {[
                summary.maniobra,
                `Entorno: ${summary.entorno}`,
                `Retraso de comunicación: ${summary.retrasoComunicacion}`,
                `Duración: ${summary.duracionSeg} s`,
                summary.compresiones ? `Compresiones: ${summary.compresiones}` : null,
                summary.torniquete ? `Torniquete: ${summary.torniquete}` : null,
                '',
                ...summary.eventos.map((e) => `+${e.seg}s  ${e.evento}`),
              ]
                .filter((l) => l !== null)
                .join('\n')}
            </pre>
          )}
          {state?.report && (
            <p className="maneuver-note" role="status">
              {REPORT_STATUS[state.report.status]}
            </p>
          )}
        </>
      )}

      <p className="maneuver-note">
        Apoyo a la decisión: no sustituye el criterio médico ni el entrenamiento. Los pasos marcados como{' '}
        <strong>supuesto</strong> están pendientes de validación.
      </p>
    </div>
  )
}
