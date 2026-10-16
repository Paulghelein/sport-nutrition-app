import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { restoreRecipe } from '../../db'
import { deletedSeedRecipes, filterRecipes, recipeListItems, roundMacros } from '../../domain/nutrition'
import type { MealSlot, RecipeFilter, RecipeListItem } from '../../types'
import {
  Button,
  Card,
  ChoiceGroup,
  ErrorNote,
  Sheet,
  TextField,
  errorMessage,
  linkButtonClass,
} from '../../ui'
import type { Choice } from '../../ui'
import { SLOT_LABEL, fmtG, fmtInt, isMealSlot, slotChoices } from '../nutrition/format'
import { BackLink } from '../nutrition/parts'
import { fmtMinutes } from './format'
import {
  Badge,
  Chevron,
  CiqualBanner,
  Loading,
  SearchIcon,
  Star,
  Switch,
  focusRing,
  searchInputClass,
} from './parts'
import { recipesWithMissingData, useRecipeLibrary } from './useRecipes'

type TimeFilter = 'all' | 15 | 30 | 45 | 60
type ProteinFilter = 'all' | 20 | 30 | 40

const timeChoices: Choice<TimeFilter>[] = [
  { value: 'all', label: 'Tous' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 h' },
]
const proteinChoices: Choice<ProteinFilter>[] = [
  { value: 'all', label: 'Tous' },
  { value: 20, label: '20 g' },
  { value: 30, label: '30 g' },
  { value: 40, label: '40 g' },
]

function RecipeRow({ item, approx }: { item: RecipeListItem; approx: boolean }) {
  const { recipe } = item
  const m = roundMacros(item.perServing)
  return (
    <li>
      <Link
        to={`/nutrition/recettes/${recipe.id}`}
        className={`flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 no-underline active:bg-surface-hi ${focusRing}`}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-lg font-semibold leading-snug text-zinc-100">
            {recipe.favorite === true ? <Star on className="mr-1" /> : null}
            {recipe.favorite === true ? <span className="sr-only">Favori. </span> : null}
            {recipe.name}
          </span>
          <span className="text-base text-zinc-200">
            <span className="font-semibold tabular-nums">
              {approx ? (
                <span title="Macros incomplètes" aria-label="Macros incomplètes, environ ">
                  ≈{' '}
                </span>
              ) : null}
              {fmtInt(m.kcal)} kcal
            </span>
            <span className="text-zinc-400"> · </span>
            <span className="font-semibold tabular-nums">P {fmtG(m.protein)} g</span>
            <span className="text-sm text-zinc-400"> par portion</span>
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-400">
            <span>{fmtMinutes(item.totalMinutes)}</span>
            <span aria-hidden="true">·</span>
            <span>{recipe.meal.map((s) => SLOT_LABEL[s]).join(', ')}</span>
            {recipe.source === 'user' ? <Badge>Perso</Badge> : null}
          </span>
        </span>
        <Chevron />
      </Link>
    </li>
  )
}

function DeletedSheet({
  deleted,
  onClose,
}: {
  deleted: readonly { id: string; name: string }[]
  onClose: () => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const restore = async (id: string) => {
    setBusyId(id)
    setError(null)
    try {
      await restoreRecipe(id)
    } catch (e) {
      setError(errorMessage(e, 'Impossible de restaurer. Réessaie.'))
    } finally {
      setBusyId(null)
    }
  }
  return (
    <Sheet title="Recettes supprimées" onClose={onClose}>
      <p className="-mt-2 mb-4 text-base text-zinc-400">
        Seules les recettes fournies avec l’app peuvent être restaurées. Une recette que tu as créée est
        supprimée pour de bon.
      </p>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {deleted.length === 0 ? (
        <p className="text-base font-semibold">Aucune recette supprimée.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {deleted.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface-hi p-3 pl-4"
            >
              <span className="min-w-0 flex-1 text-base font-semibold leading-snug">{r.name}</span>
              <Button
                variant="secondary"
                width="auto"
                className="shrink-0"
                disabled={busyId !== null}
                aria-label={`Restaurer ${r.name}`}
                onClick={() => void restore(r.id)}
              >
                Restaurer
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  )
}

export default function RecipesScreen() {
  const { data, error } = useRecipeLibrary()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(() => params.get('q') ?? '')
  const [deletedOpen, setDeletedOpen] = useState(false)

  const mealParam = params.get('m')
  const meal: MealSlot | undefined = isMealSlot(mealParam) ? mealParam : undefined
  const maxMinutes = [15, 30, 45, 60].find((n) => n === Number(params.get('t')))
  const minProtein = [20, 30, 40].find((n) => n === Number(params.get('p')))
  const ingredient = params.get('i') ?? ''
  const favoritesOnly = params.get('fav') === '1'
  const panelOpen = params.get('f') === '1'

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

  const items = useMemo(() => (data ? recipeListItems(data.recipes, data.lookup) : []), [data])
  const approx = useMemo(
    () => (data ? recipesWithMissingData(data.recipes, data.lookup) : new Set<string>()),
    [data],
  )
  const filter: RecipeFilter = {
    query,
    ...(meal ? { meal } : {}),
    ...(maxMinutes !== undefined ? { maxTotalMinutes: maxMinutes } : {}),
    ...(minProtein !== undefined ? { minProteinPerServing: minProtein } : {}),
    ...(ingredient.trim() !== '' ? { ingredient } : {}),
    ...(favoritesOnly ? { favoritesOnly: true } : {}),
  }
  const filtered = filterRecipes(items, filter)
  const deleted = data ? deletedSeedRecipes(data.seeds, data.rows) : []
  const activeCount =
    (maxMinutes !== undefined ? 1 : 0) +
    (minProtein !== undefined ? 1 : 0) +
    (ingredient.trim() !== '' ? 1 : 0) +
    (favoritesOnly ? 1 : 0)
  const filtersActive = query.trim() !== '' || meal !== undefined || activeCount > 0

  return (
    <section>
      <BackLink to="/nutrition">Nutrition</BackLink>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Recettes</h1>
        <Link
          to="/nutrition/recettes/nouvelle"
          aria-label="Créer une recette"
          className={`flex size-11 shrink-0 items-center justify-center rounded-full bg-orange-400 text-zinc-950 no-underline active:bg-orange-300 ${focusRing}`}
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

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link to="/nutrition/frigo" className={linkButtonClass('secondary')}>
          Frigo
        </Link>
        <Link to="/nutrition/courses" className={linkButtonClass('secondary')}>
          Courses
        </Link>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="recipe-search" className="sr-only">
            Rechercher une recette
          </label>
          <SearchIcon />
          <input
            id="recipe-search"
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            placeholder="Rechercher une recette"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setParam('q', e.target.value)
            }}
            className={searchInputClass}
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
          aria-controls="recipe-filters"
          onClick={() => setParam('f', panelOpen ? null : '1')}
          className={`flex min-h-12 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-base font-semibold ${focusRing} ${
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

      <div role="group" aria-label="Filtrer par repas" className="mt-3">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {([undefined, 'breakfast', 'lunch', 'dinner', 'snack'] as (MealSlot | undefined)[]).map((s) => {
            const active = s === meal
            return (
              <button
                key={s ?? 'all'}
                type="button"
                aria-pressed={active}
                onClick={() => setParam('m', s ?? null)}
                className={`h-11 shrink-0 rounded-full border px-4 text-base font-medium ${focusRing} ${
                  active
                    ? 'border-orange-400 bg-orange-400/15 text-orange-300'
                    : 'border-line bg-surface-hi text-zinc-200'
                }`}
              >
                {s ? (slotChoices.find((c) => c.value === s)?.label ?? s) : 'Tous'}
              </button>
            )
          })}
        </div>
      </div>

      {panelOpen ? (
        <div
          id="recipe-filters"
          className="mt-3 flex flex-col gap-4 rounded-2xl border border-line bg-surface p-3"
        >
          <ChoiceGroup<TimeFilter>
            legend="Temps total maximum"
            layout="grid"
            value={(maxMinutes as TimeFilter | undefined) ?? 'all'}
            options={timeChoices}
            onChange={(v) => setParam('t', v === 'all' ? null : String(v))}
          />
          <ChoiceGroup<ProteinFilter>
            legend="Protéines minimum par portion"
            layout="grid"
            value={(minProtein as ProteinFilter | undefined) ?? 'all'}
            options={proteinChoices}
            onChange={(v) => setParam('p', v === 'all' ? null : String(v))}
          />
          <TextField
            label="Contient l’ingrédient"
            placeholder="poulet, œufs…"
            autoComplete="off"
            value={ingredient}
            onChange={(v) => setParam('i', v)}
          />
          <Switch
            label="Favoris seulement"
            checked={favoritesOnly}
            onChange={(on) => setParam('fav', on ? '1' : null)}
          />
        </div>
      ) : null}

      {data ? <CiqualBanner failed={data.ciqualFailed} onRetry={data.retry} /> : null}
      {error ? (
        <div className="mt-5">
          <ErrorNote>Impossible de lire les recettes. Ferme l’app puis rouvre-la.</ErrorNote>
        </div>
      ) : null}

      {!data ? (
        <Loading />
      ) : (
        <>
          <p aria-live="polite" className="mt-3 text-sm text-zinc-400">
            {filtered.length} recette{filtered.length > 1 ? 's' : ''}
          </p>
          {filtered.length === 0 ? (
            <Card className="mt-3 text-center">
              <p className="text-lg font-semibold">Aucune recette trouvée</p>
              <p className="mt-1 text-base text-zinc-400">Essaie un autre mot ou retire un filtre.</p>
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
            <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
              {filtered.map((item) => (
                <RecipeRow key={item.recipe.id} item={item} approx={approx.has(item.recipe.id)} />
              ))}
            </ul>
          )}
          <div className="mt-8 flex flex-col">
            <Link
              to="/reglages/importer"
              className="flex min-h-12 items-center justify-center rounded-xl text-base font-medium text-zinc-300 underline"
            >
              Importer des recettes
            </Link>
            <button
              type="button"
              onClick={() => setDeletedOpen(true)}
              className="flex min-h-12 items-center justify-center rounded-xl text-base font-medium text-zinc-300 underline"
            >
              Recettes supprimées ({deleted.length})
            </button>
          </div>
          {deletedOpen ? <DeletedSheet deleted={deleted} onClose={() => setDeletedOpen(false)} /> : null}
        </>
      )}
    </section>
  )
}
