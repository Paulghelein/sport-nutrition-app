import { useEffect, useState } from 'react'

/** Horloge qui se met à jour toutes les `intervalMs` quand `active`, et tout de suite au retour au premier plan. */
export function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const tick = () => setNow(Date.now())
    const timer = setInterval(tick, intervalMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', tick)
    }
  }, [active, intervalMs])
  return now
}
