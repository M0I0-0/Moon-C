import { useEffect, useRef, useState } from 'react'
import { MicIcon, SendIcon, ChevronIcon } from './Icons'
import { MANIOBRAS } from '../lib/maneuvers'

const time = (ms) => new Date(ms).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

function Entry({ e, onManeuver }) {
  if (e.who === 'system') return <li className="log-system">{e.text}</li>
  const steps = e.protocol?.steps
  const intro = steps && e.protocol.title ? e.text.split(e.protocol.title)[0].trim() : null
  return (
    <li className={`log-entry log-entry--${e.who} ${e.category === 'emergency' ? 'log-entry--emergency' : ''}`}>
      <div className="log-meta">
        <span className="log-name">{e.name}</span>
        <span>{time(e.at)}</span>
        {e.via === 'local' && <span className="log-via">sin enlace</span>}
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
          Abrir guía 3D: {MANIOBRAS[e.maneuver].titulo}
        </button>
      )}
    </li>
  )
}

export default function ChatDock({ log, suggestions, busy, onSend, onManeuver, mic, placeholder }) {
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
    <section className="dock" aria-label="Conversación con Moon-C">
      <button className="dock-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <ChevronIcon width={14} height={14} className={open ? 'rot-90' : ''} />
        Bitácora {log.length > 0 && <span className="count">{log.filter((l) => l.who !== 'system').length}</span>}
      </button>
      {open && (
        <ol className="log" ref={listRef}>
          {log.length === 0 && <li className="log-system">Sin mensajes todavía.</li>}
          {log.map((e) => (
            <Entry key={e.id} e={e} onManeuver={onManeuver} />
          ))}
          {busy && <li className="log-system">Moon-C está respondiendo…</li>}
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
          aria-label={mic.listening ? 'Detener micrófono' : 'Hablar'}
          title={mic.supported ? 'Hablar' : 'Este navegador no permite dictado. Usa Chrome o Edge, o escribe.'}
        >
          <MicIcon />
        </button>
        <input
          ref={inputRef}
          value={mic.listening ? mic.interim || text : text}
          onChange={(e) => setText(e.target.value)}
          placeholder={mic.listening ? 'Escuchando…' : placeholder}
          aria-label="Mensaje"
          maxLength={2000}
        />
        <button type="submit" className="send" disabled={!text.trim() || busy} aria-label="Enviar">
          <SendIcon />
        </button>
      </form>
      {(mic.error || !mic.supported) && (
        <p className="composer-note">{mic.error || 'Dictado no disponible en este navegador: puedes escribir.'}</p>
      )}
    </section>
  )
}
