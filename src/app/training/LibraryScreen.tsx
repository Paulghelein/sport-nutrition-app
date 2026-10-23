import { ChevronRight, Plus, Search, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { seedExercises } from '../../content'
import {
  PATTERN_ORDER,
  deletedSeedExercises,
  filterLibrary,
  groupByPattern,
  isAvailable,
} from '../../domain/training'
import type { LibraryFilter } from '../../domain/training'
import type { LibraryExercise, MovementPattern, TrainingLevel } from '../../types'
import { muscleLabel, patternLabel } from '../../ui'
import { Card, ExerciseThumb, cx } from '../../ui/kit'
import { ChoiceGroup } from '../../ui/kit/ChoiceGroup'
import type { ChoiceOption } from '../../ui/kit/ChoiceGroup'
import { Note } from '../../ui/kit/Note'
import { DELETED_EXERCISES_PATH, LIBRARY_PATH, NEW_EXERCISE_PATH, TRAINING_PATH } from '../routes'
import { LevelBadge, PreferenceIcon, ScreenTitle, Tag } from './parts'
import { BackLink } from '../../ui/kit/BackLink'
import { useLibrary } from './useLibrary'

type LevelFilter = 'all' | TrainingLevel

const levelFilterChoices: ChoiceOption<LevelFilter>[] = [
  { value: 'all', label: 'Tous' },
  { value: 1, label: 'Débutant' },
  { value: 2, label: 'Intermédiaire' },
  { value: 3, label: 'Avancé' },
]

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="focus-ring flex min-h-12 w-full items-center justify-between gap-3 rounded-md bg-canvas px-3.5 py-2 text-left"
    >
      <span className="text-body-strong">{label}</span>
      <span
        aria-hidden="true"
        className={cx(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors motion-reduce:transition-none',
          checked ? 'bg-ember' : 'bg-surface-sunken',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 size-6 rounded-full bg-surface-raised shadow-card transition-all motion-reduce:transition-none',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </span>
    </button>
  )
}

function ExerciseListRow({ ex, missing }: { ex: LibraryExercise; missing: boolean }) {
  return (
    <li className="border-t border-line first:border-t-0">
      <Link
        to={`${LIBRARY_PATH}/${ex.id}`}
        className="focus-ring flex min-h-14 items-center gap-3 py-2.5 no-underline"
      >
        <span aria-hidden="true">
          <ExerciseThumb primary={ex.muscles.primary} size={48} background="canvas" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-headline text-ink">{ex.name}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <LevelBadge level={ex.level} />
            <span className="text-caption text-ink-muted">
              {ex.muscles.primary.map(muscleLabel).join(', ')}
            </span>
            {ex.preference === 'hidden' ? <Tag>Masqué</Tag> : null}
            {missing ? <Tag tone="warning">Matériel manquant</Tag> : null}
            {ex.source === 'user' ? <Tag>Perso</Tag> : null}
          </span>
        </span>
        <PreferenceIcon preference={ex.preference} />
        <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-ink-faint" />
      </Link>
    </li>
  )
}

export default function LibraryScreen() {
  const { data, error } = useLibrary()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(() => params.get('q') ?? '')

  const patternParam = params.get('p')
  const pattern = PATTERN_ORDER.find((p) => p === patternParam)
  const levelParam = Number(params.get('l'))
  const level: TrainingLevel | undefined =
    levelParam === 1 || levelParam === 2 || levelParam === 3 ? levelParam : undefined
  const availableOnly = params.get('mat') !== '0'
  const includeHidden = params.get('h') === '1'

  // Les filtres vivent dans l'URL : on les retrouve en revenant d'une fiche.
  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )
  const reset = () => {
    setQuery('')
    setParams({}, { replace: true })
  }

  const filtered =
    data &&
    filterLibrary(
      data.library,
      { query, pattern, level, availableOnly, includeHidden } satisfies LibraryFilter,
      data.equipment,
    )
  const deletedCount = data ? deletedSeedExercises(seedExercises, data.rows).length : 0
  const groups = filtered ? groupByPattern(filtered) : []
  const panelOpen = params.get('f') === '1'
  const activeCount = (level !== undefined ? 1 : 0) + (availableOnly ? 0 : 1) + (includeHidden ? 1 : 0)
  const filtersActive =
    query.trim() !== '' || pattern !== undefined || level !== undefined || !availableOnly || includeHidden

  return (
    <section className="flex flex-col gap-3.5">
      <BackLink to={TRAINING_PATH}>Entraînement</BackLink>
      <div className="flex items-center justify-between gap-3">
        <ScreenTitle>Exercices</ScreenTitle>
        <Link
          to={NEW_EXERCISE_PATH}
          aria-label="Créer un exercice"
          className="focus-ring grid size-12 shrink-0 place-items-center rounded-full bg-ember text-ink no-underline active:opacity-80"
        >
          <Plus size={24} strokeWidth={2} aria-hidden="true" />
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="library-search" className="sr-only">
            Rechercher un exercice
          </label>
          <Search
            size={20}
            strokeWidth={1.75}
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <input
            id="library-search"
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Rechercher un exercice"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setParam('q', e.target.value)
            }}
            className="focus-ring min-h-12 w-full rounded-full bg-surface pl-11 pr-11 text-input text-ink shadow-card placeholder:text-ink-muted"
          />
          {query !== '' ? (
            <button
              type="button"
              aria-label="Effacer la recherche"
              onClick={() => {
                setQuery('')
                setParam('q', null)
              }}
              className="focus-ring absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full text-ink-muted"
            >
              <X size={18} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          aria-expanded={panelOpen}
          aria-controls="library-filters"
          onClick={() => setParam('f', panelOpen ? null : '1')}
          className={cx(
            'focus-ring flex min-h-12 shrink-0 items-center gap-1.5 rounded-full px-4 text-body-strong shadow-card',
            activeCount > 0 || panelOpen ? 'bg-ember-soft text-ink' : 'bg-surface text-ink',
          )}
        >
          Filtres
          {activeCount > 0 ? (
            <span
              aria-label={`${activeCount} filtre${activeCount > 1 ? 's' : ''} actif${activeCount > 1 ? 's' : ''}`}
              className="grid size-6 place-items-center rounded-full bg-ember text-caption font-bold text-ink"
            >
              {activeCount}
            </span>
          ) : null}
        </button>
      </div>

      <div role="group" aria-label="Filtrer par schéma de mouvement">
        <div className="ds-bleed flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {([undefined, ...PATTERN_ORDER] as (MovementPattern | undefined)[]).map((p) => {
            const active = p === pattern
            return (
              <button
                key={p ?? 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => setParam('p', p ?? null)}
                className={cx(
                  'focus-ring min-h-11 shrink-0 rounded-full px-4 text-body-strong',
                  active ? 'bg-inverse text-on-inverse' : 'bg-surface text-ink',
                )}
              >
                {p ? patternLabel(p) : 'Tous'}
              </button>
            )
          })}
        </div>
      </div>

      {panelOpen ? (
        <Card id="library-filters" className="flex flex-col gap-3">
          <ChoiceGroup<LevelFilter>
            legend="Niveau"
            layout="grid"
            value={level ?? 'all'}
            options={levelFilterChoices}
            onChange={(v) => setParam('l', v === 'all' ? null : String(v))}
          />
          <Switch
            label="Avec mon matériel"
            checked={availableOnly}
            onChange={(on) => setParam('mat', on ? null : '0')}
          />
          <Switch
            label="Afficher les masqués"
            checked={includeHidden}
            onChange={(on) => setParam('h', on ? '1' : null)}
          />
        </Card>
      ) : null}

      {error ? (
        <Note tone="error">Impossible de lire la bibliothèque. Ferme l’app puis rouvre-la.</Note>
      ) : null}

      {!data ? (
        <p className="m-0 text-body text-ink-muted" aria-busy="true">
          Chargement…
        </p>
      ) : (
        <>
          <p aria-live="polite" className="m-0 text-caption text-ink-muted">
            {filtered?.length ?? 0} exercice{(filtered?.length ?? 0) > 1 ? 's' : ''}
          </p>
          {groups.length === 0 ? (
            <Card className="flex flex-col items-center gap-2 text-center">
              <p className="m-0 font-display text-title">Aucun exercice trouvé</p>
              <p className="m-0 text-body text-ink-muted">
                {availableOnly
                  ? 'Essaie un autre mot, ou coupe « Avec mon matériel » pour voir tous les exercices.'
                  : 'Essaie un autre mot ou retire un filtre.'}
              </p>
              {filtersActive ? (
                <button
                  type="button"
                  onClick={reset}
                  className="focus-ring min-h-11 rounded-full px-4 text-body-strong text-ember-ink active:opacity-70"
                >
                  Réinitialiser les filtres
                </button>
              ) : null}
            </Card>
          ) : (
            groups.map((g) => (
              <section
                key={g.pattern}
                className="flex flex-col gap-1.5"
                aria-labelledby={`group-${g.pattern}`}
              >
                <h2 id={`group-${g.pattern}`} className="m-0 mt-2 font-display text-title">
                  {patternLabel(g.pattern)}{' '}
                  <span className="text-body font-medium text-ink-muted">({g.exercises.length})</span>
                </h2>
                <Card as="div" padding="none" className="px-4">
                  <ul className="m-0 flex list-none flex-col p-0">
                    {g.exercises.map((ex) => (
                      <ExerciseListRow key={ex.id} ex={ex} missing={!isAvailable(ex, data.equipment)} />
                    ))}
                  </ul>
                </Card>
              </section>
            ))
          )}
          <Link
            to={DELETED_EXERCISES_PATH}
            className="focus-ring mt-4 flex min-h-12 items-center justify-center rounded-full text-body-strong text-ink-muted underline"
          >
            Exercices supprimés ({deletedCount})
          </Link>
        </>
      )}
    </section>
  )
}
