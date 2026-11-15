import { useEffect, useState } from 'react'
import { CREW, crewById, roleLabel } from '../data/manual'
import { EMERGENCY_TYPES } from '../hooks/useCrewSimulation'
import { CloseIcon } from './Icons'
import { MANEUVER_LIST } from '../lib/maneuvers'
import MeasurementEntry from './MeasurementEntry'
import DataSection from './DataSection'
import { LanguageSwitch } from './TopBar'
import { useI18n } from '../i18n'

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
  onLanguage,
  sync,
  onDataChanged,
}) {
  const { lang, t } = useI18n()
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
    ? 'menu.noVoice'
    : audio.hasSpeakers === false
      ? 'menu.noSpeakers'
      : !audio.hasVoices
        ? 'menu.noLocalVoice'
        : audio.moonVoice
          ? 'menu.moonVoice'
          : 'menu.localVoice'

  return (
    <>
      <div className={`drawer-overlay ${open ? 'visible' : ''}`} onClick={onClose} />
      <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open} aria-label={t('menu.label')}>
        <div className="drawer-head">
          <span className="brand-name">Moon-C</span>
          <button className="icon-btn" onClick={onClose} aria-label={t('menu.close')}>
            <CloseIcon />
          </button>
        </div>

        <section className="drawer-section">
          <h3>{t('menu.maneuvers')}</h3>
          {MANEUVER_LIST.map((id) => (
            <button key={id} className="account" onClick={() => onManeuver(id)}>
              <span className="account-info">
                <strong>{t(`maneuver.${id}.label`)}</strong>
                <span>{t(`maneuver.${id}.hint`)}</span>
              </span>
            </button>
          ))}
        </section>

        <section className="drawer-section">
          <h3>{t('menu.account')}</h3>
          <button
            className={`account ${accountId === 'general' ? 'selected' : ''}`}
            onClick={() => pickAccount('general')}
          >
            <span className="avatar">GE</span>
            <span className="account-info">
              <strong>{t('account.general')}</strong>
              <span>{t('menu.generalHint')}</span>
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
                <span>{t('menu.crewLine', { role: roleLabel(c.role, lang), bracelet: c.bracelet_id })}</span>
              </span>
              {inEmergency(c.crew_id) && <span className="dot dot-danger" title={t('menu.activeEmergency')} />}
            </button>
          ))}
        </section>

        <section className="drawer-section">
          <h3>{t('menu.language')}</h3>
          {account ? (
            <p className="fineprint">
              {t('menu.languageCrew', { name: account.name, language: t(`lang.${account.preferredLanguage}`) })}
            </p>
          ) : (
            <>
              <LanguageSwitch onChange={onLanguage} className="segmented segmented--2" />
              <p className="fineprint">{t('menu.languageGeneral')}</p>
            </>
          )}
        </section>

        <section className="drawer-section">
          <h3>{t('menu.logReading')}</h3>
          <MeasurementEntry key={accountId} accountId={accountId} online={online} />
        </section>

        <section className="drawer-section">
          <h3>{t('menu.audio')}</h3>
          <label className="row-toggle">
            <span>
              {t('menu.readAloud')}
              <small>{t(audioNote)}</small>
            </span>
            <input type="checkbox" checked={voiceOn} onChange={(e) => setVoiceOn(e.target.checked)} />
          </label>
          <div className="segmented" role="radiogroup" aria-label={t('menu.subtitles')}>
            {[
              ['auto', 'menu.subsAuto'],
              ['on', 'menu.subsOn'],
              ['off', 'menu.subsOff'],
            ].map(([v, key]) => (
              <button
                key={v}
                role="radio"
                aria-checked={subtitleMode === v}
                className={subtitleMode === v ? 'selected' : ''}
                onClick={() => setSubtitleMode(v)}
              >
                {t(key)}
              </button>
            ))}
          </div>
          <p className="fineprint">{t('menu.subsHint')}</p>
          <p className="fineprint">
            <strong>{t('menu.micLabel')}</strong> {t('menu.micNote')}
          </p>
        </section>

        <section className="drawer-section">
          <h3>{t('menu.simulation')}</h3>
          <div className="sim-row">
            <select value={simCrew} onChange={(e) => setSimCrew(e.target.value)} aria-label={t('menu.crewMember')}>
              {CREW.map((c) => (
                <option key={c.crew_id} value={c.crew_id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select value={simKind} onChange={(e) => setSimKind(e.target.value)} aria-label={t('menu.emergencyType')}>
              {Object.keys(EMERGENCY_TYPES).map((k) => (
                <option key={k} value={k}>
                  {t(`scenario.${k}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="sim-row">
            <button className="btn btn-danger btn-sm" onClick={() => onSimulate(simCrew, simKind)}>
              {t('menu.simulate')}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onReset}>
              {t('menu.reset')}
            </button>
          </div>
          <p className="fineprint">{t('menu.simHint')}</p>
        </section>

        {accountId === 'general' && (
          <section className="drawer-section">
            <h3>{t('menu.data')}</h3>
            <DataSection online={online} sync={sync} onChanged={onDataChanged} />
          </section>
        )}

        <p className="drawer-foot">{t('menu.foot')}</p>
      </aside>
    </>
  )
}
