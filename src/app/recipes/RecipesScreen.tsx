import { BookOpen, Clapperboard, Plus, ScanLine, SearchX, Star } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { restoreRecipe } from '../../db'
import { deletedSeedRecipes, filterRecipes, recipeListItems, roundMacros } from '../../domain/nutrition'
import type { MealSlot, RecipeFilter, RecipeListItem } from '../../types'
import { errorMessage } from '../../ui'
import { Button, Card, EmptyState, FoodTile, Sheet, cx } from '../../ui/kit'
import { buttonClass } from '../../ui/kit/buttonClass'
import { CheckRow } from '../../ui/kit/CheckRow'
import { ChoiceGroup } from '../../ui/kit/ChoiceGroup'
import type { ChoiceOption } from '../../ui/kit'
import { TextField } from '../../ui/kit/Fields'
import { Note } from '../../ui/kit/Note'
import { NutritionTabs } from '../nutrition/NutritionTabs'
import { SLOT_LABEL, isMealSlot, slotChoices } from '../nutrition/format'
import { NEW_RECIPE_PATH, RECIPE_SCAN_PATH, SETTINGS_PATH, VIDEO_RECIPE_PATH, recipePath } from '../routes'
import { fmtMinutes } from './format'
import { Badge, CiqualBanner, FilterChip, Loading } from './parts'
import { SearchBox } from '../../ui/kit/SearchBox'
import { formatDecimal, formatInt } from '../../ui/kit/format'
import { useFridgePortions } from './useFridge'
import { recipesWithMissingData, useRecipeLibrary } from './useRecipes'

type TimeFilter = 'all' | 15 | 30 | 45 | 60
type ProteinFilter = 'all' | 20 | 30 | 40

const timeChoices: ChoiceOption<TimeFilter>[] = [
  { value: 'all', label: 'Tous' },
  { value: 15, label: '15 min' },
  { value: 30, label: '30 min' },
  { value: 45, label: '45 min' },
  { value: 60, label: '1 h' },
]
const proteinChoices: ChoiceOption<ProteinFilter>[] = [
  { value: 'all', label: 'Tous' },
  { value: 20, label: '20 g' },
  { value: 30, label: '30 g' },
  { value: 40, label: '40 g' },
]

