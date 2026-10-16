import { Suspense, lazy } from 'react'
import { ErrorBoundary } from '../../ui'
import { ActiveSessionCard, SessionLinks } from '../training/ActiveSessionCard'
import { SessionLauncher } from '../training/SessionLauncher'
import { EntryCard } from '../training/parts'

// Chargés à la demande : le volume lit le moteur et le contenu embarqué (exercices, SVG), absents du démarrage.
const LibraryEntry = lazy(() => import('../training/LibraryEntry'))
const WeeklyVolume = lazy(() => import('../training/WeeklyVolume'))

export function SessionScreen() {
  return (
    <section>
      <h1 className="text-3xl font-bold">Entraînement</h1>
      <ActiveSessionCard />
      <SessionLauncher />
      <SessionLinks />
      <ErrorBoundary>
        <Suspense fallback={<div className="mt-8 h-64" aria-busy="true" />}>
          <WeeklyVolume />
        </Suspense>
      </ErrorBoundary>
      <div className="mt-8">
        <Suspense fallback={<EntryCard count={null} />}>
          <LibraryEntry />
        </Suspense>
      </div>
    </section>
  )
}
