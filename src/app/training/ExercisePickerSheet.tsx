import { CircleHelp, Dumbbell, SearchX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { normalizeSearch } from '../../domain/training'
import type { LibraryExercise } from '../../types'
import { patternLabel } from '../../ui'
import { Button, EmptyState, Sheet } from '../../ui/kit'
import { TextField } from '../../ui/kit/Fields'
import { TechniqueSheet } from './TechniqueSheet'
import { LevelBadge } from './parts'

interface Props {
  title: string
  candidates: readonly LibraryExercise[]
  onPick: (exercise: LibraryExercise) => void
  onClose: () => void
  /** Champ de recherche (liste longue : ajout d'un exercice). */
  searchable?: boolean
  emptyText?: string
}

/**
 * Choix d'un exercice (remplacer / ajouter). « Comment faire ? » ouvre la technique par-dessus la feuille
 * (les feuilles sont empilables) : on regarde le geste avant de choisir.
 */
export function ExercisePickerSheet({
  title,
  candidates,
  onPick,
  onClose,
  searchable = false,
  emptyText = 'Aucun exercice disponible avec ton matériel.',
}: Props) {
  const [query, setQuery] = useState('')
  const [help, setHelp] = useState<LibraryExercise | null>(null)
  const shown = useMemo(() => {
    const words = normalizeSearch(query).split(' ').filter(Boolean)
    if (words.length === 0) return candidates
    return candidates.filter((c) => {
      const name = normalizeSearch(c.name)
      return words.every((w) => name.includes(w))
    })
  }, [candidates, query])

  return (
    <>
      <Sheet title={title} onClose={onClose}>
        {searchable ? (
          <TextField
            label="Chercher"
            value={query}
            onChange={setQuery}
            type="search"
            autoComplete="off"
            enterKeyHint="search"
          />
        ) : null}
        {shown.length === 0 ? (
          <EmptyState
            compact
            icon={candidates.length === 0 ? Dumbbell : SearchX}
            title={candidates.length === 0 ? 'Aucun exercice disponible' : 'Aucun résultat'}
          >
            {candidates.length === 0 ? emptyText : 'Essaie un autre mot.'}
          </EmptyState>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {shown.map((c) => (
              <li key={c.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => onPick(c)}
                  className="focus-ring flex min-h-14 min-w-0 flex-1 flex-col justify-center rounded-md bg-canvas px-3.5 py-2 text-left active:opacity-70"
                >
                  <span className="text-headline">{c.name}</span>
                  <span className="flex items-center gap-2 text-caption text-ink-muted">
                    {patternLabel(c.pattern)} <LevelBadge level={c.level} />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setHelp(c)}
                  aria-label={`Comment faire ? ${c.name}`}
                  className="focus-ring grid min-h-14 w-14 shrink-0 place-items-center rounded-md bg-canvas text-ember-ink active:opacity-70"
                >
                  <CircleHelp size={22} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button variant="secondary" fullWidth onClick={onClose}>
          Annuler
        </Button>
      </Sheet>
      {help ? <TechniqueSheet exercise={help} onClose={() => setHelp(null)} /> : null}
    </>
  )
}
