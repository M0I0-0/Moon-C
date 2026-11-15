import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { CREW, INDICATORS, UNIT, crewById, indicatorName, toManualKey, unitLabel } from '../data/manual'
import { tr } from '../lib/i18n'

const toNumber = (text) => Number(String(text).trim().replace(',', '.'))

/**
 * Registrar una lectura a mano (POST /measurements). El backend la compara con el manual,
 * avisa si es urgente y, si no se sabe de quién es, pide confirmarlo (cuenta General).
 * El mensaje y los pasos vuelven en el idioma de la pantalla.
 */
export default function MeasurementEntry({ accountId, online, lang = 'es' }) {
  const language = lang
  const t = (key, vars) => tr(lang, key, vars)
  const label = (indicator) => (indicator === 'blood_pressure' ? t('entryBloodPressure') : indicatorName(indicator, language))
  const isGeneral = accountId === 'general'
  const [crewChoice, setCrewChoice] = useState('')
  const [indicator, setIndicator] = useState('body_temperature')
  const [value, setValue] = useState('')
  const [diastolic, setDiastolic] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState([])

  const isPressure = indicator === 'blood_pressure'

  const loadPending = useCallback(async () => {
    if (!online || !isGeneral) return
    try {
      setPending(await api.unassignedMeasurements())
    } catch {
      setPending([])
    }
  }, [online, isGeneral])

  useEffect(() => {
    loadPending()
  }, [loadPending])

  if (!online) return <p className="fineprint">{t('entryNoLink')}</p>

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setResult(null)
    setBusy(true)
    const crewId = isGeneral ? crewChoice || null : accountId
    const readings = isPressure
      ? [
          ['blood_pressure_systolic', value],
          ['blood_pressure_diastolic', diastolic],
        ]
      : [[toManualKey(indicator), value]]
    try {
      const saved = []
      for (const [ind, text] of readings) {
        saved.push(await api.createMeasurement({ crewId, indicator: ind, value: toNumber(text), unit: UNIT[indicator], language }))
      }
      const worst = saved.find((m) => m.status === 'urgent') ?? saved.find((m) => m.status === 'attention') ?? saved[0]
      setResult({ saved, guidance: worst.guidance, needsConfirmation: saved[0].needs_confirmation, assignedTo: null })
      setValue('')
      setDiastolic('')
      loadPending()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const assign = async (ids, crewId) => {
    try {
      await Promise.all(ids.map((id) => api.assignMeasurement(id, crewId)))
      setResult((r) => (r ? { ...r, needsConfirmation: false, assignedTo: crewId } : r))
      loadPending()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <form className="entry" onSubmit={submit}>
      {isGeneral && (
        <div className="sim-row">
          <select value={crewChoice} onChange={(e) => setCrewChoice(e.target.value)} aria-label={t('entryCrewMember')}>
            <option value="">{t('entryUnassigned')}</option>
            {CREW.map((c) => (
              <option key={c.crew_id} value={c.crew_id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="sim-row">
        <select value={indicator} onChange={(e) => setIndicator(e.target.value)} aria-label={t('entryIndicator')}>
          {INDICATORS.map((i) => (
            <option key={i} value={i}>
              {label(i)}
            </option>
          ))}
        </select>
      </div>
      <div className="sim-row">
        <input
          className="entry-input"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t(isPressure ? 'entrySystolic' : 'entryValue')}
          aria-label={t(isPressure ? 'entrySystolicAria' : 'entryValue')}
        />
        {isPressure && (
          <input
            className="entry-input"
            inputMode="decimal"
            value={diastolic}
            onChange={(e) => setDiastolic(e.target.value)}
            placeholder={t('entryDiastolic')}
            aria-label={t('entryDiastolicAria')}
          />
        )}
        <span className="entry-unit">{unitLabel(indicator, language)}</span>
        <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !value || (isPressure && !diastolic)}>
          {t('entrySubmit')}
        </button>
      </div>

      {error && (
        <p className="entry-error" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="entry-result" role="status">
          {result.saved.map((m) => (
            <p key={m.id} className={`entry-status entry-status--${m.status}`}>
              {m.message}
            </p>
          ))}
          {result.guidance.length > 0 && (
            <ul>
              {result.guidance.map((g) => (
                <li key={g}>{g}</li>
              ))}
            </ul>
          )}
          {result.needsConfirmation && (
            <div className="sim-row entry-assign">
              {CREW.map((c) => (
                <button
                  key={c.crew_id}
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => assign(result.saved.map((m) => m.id), c.crew_id)}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
          {result.assignedTo && <p className="fineprint">{t('entryAssignedTo', { name: crewById(result.assignedTo)?.name })}</p>}
        </div>
      )}

      {isGeneral && pending.length > 0 && !result?.needsConfirmation && (
        <div className="entry-pending">
          <p className="fineprint">{t('entryPending', { count: pending.length })}</p>
          {pending.slice(-5).map((m) => (
            <div key={m.id} className="sim-row">
              <span className="entry-unit">
                {label(m.indicator === 'blood_pressure_systolic' ? 'blood_pressure' : m.indicator)} {m.value} {m.unit}
              </span>
              <select
                defaultValue=""
                aria-label={t('entryConfirmCrew')}
                onChange={(e) => e.target.value && assign([m.id], e.target.value)}
              >
                <option value="">{t('entryWhose')}</option>
                {CREW.map((c) => (
                  <option key={c.crew_id} value={c.crew_id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </form>
  )
}
