import { useState } from 'react'
import { seedExercises } from '../../content'
import { restoreExercise } from '../../db'
import { deletedSeedExercises } from '../../domain/training'
import { Button, Card, ErrorNote, errorMessage, muscleLabel, patternLabel } from '../../ui'
import { BackLink, LIBRARY_PATH, LevelBadge } from './parts'
import { useLibrary } from './useLibrary'

export default function DeletedScreen() {
  const { data, error } = useLibrary()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const deleted = data ? deletedSeedExercises(seedExercises, data.rows) : []

  const restore = async (id: string) => {
    setBusyId(id)
    setActionError(null)
    try {
      await restoreExercise(id)
    } catch (e) {
      setActionError(errorMessage(e, 'Impossible de restaurer. Réessaie.'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section>
      <BackLink to={LIBRARY_PATH}>Bibliothèque</BackLink>
      <h1 className="mt-1 text-3xl font-bold">Exercices supprimés</h1>
      <p className="mt-2 text-base text-zinc-400">
        Seuls les exercices fournis avec l’app peuvent être restaurés. Un exercice que tu as créé ne peut pas
        être restauré.
      </p>
      {error || actionError ? (
        <div className="mt-4">
          <ErrorNote>{actionError ?? 'Impossible de lire la bibliothèque.'}</ErrorNote>
        </div>
      ) : null}
      {!data ? null : deleted.length === 0 ? (
        <Card className="mt-5 text-center">
          <p className="text-lg font-semibold">Aucun exercice supprimé</p>
        </Card>
      ) : (
        <ul className="m-0 mt-5 flex list-none flex-col gap-2 p-0">
          {deleted.map((ex) => (
            <li
              key={ex.id}
              className="flex items-center gap-3 rounded-2xl border border-v1-line bg-v1-surface p-3 pl-4"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-lg font-semibold leading-snug">{ex.name}</span>
                <span className="text-sm text-zinc-400">
                  {patternLabel(ex.pattern)} · {ex.muscles.primary.map(muscleLabel).join(', ')}
                </span>
                <span>
                  <LevelBadge level={ex.level} />
                </span>
              </span>
              <Button
                variant="secondary"
                width="auto"
                className="shrink-0"
                disabled={busyId !== null}
                aria-label={`Restaurer ${ex.name}`}
                onClick={() => void restore(ex.id)}
              >
                Restaurer
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
