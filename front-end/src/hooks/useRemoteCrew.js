import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { ALERT_LANGUAGE } from '../lib/alerts'
import { alertFromBackend, membersFromVitals } from '../lib/vitals'

const POLL_MS = 2500
const language = ALERT_LANGUAGE // las alertas van siempre en inglés, sea cual sea el idioma de la pantalla

/**
 * Signos vitales y alertas desde el backend (pulseras simuladas): una sola fuente para todas
 * las pantallas. Misma interfaz que useCrewSimulation; `ready` es false si el backend no
 * responde o tiene la simulación apagada, y entonces la app usa la simulación local.
 */
export function useRemoteCrew(enabled) {
  const [state, setState] = useState({ ready: false, members: {}, alerts: [] })
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const [vitals, alerts] = await Promise.all([api.vitals(), api.alerts({ language })])
      if (!mounted.current) return
      if (!vitals.length) {
        setState((s) => ({ ...s, ready: false }))
        return
      }
      // El backend las da de la más nueva a la más vieja; la app las espera en orden de llegada.
      setState({ ready: true, members: membersFromVitals(vitals), alerts: alerts.map(alertFromBackend).reverse() })
    } catch {
      if (mounted.current) setState((s) => ({ ...s, ready: false }))
    }
  }, [])

  useEffect(() => {
    if (!enabled) return undefined
    refresh()
    const t = setInterval(refresh, POLL_MS)
    return () => clearInterval(t)
  }, [enabled, refresh])

  const triggerEmergency = useCallback(
    async (crewId, scenario) => {
      await api.simulateEmergency(crewId, scenario).catch(() => {})
      refresh()
    },
    [refresh],
  )

  const acknowledge = useCallback(
    async (id) => {
      setState((s) => ({ ...s, alerts: s.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)) }))
      await api.ackAlert(id, language).catch(() => {})
      refresh()
    },
    [refresh],
  )

  // "Emergencia atendida": cierra las alertas y termina la emergencia simulada (crewId vacío = todos).
  const resolve = useCallback(
    async (crewId) => {
      setState((s) => ({ ...s, alerts: crewId ? s.alerts.filter((a) => a.crewId !== crewId) : [] }))
      await Promise.allSettled([api.resolveCrewAlerts(crewId ?? null), api.simulationReset(crewId ?? null)])
      refresh()
    },
    [refresh],
  )

  // El backend ya crea la alerta cuando el chat detecta una emergencia.
  const reportFromChat = useCallback(() => {}, [])

  const activeAlerts = state.alerts.filter((a) => !a.resolved)
  const inEmergency = (crewId) => activeAlerts.some((a) => a.crewId === crewId)

  return {
    ready: state.ready,
    members: state.members,
    alerts: state.alerts,
    activeAlerts,
    inEmergency,
    triggerEmergency,
    reportFromChat,
    acknowledge,
    resolve,
    refresh,
  }
}
