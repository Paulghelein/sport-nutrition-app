import { useEffect } from 'react'

/**
 * Garde l'écran allumé tant que le composant est monté (Wake Lock API). Redemandé au retour au premier plan
 * (le verrou est perdu quand l'app passe en arrière-plan), relâché au démontage. Navigateur sans support : sans effet.
 */
export function useWakeLock(): void {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let stopped = false
    const request = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (stopped) void lock.release().catch(() => undefined)
        else sentinel = lock
      } catch {
        // Refusé (économie d'énergie, onglet masqué) : l'écran s'éteindra normalement.
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && (sentinel === null || sentinel.released)) void request()
    }
    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release().catch(() => undefined)
    }
  }, [])
}