function RecipeRow({ item, approx }: { item: RecipeListItem; approx: boolean }) {
  const { recipe } = item
  const m = roundMacros(item.perServing)
  return (
    <li className="border-t border-line first:border-t-0">
      <Link
        to={recipePath(recipe.id)}
        className="focus-ring flex min-h-14 items-center gap-3 py-2.5 text-ink no-underline active:opacity-70"
      >
        <FoodTile category="dish" size={48} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="line-clamp-2 text-headline">
            {recipe.favorite === true ? (
              <>
                <Star
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  className="mr-1 inline fill-ember text-ember-ink"
                />
                <span className="sr-only">Favori. </span>
              </>
            ) : null}
            {recipe.name}
          </span>
          <span className="text-caption text-ink">
            <span className="font-display font-bold tabular-nums">
              {approx ? (
                <>
                  <span aria-hidden="true">≈ </span>
                  <span className="sr-only">Macros incomplètes, environ </span>
                </>
              ) : null}
              {formatInt(m.kcal)} kcal
            </span>
            {' · '}
            <span className="font-display font-bold tabular-nums">{`P\u00a0${formatDecimal(m.protein)}\u00a0g`}</span>
            <span className="text-ink-muted"> par portion</span>
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-ink-muted">
            <span>{fmtMinutes(item.totalMinutes)}</span>
            <span aria-hidden="true">·</span>
            <span>{recipe.meal.map((s) => SLOT_LABEL[s]).join(', ')}</span>
            {recipe.source === 'user' ? <Badge>Perso</Badge> : null}
          </span>
        </span>
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
    <Sheet
      title="Recettes supprimées"
      description="Seules les recettes fournies avec l’app peuvent être restaurées. Une recette que tu as créée est supprimée pour de bon."
      onClose={onClose}
    >
      {error ? <Note tone="error">{error}</Note> : null}
      {deleted.length === 0 ? (
        <EmptyState compact icon={BookOpen} title="Aucune recette supprimée">
          Les recettes que tu supprimes pourront être restaurées ici.
        </EmptyState>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {deleted.map((r) => (
            <li key={r.id} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
              <span className="min-w-0 flex-1 text-body-strong">{r.name}</span>
              <Button
                variant="secondary"
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
  const fridgePortions = useFridgePortions()
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
    <div className="flex flex-col gap-3.5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="m-0 font-display text-display-l">Recettes</h1>
        <Link
          to={NEW_RECIPE_PATH}
          aria-label="Créer une recette"
          className="focus-ring grid size-12 shrink-0 place-items-center rounded-full bg-ember text-ink no-underline shadow-card active:opacity-80"
        >
          <Plus size={24} strokeWidth={2} aria-hidden="true" />
        </Link>
      </header>

      <NutritionTabs current="recipes" fridgePortions={fridgePortions} />

      <div className="flex flex-col gap-1.5">
        <p className="m-0 text-label uppercase text-ink-muted">Créer à partir de…</p>
        <div className="grid grid-cols-2 gap-2">
          <Link to={RECIPE_SCAN_PATH} className={cx(buttonClass('secondary'), 'px-3')}>
            <ScanLine size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="sr-only">Recette </span>
            Par scan
          </Link>
          <Link to={VIDEO_RECIPE_PATH} className={cx(buttonClass('secondary'), 'px-3')}>
            <Clapperboard size={20} strokeWidth={1.75} aria-hidden="true" />
            <span className="sr-only">Recette </span>
            D’une vidéo
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <SearchBox
          id="recipe-search"
          label="Rechercher une recette"
          value={query}
          onChange={(v) => {
            setQuery(v)
            setParam('q', v)
          }}
          onClear={() => {
            setQuery('')
            setParam('q', null)
          }}
        />
        <button
          type="button"
          aria-expanded={panelOpen}
          aria-controls="recipe-filters"
          onClick={() => setParam('f', panelOpen ? null : '1')}
          className={cx(
            'focus-ring flex min-h-12 shrink-0 items-center gap-1.5 rounded-full px-4 text-body-strong',
            activeCount > 0 || panelOpen
              ? 'bg-ember-soft font-bold text-ink ring-2 ring-ember'
              : 'bg-surface text-ink shadow-card',
          )}
        >
          Filtres
          {activeCount > 0 ? (
            <>
              <span
                aria-hidden="true"
                className="grid size-6 place-items-center rounded-full bg-inverse font-display text-caption text-on-inverse"
              >
                {activeCount}
              </span>
              <span className="sr-only">
                {`${activeCount} filtre${activeCount > 1 ? 's' : ''} actif${activeCount > 1 ? 's' : ''}`}
              </span>
            </>
          ) : null}
        </button>
      </div>

      <div role="group" aria-label="Filtrer par repas">
        <div className="ds-bleed flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {([undefined, 'breakfast', 'lunch', 'dinner', 'snack'] as (MealSlot | undefined)[]).map((s) => (
            <FilterChip
              key={s ?? 'all'}
              label={s ? (slotChoices.find((c) => c.value === s)?.label ?? s) : 'Tous'}
              pressed={s === meal}
              onClick={() => setParam('m', s ?? null)}
            />
          ))}
        </div>
      </div>

      {panelOpen ? (
        <Card id="recipe-filters" padding="large" className="flex flex-col gap-4">
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
          <CheckRow
            label="Favoris seulement"
            checked={favoritesOnly}
            onChange={(on) => setParam('fav', on ? '1' : null)}
          />
        </Card>
      ) : null}

      {data ? <CiqualBanner failed={data.ciqualFailed} onRetry={data.retry} /> : null}
      {error ? <Note tone="error">Impossible de lire les recettes. Ferme l’app puis rouvre-la.</Note> : null}

      {!data ? (
        <Loading />
      ) : (
        <>
          <p aria-live="polite" className="m-0 text-caption text-ink-muted">
            {filtered.length} recette{filtered.length > 1 ? 's' : ''}
          </p>
          {filtered.length === 0 ? (
            filtersActive ? (
              <EmptyState
                icon={SearchX}
                title="Aucune recette trouvée"
                action={
                  <Button variant="text" onClick={reset}>
                    Réinitialiser les filtres
                  </Button>
                }
              >
                Essaie un autre mot ou retire un filtre.
              </EmptyState>
            ) : (
              <EmptyState
                icon={BookOpen}
                title="Pas encore de recette"
                action={
                  deleted.length > 0 ? (
                    <Button variant="secondary" onClick={() => setDeletedOpen(true)}>
                      Restaurer les recettes supprimées
                    </Button>
                  ) : undefined
                }
              >
                {deleted.length > 0
                  ? 'Tu peux restaurer les recettes fournies, ou créer la tienne avec le bouton +.'
                  : 'Crée ta première recette avec le bouton +, ou importe-en depuis les Réglages.'}
              </EmptyState>
            )
          ) : (
            <Card padding="none" className="px-4 py-1">
              <ul className="m-0 list-none p-0">
                {filtered.map((item) => (
                  <RecipeRow key={item.recipe.id} item={item} approx={approx.has(item.recipe.id)} />
                ))}
              </ul>
            </Card>
          )}
          <div className="flex flex-col items-center">
            <Link to={`${SETTINGS_PATH}/importer`} className={buttonClass('text')}>
              Importer des recettes
            </Link>
            <Button variant="text" onClick={() => setDeletedOpen(true)}>
              Recettes supprimées ({deleted.length})
            </Button>
          </div>
          {deletedOpen ? <DeletedSheet deleted={deleted} onClose={() => setDeletedOpen(false)} /> : null}
        </>
      )}
    </div>
  )
}
