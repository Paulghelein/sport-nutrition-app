import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Ancre (`#sauvegarde`, `#mensurations`) : <main> défile et App le remet en haut à chaque changement de route, et les sections
 * au-dessus se chargent à la demande (la hauteur change) : on défile après le rendu, puis on réajuste.
 * `ready` : l'ancre n'existe qu'une fois les données chargées ; on attend avant de lancer les essais.
 */
export function useScrollToHash(ready = true): void {
  const { hash, key } = useLocation()
  useEffect(() => {
    if (hash === '' || !ready) return
    const id = decodeURIComponent(hash.slice(1))
    const go = () => document.getElementById(id)?.scrollIntoView({ block: 'start' })
    const timers = [0, 150, 500, 1000, 2000].map((ms) => setTimeout(go, ms))
    // Dès que l'utilisateur touche l'écran, on arrête de le ramener à l'ancre.
    const stop = () => timers.forEach(clearTimeout)
    window.addEventListener('touchstart', stop, { once: true, passive: true })
    window.addEventListener('wheel', stop, { once: true, passive: true })
    return () => {
      stop()
      window.removeEventListener('touchstart', stop)
      window.removeEventListener('wheel', stop)
    }
    // `key` change à chaque navigation : un nouveau toucher depuis + défile même si le hash est identique.
  }, [hash, key, ready])
}
