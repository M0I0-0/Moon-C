import { useCallback, useEffect, useState } from 'react'
import { checkBackend } from '../lib/assistant'

export function useBackendStatus() {
  const [status, setStatus] = useState({ online: false, checked: false, info: null })

  const refresh = useCallback(async () => {
    const info = await checkBackend()
    setStatus({ online: Boolean(info), checked: true, info })
  }, [])

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 20000)
    return () => clearInterval(t)
  }, [refresh])

  const markOffline = useCallback(() => setStatus((s) => ({ ...s, online: false })), [])

  return { ...status, refresh, markOffline }
}
