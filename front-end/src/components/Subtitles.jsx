export default function Subtitles({ caption, interim }) {
  if (interim) {
    return (
      <div className="subtitles subtitles--user" aria-live="polite">
        <span className="sub-speaker">Tú</span>
        <span>{interim}</span>
      </div>
    )
  }
  if (!caption) return null
  return (
    <div className={`subtitles ${caption.speaker === 'Alerta' ? 'subtitles--alert' : ''}`} aria-live="polite">
      <span className="sub-speaker">{caption.speaker}</span>
      <span className="sub-text">{caption.text}</span>
    </div>
  )
}
