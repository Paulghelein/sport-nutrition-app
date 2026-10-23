import { useMemo, useState } from 'react'
import { recipeListItems, recipeNutrition, roundMacros, normalizeFoodSearch } from '../../domain/nutrition'
import type { FoodLogEntry, FridgeItem, LibraryRecipe, LocalDate, MealSlot } from '../../types'
import { Card, ListRow, Sheet } from '../../ui/kit'
import { portionsWord } from './format'
import { CiqualBanner } from './parts'
import { SearchBox } from '../../ui/kit/SearchBox'
import { formatDecimal, formatInt } from '../../ui/kit/format'
import { RecipeLogSheet } from './RecipeLogSheet'
import { useFridge } from './useFridge'
import { recipesWithMissingData, useRecipeLibrary } from './useRecipes'

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
      <ListRow
        title={item.recipe.name}
        subtitle={`${left !== undefined ? `Au frigo : ${formatDecimal(left, 2)} ${portionsWord(left)} · ` : ''}P ${formatDecimal(m.protein)} g par portion`}
        trailing={
          <span className="font-display text-body-strong tabular-nums">
            {approx ? <span aria-label="Macros incomplètes, environ ">≈ </span> : null}
            {formatInt(m.kcal)} kcal
          </span>
        }
        onPress={() => onPick(item.recipe)}
      />
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
      <section aria-label={title} className="flex flex-col gap-1.5">
        <h3 className="m-0 text-label uppercase text-ink-muted">{title}</h3>
        <Card padding="none" className="px-4 py-1">
          <ul className="m-0 list-none p-0">
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
        </Card>
      </section>
    )

  return (
    <>
      <Sheet title="Portion de recette" onClose={onClose}>
        <div className="flex flex-col gap-4">
          <div className="flex">
            <SearchBox
              id="recipe-pick-search"
              label="Rechercher une recette"
              value={query}
              onChange={setQuery}
              onClear={() => setQuery('')}
            />
          </div>
          {lib ? <CiqualBanner failed={lib.ciqualFailed} onRetry={lib.retry} /> : null}
          {!lib ? (
            <p className="m-0 text-body text-ink-muted" aria-busy="true">
              Chargement…
            </p>
          ) : (
            <>
              {group('Au frigo', inFridge)}
              {group('Favoris', favorites)}
              {group(searching ? 'Résultats' : 'Toutes les recettes', others)}
              {matches.length === 0 ? (
                <p className="m-0 text-body text-ink-muted">Aucune recette trouvée.</p>
              ) : null}
            </>
          )}
        </div>
      </Sheet>
      {chosen && lib ? (
        <RecipeLogSheet
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
