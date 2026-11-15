import { useEffect, useState } from 'react'
import { tr } from '../lib/i18n'
import { ENTORNOS, MANEUVER_IMAGES, environmentName, maneuverTitle, sourceText } from '../lib/maneuvers'
import { CloseIcon } from './Icons'

// Estado del "Resumen para Tierra" que guarda el backend (lo pone App al llegar al paso "Reporta a Tierra").
const REPORT_KEY = {
  sending: 'reportSending',
  queued: 'reportQueued',
  synced: 'reportSynced',
  offline: 'reportOffline',
  error: 'reportError',
}

const typing = (el) => el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)

/**
 * Panel de una maniobra guiada: paso actual, conteo/tiempo, atajos y resumen para Tierra.
 * Los pasos llegan en el idioma de la pantalla (Model3D/moonc/maniobras.js, opción `idioma`).
 */
export default function ManeuverPanel({ id, entorno, state, ctrlRef, onEnv, onSoloManos, onClose, lang = 'es', notice = null }) {
  const [summary, setSummary] = useState(null)
  const ctrl = ctrlRef.current
  const { index = -1, paso, pasos = [], conteo = 0, total = 0, tiempo = null, soloManos = false } = state ?? {}
  const loading = !paso

  const go = (fn) => {
    setSummary(null)
    fn()
  }

  // Atajos de teclado: flechas cambian de paso, Esc cierra la guía (no si se escribe o el menú está abierto).
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || typing(e.target)) return
      if (document.querySelector('.drawer.open')) return
      const c = ctrlRef.current
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight' && c) go(() => c.siguiente())
      else if (e.key === 'ArrowLeft' && c) go(() => c.anterior())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ctrlRef, onClose])

  const reportStatus = state?.report?.status
  // El texto del paso "Reporta a Tierra" afirma que se envió: solo se muestra si de verdad se guardó.
  const stepText =
    paso?.id === 'reporte' && reportStatus && reportStatus !== 'queued' && reportStatus !== 'synced'
      ? tr(lang, REPORT_KEY[reportStatus])
      : paso?.texto
  const canFinish = id === 'rcp' && paso && paso.id !== 'reporte' && pasos.some((p) => p.id === 'reporte')

  return (
    <div className="maneuver">
      <div className="maneuver-head">
        <div>
          <div className="maneuver-kicker">{tr(lang, 'guideKicker')}</div>
          <h2>{maneuverTitle(id, lang)}</h2>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label={tr(lang, 'guideExit')}>
          <CloseIcon />
        </button>
      </div>

      <label className="maneuver-env">
        <span>{tr(lang, 'guideEnv')}</span>
        <select value={entorno} onChange={(e) => onEnv(e.target.value)}>
          {Object.keys(ENTORNOS).map((key) => (
            <option key={key} value={key}>
              {environmentName(key, lang)}
            </option>
          ))}
        </select>
      </label>

      {notice && (
        <p className="maneuver-notice" role="alert">
          {tr(lang, 'guideAutoNotice')}
        </p>
      )}

      {loading ? (
        <>
          <p className="maneuver-loading">{tr(lang, 'guideLoading')}</p>
          {notice?.slow && (
            <p className="maneuver-note" role="status">
              {tr(lang, 'guideSlow')} {notice.reply}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="maneuver-progress" aria-label={tr(lang, 'guideStep', { n: index + 1, total: pasos.length })}>
            {pasos.map((p, i) => (
              <span key={p.id} className={i === index ? 'on' : i < index ? 'done' : ''} />
            ))}
          </div>
          <div className="maneuver-step">
            <div className="maneuver-step-n">
              {tr(lang, 'guideStep', { n: index + 1, total: pasos.length })}
            </div>
            <h3>{paso.titulo}</h3>
            <p>{stepText}</p>
            {paso.imagen && MANEUVER_IMAGES[paso.imagen] && (
              <img className="maneuver-img" src={MANEUVER_IMAGES[paso.imagen]} alt={paso.imagenAlt ?? paso.titulo} />
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
              <span className={`badge badge--${paso.estado}`}>{tr(lang, `guideState_${paso.estado}`)}</span>
              <span>{sourceText(paso.fuente, lang)}</span>
            </div>
          </div>

          <div className="maneuver-nav">
            <button className="btn btn-sm btn-ghost" onClick={() => go(() => ctrl?.anterior())} disabled={index <= 0}>
              {tr(lang, 'guidePrev')}
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => go(() => ctrl?.siguiente())}>
              {tr(lang, 'guideNext')}
            </button>
          </div>
          {canFinish && (
            <button className="btn btn-sm btn-block btn-danger" onClick={() => go(() => ctrl?.ir('reporte'))}>
              {tr(lang, 'guideFinish')}
            </button>
          )}

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
              {tr(lang, 'soloCompressions')}
            </label>
          )}

          <button className="btn btn-sm btn-ghost btn-block" onClick={() => setSummary(summary ? null : ctrl?.paqueteTierra())}>
            {summary ? tr(lang, 'summaryHide') : tr(lang, 'summaryShow')}
          </button>
          {summary && (
            <pre className="maneuver-summary">
              {[
                summary.maniobra,
                tr(lang, 'guideSummaryEnv', { value: summary.entorno }),
                tr(lang, 'guideSummaryDelay', { value: summary.retrasoComunicacion }),
                tr(lang, 'guideSummaryDuration', { value: summary.duracionSeg }),
                summary.compresiones ? tr(lang, 'guideSummaryCompressions', { value: summary.compresiones }) : null,
                summary.torniquete ? tr(lang, 'guideSummaryTourniquet', { value: summary.torniquete }) : null,
                '',
                ...summary.eventos.map((e) => `+${e.seg}s  ${e.evento}`),
              ]
                .filter((l) => l !== null)
                .join('\n')}
            </pre>
          )}
          {state?.report && (
            <p className="maneuver-note" role="status">
              {tr(lang, REPORT_KEY[state.report.status])}
            </p>
          )}
        </>
      )}

      <p className="maneuver-note">
        {tr(lang, 'guideDisclaimer')} <strong>{tr(lang, 'guideAssumption')}</strong> {tr(lang, 'guideDisclaimerEnd')}
        <br />
        {tr(lang, 'guideKeys')}
      </p>
    </div>
  )
}
