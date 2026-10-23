import { useEffect, useState } from 'react'
import { Button } from './kit'

/** Surveille l'arrivée d'un service worker en attente (nouvelle version déployée). */
function useWaitingWorker(): ServiceWorker | null {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  useEffect(() => {
    const sw = navigator.serviceWorker as ServiceWorkerContainer | undefined
    if (!sw) return
    let cancelled = false
    let registration: ServiceWorkerRegistration | undefined
    const track = (worker: ServiceWorker | null) => {
      // Un worker « installed » alors qu'une page est déjà contrôlée = mise à jour (pas la toute première installation).
      if (!cancelled && worker && sw.controller) setWaiting(worker)
    }
    const onUpdateFound = () => {
      const installing = registration?.installing
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed') track(installing)
      })
    }
    // En mode standalone iOS, le navigateur vérifie rarement les mises à jour : on le fait au retour au premier plan
    // (requête vers notre propre origine uniquement).
    const onVisible = () => {
      if (document.visibilityState === 'visible') registration?.update().catch(() => undefined)
    }
    sw.getRegistration()
      .then((reg) => {
        if (cancelled || !reg) return
        registration = reg
        track(reg.waiting)
        reg.addEventListener('updatefound', onUpdateFound)
        // Une installation commencée avant cet abonnement.
        if (reg.installing) onUpdateFound()
      })
      .catch(() => undefined)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      registration?.removeEventListener('updatefound', onUpdateFound)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return waiting
}

/**
 * Nouvelle version déployée : on propose de recharger au lieu de recharger d'office (`registerType: 'prompt'`),
 * pour ne jamais couper une séance ou une saisie en cours. Monté hors du mode guidé uniquement.
 * API service worker native (pas `virtual:pwa-register`, dont l'`import()` de workbox-window échoue
 * bruyamment si la page est rechargée pendant son chargement).
 */
export function UpdatePrompt() {
  const waiting = useWaitingWorker()
  const [dismissed, setDismissed] = useState(false)

  if (!waiting || dismissed) return null
  const reload = () => {
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
      once: true,
    })
    // Le service worker généré par Workbox (mode prompt) s'active à la réception de ce message.
    waiting.postMessage({ type: 'SKIP_WAITING' })
  }
  return (
    <div
      role="status"
      // Posée en haut, sous la zone de sécurité : ne recouvre ni la barre d'onglets ni les zones collantes du bas.
      // Le conteneur laisse passer les touchers ; seule la carte les reçoit.
      className="pointer-events-none fixed inset-x-0 top-0 z-30 font-sans"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)',
        paddingLeft: 'calc(env(safe-area-inset-left) + 1rem)',
        paddingRight: 'calc(env(safe-area-inset-right) + 1rem)',
      }}
    >
      <div className="pointer-events-auto mx-auto flex max-w-xl flex-col gap-3 rounded-lg bg-inverse p-4 text-on-inverse shadow-float">
        <p className="m-0 text-body-strong">Nouvelle version disponible.</p>
        <div className="flex gap-2">
          <Button variant="inverse" fullWidth onClick={() => setDismissed(true)}>
            Plus tard
          </Button>
          <Button fullWidth onClick={reload}>
            Recharger
          </Button>
        </div>
      </div>
    </div>
  )
}
