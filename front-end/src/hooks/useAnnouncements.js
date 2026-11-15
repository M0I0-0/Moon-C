import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { SEED_ANNOUNCEMENTS } from '../data/announcements'

const POLL_MS = 30000

/**
 * Anuncios de la cuenta General. Con backend se guardan allá y los ven todas las pantallas;
 * sin enlace se usan los de ejemplo y lo que se publique queda solo en esta pantalla.
 */
export function useAnnouncements(online) {
  const [remote, setRemote] = useState(null)
  const [local, setLocal] = useState(SEED_ANNOUNCEMENTS)

  const refresh = useCallback(async () => {
    try {
      setRemote(await api.announcements())
    } catch {
      setRemote(null)
    }
  }, [])

  useEffect(() => {
    if (!online) return undefined
    refresh()
    const t = setInterval(refresh, POLL_MS)
    return () => clearInterval(t)
  }, [online, refresh])

  const useRemote = online && remote !== null

  const post = useCallback(
    async ({ text, priority, author = 'General' }) => {
      if (useRemote) {
        try {
          await api.postAnnouncement({ text, priority, author })
          await refresh()
          return
        } catch {
          /* sin enlace: se publica solo aquí */
        }
      }
      const id = `local-${Date.now()}`
      setLocal((list) => [{ id, author, priority, text, at: new Date().toISOString() }, ...list])
    },
    [useRemote, refresh],
  )

  return { items: useRemote ? remote : local, post }
}
