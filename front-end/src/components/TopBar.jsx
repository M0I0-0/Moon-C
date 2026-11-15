import { useEffect, useState } from 'react'
import { LANGUAGES, tr } from '../lib/i18n'
import { MenuIcon, SpeakerIcon, CaptionIcon } from './Icons'

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return <span className="clock">UTC {now.toISOString().slice(11, 19)}</span>
}

/**
 * Idioma de la pantalla. La cuenta General lo cambia aquí (o solo, cuando le escriben en el otro idioma);
 * cada tripulante ve la pantalla en el idioma de su perfil, así que solo se muestra.
 */
export function LanguageSwitch({ lang = 'es', account = null, onChange, className = 'lang-switch' }) {
  if (account) {
    return (
      <span className="pill" title={tr(lang, 'languageCrew', { name: account.name })}>
        {lang.toUpperCase()}
      </span>
    )
  }
  return (
    <span className={className} role="radiogroup" aria-label={tr(lang, 'language')} title={tr(lang, 'languageGeneral')}>
      {LANGUAGES.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={lang === l}
          className={lang === l ? 'selected' : ''}
          onClick={() => onChange?.(l)}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </span>
  )
}

export default function TopBar({
  env,
  account,
  backendOnline,
  earth,
  audioAvailable,
  showSubs,
  onMenu,
  mobilePanel,
  setMobilePanel,
  isGeneral,
  lang = 'es',
  onLanguage,
}) {
  const toSend = earth ? earth.pending + earth.pending_reports : 0
  const togglePanel = (p) => setMobilePanel(mobilePanel === p ? null : p)
  return (
    <header className="topbar">
      <button className="menu-btn" onClick={onMenu} aria-label={tr(lang, 'openMenu')}>
        <MenuIcon />
        <span>{tr(lang, 'menu')}</span>
      </button>
      <div className="brand">
        <span className="brand-name">Moon-C</span>
        <span className="brand-place">
          {tr(lang, env.nameKey)} · {tr(lang, env.placeKey)}
        </span>
      </div>
      <div className="topbar-right">
        <span className="pill pill-account">
          <span className="avatar avatar-xs">{account ? account.initials : 'GE'}</span>
          {account ? account.name : tr(lang, 'accountGeneral')}
        </span>
        <LanguageSwitch lang={lang} account={account} onChange={onLanguage} />
        <span className={`pill ${backendOnline ? 'pill-ok' : ''}`} title={tr(lang, backendOnline ? 'backendOn' : 'backendOff')}>
          <span className="dot" />
          {tr(lang, backendOnline ? 'backendLabel' : 'noLink')}
        </span>
        {earth && (
          <span
            className={`pill ${earth.earth_link === 'online' ? 'pill-ok' : ''}`}
            title={tr(lang, 'earthTitle', {
              state: tr(lang, earth.earth_link === 'online' ? 'linkOnline' : 'linkOffline'),
              readings: earth.pending,
              reports: earth.pending_reports,
            })}
          >
            {tr(lang, 'earth')}
            {toSend > 0 ? tr(lang, 'toSend', { count: toSend }) : ''}
          </span>
        )}
        <span className="pill" title={tr(lang, audioAvailable ? 'voiceOn' : 'noAudio')}>
          {audioAvailable ? <SpeakerIcon width={15} height={15} /> : <CaptionIcon width={15} height={15} />}
          {tr(lang, audioAvailable ? (showSubs ? 'voiceSubs' : 'voice') : 'subtitles')}
        </span>
        <Clock />
      </div>
      <div className="mobile-tabs">
        <button className={mobilePanel === 'left' ? 'active' : ''} onClick={() => togglePanel('left')}>
          {tr(lang, 'announceTitle')}
        </button>
        <button className={mobilePanel === 'right' ? 'active' : ''} onClick={() => togglePanel('right')}>
          {isGeneral ? tr(lang, 'crewTitle') : tr(lang, 'mySigns')}
        </button>
      </div>
    </header>
  )
}
