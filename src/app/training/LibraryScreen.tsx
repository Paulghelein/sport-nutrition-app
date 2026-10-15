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
import { Card, ChoiceGroup, ErrorNote, muscleLabel, patternLabel } from '../../ui'
import type { Choice } from '../../ui'
import { BackLink, LevelBadge, PreferenceIcon } from './parts'
import { useLibrary } from './useLibrary'

type LevelFilter = 'all' | TrainingLevel

const levelFilterChoices: Choice<LevelFilter>[] = [
  { value: 'all', label: 'Tous' },
  { value: 1, label: 'Débutant' },
  { value: 2, label: 'Intermédiaire' },
  { value: 3, label: 'Avancé' },
]

function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface-hi px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400"
    >
      <span className="flex flex-col">
        <span className="text-base font-medium">{label}</span>
        {hint ? <span className="text-sm text-zinc-400">{hint}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-orange-400' : 'bg-zinc-600'}`}
      >
        <span
          className={`absolute top-0.5 size-6 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`}
        />
      </span>
    </button>
  )
}

function ExerciseRow({ ex, missing }: { ex: LibraryExercise; missing: boolean }) {
  return (
    <li>
      <Link
        to={`/seance/exercices/${ex.id}`}
        className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5 no-underline active:bg-surface-hi focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-lg font-semibold leading-snug text-zinc-100">{ex.name}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <LevelBadge level={ex.level} />
            <span className="text-sm text-zinc-400">{ex.muscles.primary.map(muscleLabel).join(', ')}</span>
            {ex.preference === 'hidden' ? (
              <span className="rounded-full border border-line px-2 py-0.5 text-xs font-medium text-zinc-300">
                Masqué
              </span>
            ) : null}
            {missing ? (
              <span className="rounded-full border border-amber-400/40 px-2 py-0.5 text-xs font-medium text-amber-300">
                Matériel manquant
              </span>
            ) : null}
            {ex.source === 'user' ? (
              <span className="rounded-full border border-line px-2 py-0.5 text-xs font-medium text-zinc-300">
                Perso
              </span>
            ) : null}
          </span>
        </span>
        <PreferenceIcon preference={ex.preference} />
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-zinc-500"
          aria-hidden="true"
        >
          <path d="M9 5l7 7-7 7" />
        </svg>
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
    <section>
      <BackLink to="/seance">Séance</BackLink>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Exercices</h1>
        <Link
          to="/seance/exercices/nouveau"
          aria-label="Créer un exercice"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-orange-400 text-zinc-950 no-underline active:bg-orange-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </Link>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="library-search" className="sr-only">
            Rechercher un exercice
          </label>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
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
            className="min-h-12 w-full rounded-xl border border-line bg-surface-hi pl-10 pr-11 text-base text-zinc-100 [color-scheme:dark] placeholder:text-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400"
          />
          {query !== '' ? (
            <button
              type="button"
              aria-label="Effacer la recherche"
              onClick={() => {
                setQuery('')
                setParam('q', null)
              }}
              className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center text-zinc-400"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          ) : null}
        </div>
        <button
          type="button"
          aria-expanded={panelOpen}
          aria-controls="library-filters"
          onClick={() => setParam('f', panelOpen ? null : '1')}
          className={`flex min-h-12 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400 ${
            activeCount > 0 || panelOpen
              ? 'border-orange-400 bg-orange-400/15 text-orange-300'
              : 'border-line bg-surface-hi text-zinc-200'
          }`}
        >
          Filtres
          {activeCount > 0 ? (
            <span
              aria-label={`${activeCount} filtre${activeCount > 1 ? 's' : ''} actif${activeCount > 1 ? 's' : ''}`}
              className="flex size-6 items-center justify-center rounded-full bg-orange-400 text-sm font-bold text-zinc-950"
            >
              {activeCount}
            </span>
          ) : null}
        </button>
      </div>

      <div role="group" aria-label="Filtrer par schéma de mouvement" className="mt-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {([undefined, ...PATTERN_ORDER] as (MovementPattern | undefined)[]).map((p) => {
            const active = p === pattern
            return (
              <button
                key={p ?? 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => setParam('p', p ?? null)}
                className={`h-11 shrink-0 rounded-full border px-4 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400 ${
                  active
                    ? 'border-orange-400 bg-orange-400/15 text-orange-300'
                    : 'border-line bg-surface-hi text-zinc-200'
                }`}
              >
                {p ? patternLabel(p) : 'Tous'}
              </button>
            )
          })}
        </div>
      </div>

      {panelOpen ? (
        <div
          id="library-filters"
          className="mt-3 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3"
        >
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
        </div>
      ) : null}

      {error ? (
        <div className="mt-5">
          <ErrorNote>Impossible de lire la bibliothèque. Ferme l’app puis rouvre-la.</ErrorNote>
        </div>
      ) : null}

      {!data ? (
        <p className="mt-6 text-base text-zinc-400" aria-busy="true">
          Chargement…
        </p>
      ) : (
        <>
          <p aria-live="polite" className="mt-3 text-sm text-zinc-400">
            {filtered?.length ?? 0} exercice{(filtered?.length ?? 0) > 1 ? 's' : ''}
          </p>
          {groups.length === 0 ? (
            <Card className="mt-3 text-center">
              <p className="text-lg font-semibold">Aucun exercice trouvé</p>
              <p className="mt-1 text-base text-zinc-400">
                {availableOnly
                  ? 'Essaie un autre mot, ou coupe « Avec mon matériel » pour voir tous les exercices.'
                  : 'Essaie un autre mot ou retire un filtre.'}
              </p>
              {filtersActive ? (
                <button
                  type="button"
                  onClick={reset}
                  className="mt-3 min-h-11 rounded-xl px-4 text-base font-semibold text-orange-400 active:bg-white/5"
                >
                  Réinitialiser les filtres
                </button>
              ) : null}
            </Card>
          ) : (
            groups.map((g) => (
              <section key={g.pattern} className="mt-3" aria-labelledby={`group-${g.pattern}`}>
                <h2 id={`group-${g.pattern}`} className="mb-1.5 text-lg font-bold">
                  {patternLabel(g.pattern)}{' '}
                  <span className="text-base font-medium text-zinc-400">({g.exercises.length})</span>
                </h2>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {g.exercises.map((ex) => (
                    <ExerciseRow key={ex.id} ex={ex} missing={!isAvailable(ex, data.equipment)} />
                  ))}
                </ul>
              </section>
            ))
          )}
          <Link
            to="/seance/exercices/supprimes"
            className="mt-8 flex min-h-12 items-center justify-center rounded-xl text-base font-medium text-zinc-300 underline"
          >
            Exercices supprimés ({deletedCount})
          </Link>
        </>
      )}
    </section>
  )
}
