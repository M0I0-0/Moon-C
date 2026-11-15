import { useEffect, useState } from 'react'
import { CREW, crewById, roleLabel } from '../data/manual'
import { EMERGENCY_TYPES } from '../hooks/useCrewSimulation'
import { tr } from '../lib/i18n'
import { CloseIcon } from './Icons'
import { MANEUVER_LIST } from '../lib/maneuvers'
import MeasurementEntry from './MeasurementEntry'
import DataSection from './DataSection'
import { LanguageSwitch } from './TopBar'

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
  online,
  lang = 'es',
  onLanguage,
  sync,
  onDataChanged,
}) {
  const [simCrew, setSimCrew] = useState(CREW[3]?.crew_id ?? CREW[0].crew_id)
  const [simKind, setSimKind] = useState(Object.keys(EMERGENCY_TYPES)[0])
  const account = crewById(accountId)

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

  const audioNote = !audio.supported
    ? 'menuNoVoice'
    : audio.hasSpeakers === false
      ? 'menuNoSpeakers'
      : !audio.hasVoices
        ? 'menuNoLocalVoice'
        : audio.moonVoice && lang === 'es'
          ? 'menuMoonVoice'
          : 'menuLocalVoice'

  return (
    <>
      <div className={`drawer-overlay ${open ? 'visible' : ''}`} onClick={onClose} />
      <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open} aria-label={tr(lang, 'menu')}>
        <div className="drawer-head">
          <span className="brand-name">Moon-C</span>
          <button className="icon-btn" onClick={onClose} aria-label={tr(lang, 'menuClose')}>
            <CloseIcon />
          </button>
        </div>

        <section className="drawer-section">
          <h3>{tr(lang, 'menuManeuvers')}</h3>
          {MANEUVER_LIST.map((id) => (
            <button key={id} className="account" onClick={() => onManeuver(id)}>
              <span className="account-info">
                <strong>{tr(lang, `maneuverLabel_${id}`)}</strong>
                <span>{tr(lang, `maneuverHint_${id}`)}</span>
              </span>
            </button>
          ))}
        </section>

        <section className="drawer-section">
          <h3>{tr(lang, 'menuAccount')}</h3>
          <button
            className={`account ${accountId === 'general' ? 'selected' : ''}`}
            onClick={() => pickAccount('general')}
          >
            <span className="avatar">GE</span>
            <span className="account-info">
              <strong>{tr(lang, 'accountGeneral')}</strong>
              <span>{tr(lang, 'menuGeneralHint')}</span>
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
                <span>{tr(lang, 'menuCrewLine', { role: roleLabel(c.role, lang), bracelet: c.bracelet_id })}</span>
              </span>
              {inEmergency(c.crew_id) && <span className="dot dot-danger" title={tr(lang, 'menuActiveEmergency')} />}
            </button>
          ))}
        </section>

        <section className="drawer-section">
          <h3>{tr(lang, 'language')}</h3>
          {account ? (
            <p className="fineprint">
              {tr(lang, 'menuLanguageCrew', { name: account.name, language: tr(lang, `langName_${account.preferredLanguage}`) })}
            </p>
          ) : (
            <>
              <LanguageSwitch lang={lang} onChange={onLanguage} className="segmented segmented--2" />
              <p className="fineprint">{tr(lang, 'menuLanguageGeneral')}</p>
            </>
          )}
        </section>

        <section className="drawer-section">
          <h3>{tr(lang, 'menuLogReading')}</h3>
          <MeasurementEntry key={accountId} accountId={accountId} online={online} lang={lang} />
        </section>

        <section className="drawer-section">
          <h3>{tr(lang, 'menuAudio')}</h3>
          <label className="row-toggle">
            <span>
              {tr(lang, 'menuReadAloud')}
              <small>{tr(lang, audioNote)}</small>
            </span>
            <input type="checkbox" checked={voiceOn} onChange={(e) => setVoiceOn(e.target.checked)} />
          </label>
          <div className="segmented" role="radiogroup" aria-label={tr(lang, 'subtitles')}>
            {[
              ['auto', 'menuSubsAuto'],
              ['on', 'menuSubsOn'],
              ['off', 'menuSubsOff'],
            ].map(([v, key]) => (
              <button
                key={v}
                role="radio"
                aria-checked={subtitleMode === v}
                className={subtitleMode === v ? 'selected' : ''}
                onClick={() => setSubtitleMode(v)}
              >
                {tr(lang, key)}
              </button>
            ))}
          </div>
          <p className="fineprint">{tr(lang, 'menuSubsHint')}</p>
          <p className="fineprint">
            <strong>{tr(lang, 'menuMicLabel')}</strong> {tr(lang, 'menuMicNote')}
          </p>
        </section>

        <section className="drawer-section">
          <h3>{tr(lang, 'menuSimulation')}</h3>
          <div className="sim-row">
            <select value={simCrew} onChange={(e) => setSimCrew(e.target.value)} aria-label={tr(lang, 'menuCrewMember')}>
              {CREW.map((c) => (
                <option key={c.crew_id} value={c.crew_id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select value={simKind} onChange={(e) => setSimKind(e.target.value)} aria-label={tr(lang, 'menuEmergencyType')}>
              {Object.keys(EMERGENCY_TYPES).map((k) => (
                <option key={k} value={k}>
                  {tr(lang, `scenario_${k}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="sim-row">
            <button className="btn btn-danger btn-sm" onClick={() => onSimulate(simCrew, simKind)}>
              {tr(lang, 'menuSimulate')}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onReset}>
              {tr(lang, 'menuReset')}
            </button>
          </div>
          <p className="fineprint">{tr(lang, 'menuSimHint')}</p>
        </section>

        {accountId === 'general' && (
          <section className="drawer-section">
            <h3>{tr(lang, 'menuData')}</h3>
            <DataSection online={online} sync={sync} onChanged={onDataChanged} lang={lang} />
          </section>
        )}

        <p className="drawer-foot">{tr(lang, 'menuFoot')}</p>
      </aside>
    </>
  )
}
