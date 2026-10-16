import { Suspense, lazy } from 'react'
import { Link } from 'react-router-dom'
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

export function SettingsScreen() {
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
      <ErrorBoundary>
        <Suspense fallback={<div className="mt-8 h-40" aria-busy="true" />}>
          <BackupSection />
        </Suspense>
      </ErrorBoundary>
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
