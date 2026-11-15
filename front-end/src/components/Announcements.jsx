import { useState } from 'react'
import { formatTime, tr } from '../lib/i18n'
import { MegaphoneIcon } from './Icons'

// Los anuncios se muestran tal como se escribieron; solo cambia el texto de la interfaz.
export default function Announcements({ items, canPost, onPost, limit, lang = 'es' }) {
  const [text, setText] = useState('')
  const [important, setImportant] = useState(false)
  const [readAloud, setReadAloud] = useState(true)

  const submit = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    onPost({ text: text.trim(), priority: important ? 'important' : 'normal', readAloud })
    setText('')
    setImportant(false)
  }

  const shown = limit ? items.slice(0, limit) : items
  return (
    <div className="announcements">
      <div className="panel-head">
        <h2>{tr(lang, 'announceTitle')}</h2>
        <span className="panel-sub">{tr(lang, canPost ? 'announceCanPost' : 'announceFromGeneral')}</span>
      </div>
      {canPost && (
        <form className="announce-form" onSubmit={submit}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={tr(lang, 'announcePlaceholder')}
            rows={3}
            maxLength={280}
          />
          <div className="announce-opts">
            <label className="check">
              <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />
              {tr(lang, 'announceImportant')}
            </label>
            <label className="check">
              <input type="checkbox" checked={readAloud} onChange={(e) => setReadAloud(e.target.checked)} />
              {tr(lang, 'announceReadAloud')}
            </label>
            <button className="btn btn-primary btn-sm" type="submit" disabled={!text.trim()}>
              <MegaphoneIcon width={16} height={16} /> {tr(lang, 'announcePost')}
            </button>
          </div>
        </form>
      )}
      <ul className="announce-list">
        {shown.length === 0 && <li className="empty">{tr(lang, 'announceEmpty')}</li>}
        {shown.map((a) => (
          <li key={a.id} className={a.priority === 'important' ? 'announce announce--important' : 'announce'}>
            <div className="announce-meta">
              <span>{a.author}</span>
              <span>{formatTime(a.at, lang)}</span>
            </div>
            <p>{a.text}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
