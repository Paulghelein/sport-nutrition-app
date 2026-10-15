import { Suspense, lazy } from 'react'
import { ErrorBoundary } from '../../ui'
import { EquipmentSection } from '../settings/EquipmentSection'
import { ProfileSection } from '../settings/ProfileSection'

// Chargée à la demande : seul le composant sort du bundle de démarrage. Le code de sauvegarde (backup.ts, Zod)
// reste dans le bundle principal, car il est importé via src/db/index.ts.
const BackupSection = lazy(() => import('../settings/BackupSection').then((m) => ({ default: m.BackupSection })))

export function SettingsScreen() {
  return (
    <>
      <h1 className="text-3xl font-bold">Réglages</h1>
      <ProfileSection />
      <EquipmentSection />
      <ErrorBoundary>
        <Suspense fallback={<div className="mt-8 h-40" aria-busy="true" />}>
          <BackupSection />
        </Suspense>
      </ErrorBoundary>
    </>
  )
}
