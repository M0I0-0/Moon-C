import { useI18n } from '../i18n'

export default function Subtitles({ caption, interim }) {
  const { t } = useI18n()
  if (interim) {
    return (
      <div className="subtitles subtitles--user" aria-live="polite">
        <span className="sub-speaker">{t('speaker.you')}</span>
        <span>{interim}</span>
      </div>
    )
  }
  if (!caption) return null
  return (
    <div
      className={`subtitles ${caption.kind === 'alert' ? 'subtitles--alert' : ''}`}
      aria-live="polite"
      lang={caption.lang}
    >
      <span className="sub-speaker">{caption.speaker}</span>
      <span className="sub-text">{caption.text}</span>
    </div>
  )
}
