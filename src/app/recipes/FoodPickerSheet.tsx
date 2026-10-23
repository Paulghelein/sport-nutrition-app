import { useMemo, useState } from 'react'
import { searchFoodIndex } from '../../domain/nutrition'
import type { FoodIndex } from '../../domain/nutrition'
import type { Food } from '../../types'
import { Card, ListRow, Sheet } from '../../ui/kit'
import { SearchBox } from '../../ui/kit/SearchBox'
import { formatDecimal, formatInt } from '../../ui/kit/format'

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
      <div className="flex flex-col gap-3">
        <div className="flex">
          <SearchBox
            id="food-picker-search"
            label="Rechercher un aliment"
            value={query}
            onChange={setQuery}
            onClear={() => setQuery('')}
          />
        </div>
        <p className="m-0 text-caption text-ink-muted">
          Les macros viennent alors de la table Ciqual ou de ton aliment, pour 100 g.
        </p>
        {results.length > 0 ? (
          <Card padding="none" className="px-4 py-1">
            <ul className="m-0 list-none p-0">
              {results.map((food) => (
                <li key={food.id}>
                  <ListRow
                    title={food.name}
                    subtitle={`P ${formatDecimal(food.per100g.protein)} · G ${formatDecimal(food.per100g.carbs)} · L ${formatDecimal(food.per100g.fat)} / 100 g`}
                    trailing={
                      <span className="font-display text-body-strong tabular-nums">
                        {formatInt(food.per100g.kcal)} kcal
                      </span>
                    }
                    onPress={() => onPick(food)}
                  />
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        {query.trim() !== '' && results.length === 0 ? (
          <p className="m-0 text-body text-ink-muted">Aucun aliment trouvé.</p>
        ) : null}
      </div>
    </Sheet>
  )
}
