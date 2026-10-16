import { useMemo, useState } from 'react'
import { recipeListItems, recipeNutrition, roundMacros, normalizeFoodSearch } from '../../domain/nutrition'
import type { FoodLogEntry, FridgeItem, LibraryRecipe, LocalDate, MealSlot } from '../../types'
import { Sheet } from '../../ui'
import { fmtG, fmtInt } from '../nutrition/format'
import { fmtPortions, portionsWord } from './format'
import { LogRecipeSheet } from './LogRecipeSheet'
import { CiqualBanner, SearchIcon, focusRing, searchInputClass } from './parts'
import { recipesWithMissingData, useFridge, useRecipeLibrary } from './useRecipes'

type Item = ReturnType<typeof recipeListItems>[number]

function PickRow({
  item,
  left,
  approx,
  onPick,
}: {
  item: Item
  left: number | undefined
  approx: boolean
  onPick: (recipe: LibraryRecipe) => void
}) {
  const m = roundMacros(item.perServing)
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(item.recipe)}
        className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface-hi px-3 py-2 text-left active:bg-zinc-700 ${focusRing}`}
      >
        <span className="min-w-0">
          <span className="block text-base font-medium leading-snug">{item.recipe.name}</span>
          <span className="block text-sm text-zinc-400">
            {left !== undefined ? `Au frigo : ${fmtPortions(left)} ${portionsWord(left)} · ` : ''}P{' '}
            {fmtG(m.protein)} g par portion
          </span>
        </span>
        <span className="shrink-0 text-base font-semibold tabular-nums">
          {approx ? <span aria-label="Macros incomplètes, environ ">≈ </span> : null}
          {fmtInt(m.kcal)} kcal
        </span>
      </button>
    </li>
  )
}

/**
 * « Portion de recette » depuis l'écran Ajouter : choix d'une recette (frigo d'abord, puis favoris, puis recherche)
 * puis feuille de log pour le jour et le repas du contexte. Chargé à la demande (tire les recettes de départ).
 */
export default function RecipePickerSheet({
  date,
  slot,
  onLogged,
  onClose,
}: {
  date: LocalDate
  slot: MealSlot
  onLogged: (entries: FoodLogEntry[], fridgeBefore: FridgeItem[]) => void
  onClose: () => void
}) {
  const { data: lib } = useRecipeLibrary()
  const { data: fridge } = useFridge()
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<LibraryRecipe | null>(null)

  const items = useMemo(() => (lib ? recipeListItems(lib.recipes, lib.lookup) : []), [lib])
  const left = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of fridge ?? []) m.set(f.recipeId, (m.get(f.recipeId) ?? 0) + f.portionsLeft)
    return m
  }, [fridge])
  const approx = useMemo(
    () => (lib ? recipesWithMissingData(lib.recipes, lib.lookup) : new Set<string>()),
    [lib],
  )
  const q = normalizeFoodSearch(query)
  const searching = q !== ''
  const matches = items.filter((i) => !searching || normalizeFoodSearch(i.recipe.name).includes(q))
  const inFridge = matches.filter((i) => left.has(i.recipe.id))
  const favorites = matches.filter((i) => !left.has(i.recipe.id) && i.recipe.favorite === true)
  const others = matches.filter((i) => !left.has(i.recipe.id) && i.recipe.favorite !== true)

  const group = (title: string, list: Item[]) =>
    list.length === 0 ? null : (
      <section className="mt-4" aria-label={title}>
        <h3 className="mb-1.5 text-base font-bold text-zinc-300">{title}</h3>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {list.map((i) => (
            <PickRow
              key={i.recipe.id}
              item={i}
              left={left.get(i.recipe.id)}
              approx={approx.has(i.recipe.id)}
              onPick={setChosen}
            />
          ))}
        </ul>
      </section>
    )

  return (
    <>
      <Sheet title="Portion de recette" onClose={onClose}>
        <div className="relative">
          <label htmlFor="recipe-pick-search" className="sr-only">
            Rechercher une recette
          </label>
          <SearchIcon />
          <input
            id="recipe-pick-search"
            type="text"
            inputMode="search"
            autoComplete="off"
            placeholder="Rechercher une recette"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={searchInputClass}
          />
        </div>
        {lib ? <CiqualBanner failed={lib.ciqualFailed} onRetry={lib.retry} /> : null}
        {!lib ? (
          <p className="mt-4 text-base text-zinc-400" aria-busy="true">
            Chargement…
          </p>
        ) : (
          <>
            {group('Au frigo', inFridge)}
            {group('Favoris', favorites)}
            {group(searching ? 'Résultats' : 'Toutes les recettes', others)}
            {matches.length === 0 ? (
              <p className="mt-4 text-base text-zinc-400">Aucune recette trouvée.</p>
            ) : null}
          </>
        )}
      </Sheet>
      {chosen && lib ? (
        <LogRecipeSheet
          recipe={chosen}
          nutrition={recipeNutrition(chosen, lib.lookup)}
          fridge={fridge ?? []}
          ciqualFailed={lib.ciqualFailed}
          initialDate={date}
          initialSlot={slot}
          onClose={() => setChosen(null)}
          onLogged={(entries, fridgeBefore) => {
            onLogged(entries, fridgeBefore)
            onClose()
          }}
        />
      ) : null}
    </>
  )
}
