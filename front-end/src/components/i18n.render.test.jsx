// Renderiza los paneles del dashboard en cada idioma y revisa que no se cuele texto fijo del otro idioma.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DICT } from '../lib/i18n'
import { CREW, INDICATORS } from '../data/manual'
import { ENVIRONMENTS } from '../data/environments'
import TopBar from './TopBar'
import MenuDrawer from './MenuDrawer'
import VitalsPanel from './VitalsPanel'
import CrewOverview, { EmergencyDetail } from './CrewOverview'
import ChatDock from './ChatDock'
import VitalDetail from './VitalDetail'
import Announcements from './Announcements'
import ManeuverPanel from './ManeuverPanel'
import AlertBanner from './AlertBanner'
import Subtitles from './Subtitles'
import AiMark from './AiMark'

const VALUES = {
  heart_rate: 70,
  blood_pressure: 120,
  bp_diastolic: 75,
  spo2: 97,
  respiratory_rate: 14,
  body_temperature: 36.6,
  radiation: 30,
  sleep_hours: 7.5,
  mood: 4,
}
const member = { values: VALUES, history: Object.fromEntries(INDICATORS.map((i) => [i, [VALUES[i], VALUES[i]]])), updatedAt: 0 }
const members = Object.fromEntries(CREW.map((c) => [c.crew_id, member]))
const mic = { supported: true, listening: false, interim: '', error: '', start() {}, stop() {} }
const audio = { supported: true, hasVoices: true, hasSpeakers: true, moonVoice: false }
const noop = () => {}
const vitalAlert = { id: 'a1', kind: 'vital', crewId: 'ana', indicator: 'spo2', value: 86, unit: '%', createdAt: 0 }

function screen(lang, accountId = 'general') {
  const account = CREW.find((c) => c.crew_id === accountId) ?? null
  return renderToStaticMarkup(
    <>
      <TopBar env={ENVIRONMENTS.home} account={account} backendOnline earth={null} audioAvailable showSubs={false}
        onMenu={noop} mobilePanel={null} setMobilePanel={noop} isGeneral={!account} lang={lang} onLanguage={noop} />
      <MenuDrawer open onClose={noop} accountId={accountId} setAccountId={noop} inEmergency={() => false} voiceOn
        setVoiceOn={noop} subtitleMode="auto" setSubtitleMode={noop} audio={audio} onSimulate={noop} onReset={noop}
        onManeuver={noop} online={false} lang={lang} onLanguage={noop} sync={null} onDataChanged={noop} />
      <AiMark lang={lang} />
      <AlertBanner alerts={[vitalAlert]} isGeneral onOpen={noop} onAck={noop} lang={lang} />
      <VitalsPanel member={member} onSelect={noop} lang={lang} />
      <CrewOverview members={members} activeAlerts={[]} onOpen={noop} lang={lang} />
      <EmergencyDetail crewId="ana" member={member} alerts={[vitalAlert]} accessAt={0} onBack={noop} onResolve={noop}
        onSelectVital={noop} lang={lang} />
      <VitalDetail crew={CREW[0]} member={member} indicator="spo2" onClose={noop} onNav={noop} lang={lang} />
      <Announcements items={[]} canPost onPost={noop} lang={lang} />
      <ManeuverPanel id="rcp" entorno="iss" state={null} ctrlRef={{ current: null }} onEnv={noop} onSoloManos={noop}
        onClose={noop} lang={lang} />
      <ChatDock log={[]} suggestions={[]} busy onSend={noop} onManeuver={noop} mic={mic} placeholder="" lang={lang} />
      <Subtitles caption={null} interim="hola" lang={lang} />
    </>,
  )
}

// Textos propios de un idioma (sin {datos} y distintos en el otro), escapados como en el HTML y buscados
// como palabras completas ("Important" no debe coincidir dentro de "Importante").
const html = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
const asWords = (text) => new RegExp(`(?<![\\p{L}])${html(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u')
const ownTexts = (lang, other) =>
  Object.entries(DICT[lang])
    .filter(([key, text]) => !text.includes('{') && text.length > 4 && DICT[other][key] !== text)
    .map(([, text]) => text.trim())

describe('el dashboard cambia completo de idioma', () => {
  it.each([
    ['en', 'es'],
    ['es', 'en'],
  ])('en %s no aparece ningún texto fijo en %s', (lang, other) => {
    for (const accountId of ['general', 'ana', 'ruben']) {
      const out = screen(lang, accountId)
      for (const text of ownTexts(other, lang)) expect(out, `${accountId}: "${text}"`).not.toMatch(asWords(text))
    }
  })

  it('el selector ES/EN solo aparece en la cuenta General', () => {
    expect(screen('es', 'general')).toContain('role="radiogroup" aria-label="Idioma"')
    expect(screen('en', 'ana')).not.toContain('aria-label="Language"')
    expect(screen('en', 'ana')).toContain('Ana&#x27;s screen is in English (by nationality)')
  })

  it('las alertas van en el idioma de la cuenta', () => {
    expect(screen('es', 'general')).toContain('Alerta: Ana, SpO₂ 86 %')
    expect(screen('en', 'general')).toContain('Alert: Ana, SpO₂ 86 %')
    expect(screen('en', 'general')).toContain('SpO₂ in urgent range')
  })

  it('la guía 3D muestra el título y los entornos en el idioma de la pantalla', () => {
    expect(screen('en')).toContain('CPR (cardiac arrest)')
    expect(screen('en')).toContain('Space station (low Earth orbit)')
    expect(screen('es')).toContain('RCP (paro cardiaco)')
  })
})

// AI disclosure (NASA Space Apps rules, see AI_DISCLOSURE.md).
describe('AI-generated content is marked on screen', () => {
  it('shows the visible AI watermark in the screen language', () => {
    expect(screen('es')).toContain('Generado con IA: cara y voz de Moon-C')
    expect(screen('en')).toContain('AI-generated: Moon-C&#x27;s face and voice')
  })

  it('tags only the replies written by the local AI', () => {
    const log = [
      { id: 1, who: 'assistant', name: 'Moon-C', at: 0, text: 'Hola, ¿cómo va tu día?', aiUsed: true },
      { id: 2, who: 'assistant', name: 'Moon-C', at: 0, text: 'Dolor de pecho: cómo ayudar', aiUsed: false },
    ]
    const dock = (lang) =>
      renderToStaticMarkup(
        <ChatDock log={log} suggestions={[]} busy={false} onSend={noop} onManeuver={noop} mic={mic} placeholder="" lang={lang} />,
      )
    expect(dock('es').match(/log-via log-ai/g)).toHaveLength(1)
    expect(dock('es')).toContain('>IA</span>')
    expect(dock('en')).toContain('>AI</span>')
    expect(dock('en')).toContain('Reply written by the local AI (Ollama)')
  })
})
