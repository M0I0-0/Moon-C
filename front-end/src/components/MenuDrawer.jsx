import { useEffect, useState } from 'react'
import { CREW } from '../data/manual'
import { EMERGENCY_TYPES } from '../hooks/useCrewSimulation'
import { CloseIcon } from './Icons'
import { MANEUVER_LIST } from '../lib/maneuvers'

export default function MenuDrawer({
  open,
  onClose,
  accountId,
  setAccountId,
  inEmergency,
  voiceOn,
  setVoiceOn,
  subtitleMode,
  setSubtitleMode,
  audio,
  onSimulate,
  onReset,
  onManeuver,
}) {
  const [simCrew, setSimCrew] = useState(CREW[3]?.crew_id ?? CREW[0].crew_id)
  const [simKind, setSimKind] = useState('hypoxia')

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const pickAccount = (id) => {
    setAccountId(id)
    onClose()
  }

  return (
    <>
      <div className={`drawer-overlay ${open ? 'visible' : ''}`} onClick={onClose} />
      <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open} aria-label="Menú">
        <div className="drawer-head">
          <span className="brand-name">Moon-C</span>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar menú">
            <CloseIcon />
          </button>
        </div>

        <section className="drawer-section">
          <h3>Maniobras guiadas (3D)</h3>
          {MANEUVER_LIST.map((m) => (
            <button key={m.id} className="account" onClick={() => onManeuver(m.id)}>
              <span className="account-info">
                <strong>{m.label}</strong>
                <span>{m.hint}</span>
              </span>
            </button>
          ))}
        </section>

        <section className="drawer-section">
          <h3>Cuenta</h3>
          <button
            className={`account ${accountId === 'general' ? 'selected' : ''}`}
            onClick={() => pickAccount('general')}
          >
            <span className="avatar">GE</span>
            <span className="account-info">
              <strong>General</strong>
              <span>Anuncios y vista de toda la tripulación</span>
            </span>
          </button>
          {CREW.map((c) => (
            <button
              key={c.crew_id}
              className={`account ${accountId === c.crew_id ? 'selected' : ''}`}
              onClick={() => pickAccount(c.crew_id)}
            >
              <span className="avatar">{c.initials}</span>
              <span className="account-info">
                <strong>{c.name}</strong>
                <span>
                  {c.roleLabel} · pulsera {c.bracelet_id}
                </span>
              </span>
              {inEmergency(c.crew_id) && <span className="dot dot-danger" title="Emergencia activa" />}
            </button>
          ))}
        </section>

        <section className="drawer-section">
          <h3>Audio y subtítulos</h3>
          <label className="row-toggle">
            <span>
              Leer respuestas en voz alta
              <small>
                {!audio.supported
                  ? 'Este navegador no tiene voz.'
                  : audio.hasSpeakers === false
                    ? 'No se detectaron bocinas.'
                    : !audio.hasVoices
                      ? 'No hay voces instaladas.'
                      : 'Usa la voz del sistema.'}
              </small>
            </span>
            <input type="checkbox" checked={voiceOn} onChange={(e) => setVoiceOn(e.target.checked)} />
          </label>
          <div className="segmented" role="radiogroup" aria-label="Subtítulos">
            {[
              ['auto', 'Automático'],
              ['on', 'Siempre'],
              ['off', 'Apagados'],
            ].map(([v, label]) => (
              <button
                key={v}
                role="radio"
                aria-checked={subtitleMode === v}
                className={subtitleMode === v ? 'selected' : ''}
                onClick={() => setSubtitleMode(v)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="fineprint">Automático: aparecen cuando no hay bocinas o la voz está apagada.</p>
        </section>

        <section className="drawer-section">
          <h3>Simulación (demo)</h3>
          <div className="sim-row">
            <select value={simCrew} onChange={(e) => setSimCrew(e.target.value)} aria-label="Tripulante">
              {CREW.map((c) => (
                <option key={c.crew_id} value={c.crew_id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select value={simKind} onChange={(e) => setSimKind(e.target.value)} aria-label="Tipo de emergencia">
              {Object.entries(EMERGENCY_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div className="sim-row">
            <button className="btn btn-danger btn-sm" onClick={() => onSimulate(simCrew, simKind)}>
              Simular emergencia
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onReset}>
              Restablecer
            </button>
          </div>
          <p className="fineprint">Los signos tardan unos segundos en llegar al rango urgente, como en una pulsera real.</p>
        </section>

        <p className="drawer-foot">Datos simulados · rangos de ejemplo pendientes de validación médica.</p>
      </aside>
    </>
  )
}
