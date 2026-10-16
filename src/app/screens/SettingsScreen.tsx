import { Suspense, lazy } from 'react'
import { Link } from 'react-router-dom'
import { DEV_UI_PATH } from '../routes'
import { ErrorBoundary, Section, linkButtonClass } from '../../ui'
import { useScrollToHash } from '../useScrollToHash'
import { EquipmentSection } from '../settings/EquipmentSection'
import { ProfileSection } from '../settings/ProfileSection'

// Chargée à la demande : seul le composant sort du bundle de démarrage. Le code de sauvegarde (backup.ts, Zod)
// reste dans le bundle principal, car il est importé via src/db/index.ts.
const BackupSection = lazy(() =>
  import('../settings/BackupSection').then((m) => ({ default: m.BackupSection })),
)

const EngineSection = lazy(() => import('../settings/EngineSection'))
const NutritionGoalsSection = lazy(() => import('../settings/NutritionGoalsSection'))
// Instructions du Projet Coach (texte long) : chunk à la demande.
const ClaudeSection = lazy(() => import('../settings/ClaudeSection'))

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
      <ErrorBoundary>
        <Suspense fallback={<div className="mt-8 h-40" aria-busy="true" />}>
          <ClaudeSection />
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
      <p className="mt-8 flex justify-center text-sm">
        <Link
          to={DEV_UI_PATH}
          className="inline-flex min-h-11 items-center px-3 text-zinc-500 underline underline-offset-4"
        >
          Composants de l’interface (dev)
        </Link>
      </p>
    </>
  )
}
