import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'

const POLL_MS = 20000

/** Estado del enlace con la Tierra (simulado): pendientes por enviar y última sincronización. */
export function useSyncStatus(online) {
  const [status, setStatus] = useState(null)

  const refresh = useCallback(async () => {
    try {
      setStatus(await api.syncStatus())
    } catch {
      setStatus(null)
    }
  }, [])

  useEffect(() => {
    if (!online) return undefined
    refresh()
    const t = setInterval(refresh, POLL_MS)
    return () => clearInterval(t)
  }, [online, refresh])

  return { status: online ? status : null, refresh }
}
