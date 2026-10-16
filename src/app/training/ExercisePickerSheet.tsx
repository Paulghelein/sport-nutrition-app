import { useMemo, useState } from 'react'
import { normalizeSearch } from '../../domain/training'
import type { LibraryExercise } from '../../types'
import { Button, Sheet, TextField, patternLabel } from '../../ui'
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
          <div className="mb-3">
            <TextField
              label="Chercher"
              value={query}
              onChange={setQuery}
              type="search"
              autoComplete="off"
              enterKeyHint="search"
            />
          </div>
        ) : null}
        {shown.length === 0 ? (
          <p className="m-0 pb-2 text-base text-zinc-300">
            {candidates.length === 0 ? emptyText : 'Aucun résultat.'}
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0 pb-2">
            {shown.map((c) => (
              <li key={c.id} className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => onPick(c)}
                  className="flex min-h-14 min-w-0 flex-1 flex-col justify-center rounded-xl border border-v1-line bg-v1-surface-hi px-3 py-2 text-left active:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400"
                >
                  <span className="text-base font-semibold">{c.name}</span>
                  <span className="flex items-center gap-2 text-sm text-zinc-400">
                    {patternLabel(c.pattern)} <LevelBadge level={c.level} />
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setHelp(c)}
                  aria-label={`Comment faire ? ${c.name}`}
                  className="flex min-h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-v1-line bg-v1-surface-hi text-xl font-bold text-orange-300 active:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400"
                >
                  ?
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="pb-1 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
        </div>
      </Sheet>
      {help ? <TechniqueSheet exercise={help} onClose={() => setHelp(null)} /> : null}
    </>
  )
}
