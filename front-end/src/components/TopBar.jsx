import { useEffect, useState } from 'react'
import { MenuIcon, SpeakerIcon, CaptionIcon } from './Icons'

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return <span className="clock">UTC {now.toISOString().slice(11, 19)}</span>
}

export default function TopBar({ env, account, backendOnline, audioAvailable, showSubs, onMenu, mobilePanel, setMobilePanel, isGeneral }) {
  const togglePanel = (p) => setMobilePanel(mobilePanel === p ? null : p)
  return (
    <header className="topbar">
      <button className="menu-btn" onClick={onMenu} aria-label="Abrir menú">
        <MenuIcon />
        <span>Menú</span>
      </button>
      <div className="brand">
        <span className="brand-name">Moon-C</span>
        <span className="brand-place">
          {env.name} · {env.place}
        </span>
      </div>
      <div className="topbar-right">
        <span className="pill pill-account">
          <span className="avatar avatar-xs">{account ? account.initials : 'GE'}</span>
          {account ? account.name : 'General'}
        </span>
        <span className={`pill ${backendOnline ? 'pill-ok' : ''}`} title={backendOnline ? 'Conectado al backend de Moon-C' : 'Backend no disponible: respuestas simuladas'}>
          <span className="dot" />
          {backendOnline ? 'Backend' : 'Simulado'}
        </span>
        <span className="pill" title={audioAvailable ? 'Voz activa' : 'Sin audio: se muestran subtítulos'}>
          {audioAvailable ? <SpeakerIcon width={15} height={15} /> : <CaptionIcon width={15} height={15} />}
          {audioAvailable ? (showSubs ? 'Voz + subt.' : 'Voz') : 'Subtítulos'}
        </span>
        <Clock />
      </div>
      <div className="mobile-tabs">
        <button className={mobilePanel === 'left' ? 'active' : ''} onClick={() => togglePanel('left')}>
          Anuncios
        </button>
        <button className={mobilePanel === 'right' ? 'active' : ''} onClick={() => togglePanel('right')}>
          {isGeneral ? 'Tripulación' : 'Mis signos'}
        </button>
      </div>
    </header>
  )
}
