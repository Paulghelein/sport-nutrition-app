import { Suspense, lazy } from 'react'
import { ErrorBoundary } from '../../ui'
import { ActiveSessionCard, SessionLinks } from '../training/ActiveSessionCard'
import { ScreenTitle, EntryCard } from '../training/parts'
import { SessionLauncher } from '../training/SessionLauncher'

// Chargés à la demande : le volume lit le moteur et le contenu embarqué (exercices, SVG), absents du démarrage.
const LibraryEntry = lazy(() => import('../training/LibraryEntry'))
const WeeklyVolume = lazy(() => import('../training/WeeklyVolume'))

export function SessionScreen() {
  return (
    <section className="flex flex-col gap-4">
      <ScreenTitle>Entraînement</ScreenTitle>
      <ActiveSessionCard />
      <SessionLauncher />
      <SessionLinks />
      <ErrorBoundary>
        <Suspense fallback={<div className="mt-7 h-64" aria-busy="true" />}>
          <WeeklyVolume />
        </Suspense>
      </ErrorBoundary>
      <div className="mt-3">
        <Suspense fallback={<EntryCard count={null} />}>
          <LibraryEntry />
        </Suspense>
      </div>
    </section>
  )
}
