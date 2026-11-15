import { useState } from 'react'
import { MegaphoneIcon } from './Icons'
import { useI18n } from '../i18n'

// Los anuncios se muestran tal como se escribieron; solo cambia el texto de la interfaz.
export default function Announcements({ items, canPost, onPost, limit }) {
  const { t, time } = useI18n()
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
        <h2>{t('announce.title')}</h2>
        <span className="panel-sub">{t(canPost ? 'announce.canPost' : 'announce.fromGeneral')}</span>
      </div>
      {canPost && (
        <form className="announce-form" onSubmit={submit}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('announce.placeholder')}
            rows={3}
            maxLength={280}
          />
          <div className="announce-opts">
            <label className="check">
              <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />
              {t('announce.important')}
            </label>
            <label className="check">
              <input type="checkbox" checked={readAloud} onChange={(e) => setReadAloud(e.target.checked)} />
              {t('announce.readAloud')}
            </label>
            <button className="btn btn-primary btn-sm" type="submit" disabled={!text.trim()}>
              <MegaphoneIcon width={16} height={16} /> {t('announce.post')}
            </button>
          </div>
        </form>
      )}
      <ul className="announce-list">
        {shown.length === 0 && <li className="empty">{t('announce.empty')}</li>}
        {shown.map((a) => (
          <li key={a.id} className={a.priority === 'important' ? 'announce announce--important' : 'announce'}>
            <div className="announce-meta">
              <span>{a.author}</span>
              <span>{time(a.at)}</span>
            </div>
            <p>{a.text}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
