import { useEffect, useRef, useState } from 'react'
import { MicIcon, SendIcon, ChevronIcon } from './Icons'
import { maneuverTitle } from '../lib/maneuvers'
import { localeFor, tr } from '../lib/i18n'

const time = (ms, lang) => new Date(ms).toLocaleTimeString(localeFor(lang), { hour: '2-digit', minute: '2-digit' })

function Entry({ e, onManeuver, lang }) {
  if (e.who === 'system') return <li className="log-system">{e.text}</li>
  const steps = e.protocol?.steps
  const intro = steps && e.protocol.title ? e.text.split(e.protocol.title)[0].trim() : null
  return (
    <li className={`log-entry log-entry--${e.who} ${e.category === 'emergency' ? 'log-entry--emergency' : ''}`}>
      <div className="log-meta">
        <span className="log-name">{e.name}</span>
        <span>{time(e.at, lang)}</span>
        {e.via === 'local' && <span className="log-via">{tr(lang, 'offlineTag')}</span>}
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
          {tr(lang, 'openGuide', { name: maneuverTitle(e.maneuver, lang) })}
        </button>
      )}
    </li>
  )
}

export default function ChatDock({ log, suggestions, busy, onSend, onManeuver, mic, placeholder, lang = 'es' }) {
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
    <section className="dock" aria-label={tr(lang, 'chatLabel')}>
      <button className="dock-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ChevronIcon width={14} height={14} className={open ? 'rot-90' : ''} />
        {tr(lang, 'logTitle')} {log.length > 0 && <span className="count">{log.filter((l) => l.who !== 'system').length}</span>}
      </button>
      {open && (
        <ol className="log" ref={listRef}>
          {log.length === 0 && <li className="log-system">{tr(lang, 'noMessages')}</li>}
          {log.map((e) => (
            <Entry key={e.id} e={e} onManeuver={onManeuver} lang={lang} />
          ))}
          {busy && <li className="log-system">{tr(lang, 'responding')}</li>}
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
          aria-label={mic.listening ? tr(lang, 'micStop') : tr(lang, 'mic')}
          title={mic.supported ? tr(lang, 'micTitleOk') : tr(lang, 'micTitleNo')}
        >
          <MicIcon />
        </button>
        <input
          ref={inputRef}
          value={mic.listening ? mic.interim || text : text}
          onChange={(e) => setText(e.target.value)}
          placeholder={mic.listening ? tr(lang, 'listening') : placeholder}
          aria-label={tr(lang, 'messageLabel')}
          maxLength={2000}
        />
        <button type="submit" className="send" disabled={!text.trim() || busy} aria-label={tr(lang, 'send')}>
          <SendIcon />
        </button>
      </form>
      {(mic.error || !mic.supported) && (
        <p className="composer-note">{mic.error || tr(lang, 'micNoSupport')}</p>
      )}
    </section>
  )
}
