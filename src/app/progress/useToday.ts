import { useEffect, useState } from 'react'
import { toLocalDate } from '../../domain/shared/dates'
import type { LocalDate } from '../../types'

/** Date locale du jour ; se met à jour au retour au premier plan et à minuit (app restée ouverte). */
export function useToday(): LocalDate {
  const [today, setToday] = useState(() => toLocalDate(new Date()))
  useEffect(() => {
    const update = () => setToday(toLocalDate(new Date()))
    const onVisible = () => {
      if (document.visibilityState === 'visible') update()
    }
    // Minuteur jusqu'au prochain minuit local (+1 s) ; il se réarme quand la date change.
    const now = new Date()
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
    const timer = setTimeout(update, midnight.getTime() - now.getTime())
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', update)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', update)
    }
  }, [today])
  return today
}
