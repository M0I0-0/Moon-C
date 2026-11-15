import { useEffect, useRef, useState } from 'react'
import { MicIcon, SendIcon, ChevronIcon } from './Icons'
import { maneuverTitle } from '../lib/maneuvers'
import { useI18n } from '../i18n'

function Entry({ e, onManeuver }) {
  const { lang, t, time } = useI18n()
  // Los avisos del sistema se traducen al cambiar de idioma; los mensajes quedan en el idioma en que se escribieron.
  if (e.who === 'system') return <li className="log-system">{e.key ? t(e.key, e.vars) : e.text}</li>
  const steps = e.protocol?.steps
  const intro = steps && e.protocol.title ? e.text.split(e.protocol.title)[0].trim() : null
  return (
    <li className={`log-entry log-entry--${e.who} ${e.category === 'emergency' ? 'log-entry--emergency' : ''}`}>
      <div className="log-meta">
        <span className="log-name">{e.name}</span>
        <span>{time(e.at)}</span>
        {e.via === 'local' && <span className="log-via">{t('chat.noLink')}</span>}
      </div>
      {steps ? (
        <div className="log-text">
          {intro && <p>{intro}</p>}
          <strong>{e.protocol.title}</strong>
          <ol>
            {steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="log-text">{e.text}</p>
      )}
      {e.maneuver && onManeuver && (
        <button className="chip-btn maneuver-open" onClick={() => onManeuver(e.maneuver)}>
          {t('chat.openGuide', { title: maneuverTitle(e.maneuver, lang) })}
        </button>
      )}
    </li>
  )
}

export default function ChatDock({ log, suggestions, busy, onSend, onManeuver, mic, placeholder }) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [open, setOpen] = useState(true)
  const listRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [log, open])

  const submit = (e) => {
    e.preventDefault()
    if (!text.trim() || busy) return
    onSend(text.trim())
    setText('')
  }

  return (
    <section className="dock" aria-label={t('chat.aria')}>
      <button className="dock-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ChevronIcon width={14} height={14} className={open ? 'rot-90' : ''} />
        {t('chat.log')} {log.length > 0 && <span className="count">{log.filter((l) => l.who !== 'system').length}</span>}
      </button>
      {open && (
        <ol className="log" ref={listRef}>
          {log.length === 0 && <li className="log-system">{t('chat.empty')}</li>}
          {log.map((e) => (
            <Entry key={e.id} e={e} onManeuver={onManeuver} />
          ))}
          {busy && <li className="log-system">{t('chat.busy')}</li>}
        </ol>
      )}
      {suggestions.length > 0 && (
        <div className="chips">
          {suggestions.map((s) => (
            <button key={s} className="chip-btn" onClick={() => onSend(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form className="composer" onSubmit={submit}>
        <button
          type="button"
          className={`mic ${mic.listening ? 'mic--on' : ''}`}
          onClick={mic.listening ? mic.stop : mic.start}
          disabled={!mic.supported}
          aria-pressed={mic.listening}
          aria-label={t(mic.listening ? 'chat.micStop' : 'chat.micStart')}
          title={t(mic.supported ? 'chat.micTitle' : 'chat.micUnsupported')}
        >
          <MicIcon />
        </button>
        <input
          ref={inputRef}
          value={mic.listening ? mic.interim || text : text}
          onChange={(e) => setText(e.target.value)}
          placeholder={mic.listening ? t('chat.listening') : placeholder}
          aria-label={t('chat.message')}
          maxLength={2000}
        />
        <button type="submit" className="send" disabled={!text.trim() || busy} aria-label={t('chat.send')}>
          <SendIcon />
        </button>
      </form>
      {(mic.error || !mic.supported) && (
        <p className="composer-note">{mic.error ? t(`mic.error.${mic.error}`) : t('chat.micUnavailable')}</p>
      )}
    </section>
  )
}
