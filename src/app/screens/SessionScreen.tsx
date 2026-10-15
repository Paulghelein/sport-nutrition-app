import { Suspense, lazy } from 'react'
import { Card } from '../../ui'
import { EntryCard } from '../training/parts'

// Chargé à la demande : le compte d'exercices lit le contenu embarqué (exercices, SVG), absent du démarrage.
const LibraryEntry = lazy(() => import('../training/LibraryEntry'))

export function SessionScreen() {
  return (
    <section>
      <h1 className="text-3xl font-bold">Séance</h1>
      <Card className="mt-5">
        <p className="text-lg font-semibold">Génération de séance</p>
        <p className="mt-1 text-base text-zinc-400">Bientôt disponible</p>
      </Card>
      <div className="mt-4">
        <Suspense fallback={<EntryCard count={null} />}>
          <LibraryEntry />
        </Suspense>
      </div>
    </section>
  )
}
