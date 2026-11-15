import { useState } from 'react'
import { ENTORNOS, MANEUVER_IMAGES, environmentName, maneuverTitle, sourceText } from '../lib/maneuvers'
import { CloseIcon } from './Icons'
import { useI18n } from '../i18n'

/**
 * Panel de una maniobra guiada: paso actual, conteo/tiempo, atajos y resumen para Tierra.
 * Los pasos llegan ya en el idioma de la pantalla (Model3D/moonc/maniobras.js, opción `idioma`).
 * El estado del "Resumen para Tierra" lo pone App al llegar al paso "Reporta a Tierra".
 */
export default function ManeuverPanel({ id, entorno, state, ctrlRef, onEnv, onSoloManos, onClose }) {
  const { lang, t } = useI18n()
  const [summary, setSummary] = useState(null)
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
          <div className="maneuver-kicker">{t('guide.kicker')}</div>
          <h2>{maneuverTitle(id, lang)}</h2>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label={t('guide.exit')}>
          <CloseIcon />
        </button>
      </div>

      <label className="maneuver-env">
        <span>{t('guide.environment')}</span>
        <select value={entorno} onChange={(e) => onEnv(e.target.value)}>
          {Object.keys(ENTORNOS).map((key) => (
            <option key={key} value={key}>
              {environmentName(key, lang)}
            </option>
          ))}
        </select>
      </label>

      {loading ? (
        <p className="maneuver-loading">{t('guide.loading')}</p>
      ) : (
        <>
          <div className="maneuver-progress" aria-label={t('guide.step', { n: index + 1, total: pasos.length })}>
            {pasos.map((p, i) => (
              <span key={p.id} className={i === index ? 'on' : i < index ? 'done' : ''} />
            ))}
          </div>
          <div className="maneuver-step">
            <div className="maneuver-step-n">{t('guide.step', { n: index + 1, total: pasos.length })}</div>
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
              <span className={`badge badge--${paso.estado}`}>{t(`guide.state.${paso.estado}`)}</span>
              <span>{sourceText(paso.fuente, lang)}</span>
            </div>
          </div>

          <div className="maneuver-nav">
            <button className="btn btn-sm btn-ghost" onClick={() => go(() => ctrl?.anterior())} disabled={index <= 0}>
              {t('guide.prev')}
            </button>
            <button className="btn btn-sm btn-primary" onClick={() => go(() => ctrl?.siguiente())}>
              {t('guide.next')}
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
              <input type="checkbox" checked={soloManos} onChange={(e) => onSoloManos(e.target.checked)} />
              {t('guide.handsOnly')}
            </label>
          )}

          <button className="btn btn-sm btn-ghost btn-block" onClick={() => setSummary(summary ? null : ctrl?.paqueteTierra())}>
            {t(summary ? 'guide.hideSummary' : 'guide.summary')}
          </button>
          {summary && (
            <pre className="maneuver-summary">
              {[
                summary.maniobra,
                t('guide.summaryEnv', { value: summary.entorno }),
                t('guide.summaryDelay', { value: summary.retrasoComunicacion }),
                t('guide.summaryDuration', { value: summary.duracionSeg }),
                summary.compresiones ? t('guide.summaryCompressions', { value: summary.compresiones }) : null,
                summary.torniquete ? t('guide.summaryTourniquet', { value: summary.torniquete }) : null,
                '',
                ...summary.eventos.map((e) => `+${e.seg}s  ${e.evento}`),
              ]
                .filter((l) => l !== null)
                .join('\n')}
            </pre>
          )}
          {state?.report && (
            <p className="maneuver-note" role="status">
              {t(`guide.report.${state.report.status}`)}
            </p>
          )}
        </>
      )}

      <p className="maneuver-note">
        {t('guide.note')} <strong>{t('guide.state.supuesto')}</strong> {t('guide.noteEnd')}
      </p>
    </div>
  )
}
