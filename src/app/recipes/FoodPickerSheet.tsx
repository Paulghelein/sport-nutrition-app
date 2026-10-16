import { useMemo, useState } from 'react'
import { searchFoodIndex } from '../../domain/nutrition'
import type { FoodIndex } from '../../domain/nutrition'
import type { Food } from '../../types'
import { Sheet } from '../../ui'
import { fmtG, fmtInt } from '../nutrition/format'
import { SearchIcon, focusRing, searchInputClass } from './parts'

/** Recherche d'un aliment (Ciqual ou perso) pour relier un ingrédient. */
export function FoodPickerSheet({
  index,
  initialQuery = '',
  onPick,
  onClose,
}: {
  index: FoodIndex
  initialQuery?: string
  onPick: (food: Food) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState(initialQuery)
  const results = useMemo(() => searchFoodIndex(index, query, { limit: 25 }), [index, query])
  return (
    <Sheet title="Relier à un aliment" onClose={onClose}>
      <div className="relative">
        <label htmlFor="food-picker-search" className="sr-only">
          Rechercher un aliment
        </label>
        <SearchIcon />
        <input
          id="food-picker-search"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Rechercher un aliment"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={searchInputClass}
        />
      </div>
      <p className="mt-2 text-sm text-zinc-400">
        Les macros viennent alors de la table Ciqual ou de ton aliment, pour 100 g.
      </p>
      <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
        {results.map((food) => (
          <li key={food.id}>
            <button
              type="button"
              onClick={() => onPick(food)}
              className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface-hi px-3 py-2 text-left active:bg-zinc-700 ${focusRing}`}
            >
              <span className="min-w-0">
                <span className="block text-base font-medium leading-snug">{food.name}</span>
                <span className="block text-sm text-zinc-400">
                  P {fmtG(food.per100g.protein)} · G {fmtG(food.per100g.carbs)} · L {fmtG(food.per100g.fat)} /
                  100 g
                </span>
              </span>
              <span className="shrink-0 text-base font-semibold tabular-nums">
                {fmtInt(food.per100g.kcal)} kcal
              </span>
            </button>
          </li>
        ))}
        {query.trim() !== '' && results.length === 0 ? (
          <li className="text-base text-zinc-400">Aucun aliment trouvé.</li>
        ) : null}
      </ul>
    </Sheet>
  )
}
