import { ChevronRight } from 'lucide-react'
import { Suspense, lazy } from 'react'
import { Link } from 'react-router-dom'
import { ErrorBoundary } from '../../ui/ErrorBoundary'
import { Card } from '../../ui/kit'
import { DEV_UI_ENABLED } from '../devUi'
import { DEV_UI_PATH, IMPORT_PATH } from '../routes'
import { useScrollToHash } from '../useScrollToHash'
import { EquipmentSection } from '../settings/EquipmentSection'
import { ProfileSection } from '../settings/ProfileSection'
import { SectionFallback, SettingsSection } from '../settings/SettingsSection'

// Chargée à la demande : seul le composant sort du bundle de démarrage. Le code de sauvegarde (backup.ts, Zod)
// reste dans le bundle principal, car il est importé via src/db/index.ts.
const BackupSection = lazy(() =>
  import('../settings/BackupSection').then((m) => ({ default: m.BackupSection })),
)

const EngineSection = lazy(() => import('../settings/EngineSection'))
const NutritionGoalsSection = lazy(() => import('../settings/NutritionGoalsSection'))
// Instructions du Projet Coach (texte long) : chunk à la demande.
const ClaudeSection = lazy(() => import('../settings/ClaudeSection'))

/** Ligne-lien pleine largeur d'une carte (chevron à droite), sur le modèle de `ListRow`. */
function LinkRow({ to, title, subtitle }: { to: string; title: string; subtitle?: string }) {
  return (
    <Link
      to={to}
      className="focus-ring flex min-h-12 items-center gap-3 rounded-sm py-1.5 text-ink no-underline active:opacity-70"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-headline">{title}</span>
        {subtitle ? <span className="text-caption text-ink-muted">{subtitle}</span> : null}
      </span>
      <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-ink-muted" />
    </Link>
  )
}

export function SettingsScreen() {
  useScrollToHash()
  return (
    <div className="flex flex-col gap-6">
      <h1 className="m-0 font-display text-display-l">Réglages</h1>
      <ProfileSection />
      <EquipmentSection />
      <ErrorBoundary>
        <Suspense fallback={<SectionFallback />}>
          <NutritionGoalsSection />
        </Suspense>
      </ErrorBoundary>
      <ErrorBoundary>
        <Suspense fallback={<SectionFallback />}>
          <EngineSection />
        </Suspense>
      </ErrorBoundary>
      <ErrorBoundary>
        <Suspense fallback={<SectionFallback />}>
          <ClaudeSection />
        </Suspense>
      </ErrorBoundary>
      <div id="sauvegarde" className="scroll-mt-4">
        <ErrorBoundary>
          <Suspense fallback={<SectionFallback />}>
            <BackupSection />
          </Suspense>
        </ErrorBoundary>
      </div>
      <SettingsSection
        title="Importer"
        intro="Recettes et repas au format JSON, par exemple une réponse de Claude : aperçu avant d’enregistrer."
      >
        <Card padding="none" className="px-4 py-1.5">
          <LinkRow to={IMPORT_PATH} title="Importer des recettes ou des repas" />
        </Card>
      </SettingsSection>
      {DEV_UI_ENABLED ? (
        <p className="m-0 flex justify-center">
          <Link
            to={DEV_UI_PATH}
            className="focus-ring inline-flex min-h-11 items-center px-3 text-caption text-ink-muted underline underline-offset-4"
          >
            Composants de l’interface (dev)
          </Link>
        </p>
      ) : null}
    </div>
  )
}
