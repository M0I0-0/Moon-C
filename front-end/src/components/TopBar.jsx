import { useEffect, useState } from 'react'
import { MenuIcon, SpeakerIcon, CaptionIcon } from './Icons'
import { LANGUAGES, useI18n } from '../i18n'

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return <span className="clock">UTC {now.toISOString().slice(11, 19)}</span>
}

/**
 * Idioma de la pantalla. La cuenta General lo cambia aquí (o sola, al escribirle en el otro idioma);
 * cada tripulante usa el de su perfil, así que solo se muestra.
 */
export function LanguageSwitch({ account, onChange, className = 'lang-switch' }) {
  const { lang, t } = useI18n()
  if (account) {
    return (
      <span className="pill" title={t('topbar.languageCrew', { name: account.name })}>
        {lang.toUpperCase()}
      </span>
    )
  }
  return (
    <span className={className} role="radiogroup" aria-label={t('topbar.language')} title={t('topbar.languageGeneral')}>
      {LANGUAGES.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={lang === l}
          className={lang === l ? 'selected' : ''}
          onClick={() => onChange(l)}
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
  onLanguage,
}) {
  const { t } = useI18n()
  const toSend = earth ? earth.pending + earth.pending_reports : 0
  const togglePanel = (p) => setMobilePanel(mobilePanel === p ? null : p)
  return (
    <header className="topbar">
      <button className="menu-btn" onClick={onMenu} aria-label={t('topbar.openMenu')}>
        <MenuIcon />
        <span>{t('topbar.menu')}</span>
      </button>
      <div className="brand">
        <span className="brand-name">Moon-C</span>
        <span className="brand-place">
          {t(env.nameKey)} · {t(env.placeKey)}
        </span>
      </div>
      <div className="topbar-right">
        <span className="pill pill-account">
          <span className="avatar avatar-xs">{account ? account.initials : 'GE'}</span>
          {account ? account.name : t('account.general')}
        </span>
        <LanguageSwitch account={account} onChange={onLanguage} />
        <span className={`pill ${backendOnline ? 'pill-ok' : ''}`} title={t(backendOnline ? 'topbar.backendOn' : 'topbar.backendOff')}>
          <span className="dot" />
          {t(backendOnline ? 'topbar.backend' : 'topbar.noLink')}
        </span>
        {earth && (
          <span
            className={`pill ${earth.earth_link === 'online' ? 'pill-ok' : ''}`}
            title={t('topbar.earthTitle', {
              state: t(earth.earth_link === 'online' ? 'topbar.online' : 'topbar.offline'),
              readings: earth.pending,
              reports: earth.pending_reports,
            })}
          >
            {t('topbar.earth')}
            {toSend > 0 ? t('topbar.toSend', { count: toSend }) : ''}
          </span>
        )}
        <span className="pill" title={t(audioAvailable ? 'topbar.voiceOn' : 'topbar.noAudio')}>
          {audioAvailable ? <SpeakerIcon width={15} height={15} /> : <CaptionIcon width={15} height={15} />}
          {t(audioAvailable ? (showSubs ? 'topbar.voiceSubs' : 'topbar.voice') : 'topbar.subtitles')}
        </span>
        <Clock />
      </div>
      <div className="mobile-tabs">
        <button className={mobilePanel === 'left' ? 'active' : ''} onClick={() => togglePanel('left')}>
          {t('topbar.announcements')}
        </button>
        <button className={mobilePanel === 'right' ? 'active' : ''} onClick={() => togglePanel('right')}>
          {t(isGeneral ? 'topbar.crew' : 'topbar.myVitals')}
        </button>
      </div>
    </header>
  )
}
