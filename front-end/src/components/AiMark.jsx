import { tr } from '../lib/i18n'

/**
 * Visible AI watermark over the 3D scene (NASA Space Apps rules, see AI_DISCLOSURE.md): Moon-C's face
 * texture was generated with AI and her own voice is AI-synthesized. Always shown, so every screenshot or
 * video of the app carries it.
 */
export default function AiMark({ lang = 'es' }) {
  return (
    <p className="ai-mark" title={tr(lang, 'aiMarkTitle')}>
      {tr(lang, 'aiMark')}
    </p>
  )
}
