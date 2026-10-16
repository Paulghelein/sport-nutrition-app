import { useState } from 'react'
import { seedExercises } from '../../content'
import { restoreExercise } from '../../db'
import { deletedSeedExercises } from '../../domain/training'
import { errorMessage, muscleLabel, patternLabel } from '../../ui'
import { Button, Card } from '../../ui/kit'
import { Note } from '../../ui/kit/Note'
import { LIBRARY_PATH } from '../routes'
import { BackLink, LevelBadge, ScreenTitle } from './parts'
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
    <section className="flex flex-col gap-4">
      <BackLink to={LIBRARY_PATH}>Bibliothèque</BackLink>
      <ScreenTitle>Exercices supprimés</ScreenTitle>
      <p className="m-0 text-body text-ink-muted">
        Seuls les exercices fournis avec l’app peuvent être restaurés. Un exercice que tu as créé ne peut pas
        être restauré.
      </p>
      {error || actionError ? (
        <Note tone="error">{actionError ?? 'Impossible de lire la bibliothèque.'}</Note>
      ) : null}
      {!data ? null : deleted.length === 0 ? (
        <Card className="text-center">
          <p className="m-0 font-display text-title">Aucun exercice supprimé</p>
        </Card>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {deleted.map((ex) => (
            <li key={ex.id}>
              <Card className="flex items-center gap-3">
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-headline">{ex.name}</span>
                  <span className="text-caption text-ink-muted">
                    {patternLabel(ex.pattern)} · {ex.muscles.primary.map(muscleLabel).join(', ')}
                  </span>
                  <span>
                    <LevelBadge level={ex.level} />
                  </span>
                </span>
                <Button
                  variant="secondary"
                  className="shrink-0 bg-canvas! shadow-none!"
                  disabled={busyId !== null}
                  aria-label={`Restaurer ${ex.name}`}
                  onClick={() => void restore(ex.id)}
                >
                  Restaurer
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
