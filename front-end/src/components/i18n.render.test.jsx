// Renderiza los paneles del dashboard en cada idioma y revisa que no se cuele texto del otro idioma.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { I18nContext, makeI18n } from '../i18n'
import { STRINGS } from '../i18n/strings'
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
    <I18nContext.Provider value={makeI18n(lang)}>
      <TopBar env={ENVIRONMENTS.home} account={account} backendOnline earth={null} audioAvailable showSubs={false}
        onMenu={noop} mobilePanel={null} setMobilePanel={noop} isGeneral={!account} onLanguage={noop} />
      <MenuDrawer open onClose={noop} accountId={accountId} setAccountId={noop} inEmergency={() => false} voiceOn
        setVoiceOn={noop} subtitleMode="auto" setSubtitleMode={noop} audio={audio} onSimulate={noop} onReset={noop}
        onManeuver={noop} online={false} onLanguage={noop} sync={null} onDataChanged={noop} />
      <VitalsPanel member={member} onSelect={noop} />
      <CrewOverview members={members} activeAlerts={[]} onOpen={noop} />
      <EmergencyDetail crewId="ana" member={member} alerts={[vitalAlert]} accessAt={0} onBack={noop} onResolve={noop}
        onSelectVital={noop} />
      <VitalDetail crew={CREW[0]} member={member} indicator="spo2" onClose={noop} onNav={noop} />
      <Announcements items={[]} canPost onPost={noop} />
      <ManeuverPanel id="rcp" entorno="iss" state={null} ctrlRef={{ current: null }} onEnv={noop} onSoloManos={noop}
        onClose={noop} />
      <ChatDock log={[{ id: 's', at: 0, who: 'system', key: 'chat.sessionStarted', vars: { name: 'General' } }]}
        suggestions={[]} busy onSend={noop} onManeuver={noop} mic={mic} placeholder="" />
    </I18nContext.Provider>,
  )
}

// Textos propios de un idioma (sin {datos} y distintos en el otro), escapados como en el HTML y buscados
// como palabras completas ("Important" no debe coincidir dentro de "Importante").
const html = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
const asWords = (text) => new RegExp(`(?<![\\p{L}])${html(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u')
const ownTexts = (lang, other) =>
  Object.entries(STRINGS[lang])
    .filter(([key, text]) => !text.includes('{') && text.length > 4 && STRINGS[other][key] !== text)
    .map(([, text]) => text.trim())

describe('el dashboard cambia completo de idioma', () => {
  it.each([
    ['en', 'es'],
    ['es', 'en'],
  ])('en %s no aparece ningún texto de la interfaz en %s', (lang, other) => {
    for (const accountId of ['general', 'ana', 'ruben']) {
      const out = screen(lang, accountId)
      for (const text of ownTexts(other, lang)) expect(out, `${accountId}: "${text}"`).not.toMatch(asWords(text))
    }
  })

  it('el selector ES/EN solo aparece en la cuenta General', () => {
    expect(screen('es', 'general')).toContain('role="radiogroup" aria-label="Idioma"')
    expect(screen('en', 'ana')).not.toContain('aria-label="Language"')
    expect(screen('en', 'ana')).toContain('Ana&#x27;s profile uses English (by nationality)')
  })

  it('las alertas van en inglés aunque la pantalla esté en español', () => {
    const es = screen('es', 'general')
    expect(es).toContain('SpO₂ in urgent range')
    expect(es).toContain('Marcar emergencia como atendida')
    const banner = renderToStaticMarkup(
      <I18nContext.Provider value={makeI18n('es')}>
        <AlertBanner alerts={[vitalAlert]} isGeneral onOpen={noop} onAck={noop} />
      </I18nContext.Provider>,
    )
    expect(banner).toContain('Alert: Ana, oxygen saturation (SpO2) 86 %')
    expect(banner).toContain('The medical officer has been notified.')
    expect(banner).toContain('Acknowledge')
  })
})
