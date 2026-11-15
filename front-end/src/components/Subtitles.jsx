import { tr } from '../lib/i18n'

export default function Subtitles({ caption, interim, lang = 'es' }) {
  if (interim) {
    return (
      <div className="subtitles subtitles--user" aria-live="polite">
        <span className="sub-speaker">{tr(lang, 'speakerYou')}</span>
        <span>{interim}</span>
      </div>
    )
  }
  if (!caption) return null
  return (
    <div className={`subtitles ${caption.kind === 'alert' ? 'subtitles--alert' : ''}`} aria-live="polite">
      <span className="sub-speaker">{caption.speaker}</span>
      <span className="sub-text">{caption.text}</span>
    </div>
  )
}
