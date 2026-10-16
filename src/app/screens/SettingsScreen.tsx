import { Suspense, lazy, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ErrorBoundary, Section, linkButtonClass } from '../../ui'
import { EquipmentSection } from '../settings/EquipmentSection'
import { ProfileSection } from '../settings/ProfileSection'

// Chargée à la demande : seul le composant sort du bundle de démarrage. Le code de sauvegarde (backup.ts, Zod)
// reste dans le bundle principal, car il est importé via src/db/index.ts.
const BackupSection = lazy(() =>
  import('../settings/BackupSection').then((m) => ({ default: m.BackupSection })),
)

const EngineSection = lazy(() => import('../settings/EngineSection'))
const NutritionGoalsSection = lazy(() => import('../settings/NutritionGoalsSection'))

/**
 * Ancre `#sauvegarde` : <main> défile et App le remet en haut à chaque changement de route, et les sections
 * au-dessus se chargent à la demande (la hauteur change) : on défile après le rendu, puis on réajuste.
 */
function useScrollToHash(): void {
  const { hash } = useLocation()
  useEffect(() => {
    if (hash === '') return
    const id = decodeURIComponent(hash.slice(1))
    const go = () => document.getElementById(id)?.scrollIntoView({ block: 'start' })
    const timers = [0, 150, 500].map((ms) => setTimeout(go, ms))
    // Dès que l'utilisateur touche l'écran, on arrête de le ramener à l'ancre.
    const stop = () => timers.forEach(clearTimeout)
    window.addEventListener('touchstart', stop, { once: true, passive: true })
    window.addEventListener('wheel', stop, { once: true, passive: true })
    return () => {
      stop()
      window.removeEventListener('touchstart', stop)
      window.removeEventListener('wheel', stop)
    }
  }, [hash])
}

export function SettingsScreen() {
  useScrollToHash()
  return (
    <>
      <h1 className="text-3xl font-bold">Réglages</h1>
      <ProfileSection />
      <EquipmentSection />
      <ErrorBoundary>
        <Suspense fallback={<div className="mt-8 h-40" aria-busy="true" />}>
          <NutritionGoalsSection />
        </Suspense>
      </ErrorBoundary>
      <ErrorBoundary>
        <Suspense fallback={<div className="mt-8 h-40" aria-busy="true" />}>
          <EngineSection />
        </Suspense>
      </ErrorBoundary>
      <div id="sauvegarde" className="scroll-mt-4">
        <ErrorBoundary>
          <Suspense fallback={<div className="mt-8 h-40" aria-busy="true" />}>
            <BackupSection />
          </Suspense>
        </ErrorBoundary>
      </div>
      <Section title="Importer">
        <p className="mb-3 text-zinc-400">
          Recettes et repas au format JSON, par exemple une réponse de Claude : aperçu avant d’enregistrer.
        </p>
        <Link to="/reglages/importer" className={linkButtonClass('secondary')}>
          Importer des recettes ou des repas
        </Link>
      </Section>
    </>
  )
}
