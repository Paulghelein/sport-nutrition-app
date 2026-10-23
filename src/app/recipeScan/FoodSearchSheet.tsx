import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { foodCategory } from '../../domain/nutrition/category'
import { searchFoodIndex } from '../../domain/nutrition/search'
import type { FoodIndex } from '../../domain/nutrition/search'
import type { Food } from '../../types'
import { FoodTile } from '../../ui/kit/FoodPictogram'
import { Note } from '../../ui/kit/Note'
import { Sheet } from '../../ui/kit/Sheet'
import { formatDecimal, formatInt } from '../../ui/kit/format'
import { usePhotoUrls } from '../nutrition/usePhotoUrls'

/** Recherche d'un aliment (Ciqual, produits déjà scannés, mes aliments) à ajouter à la recette. */
export function FoodSearchSheet({
  index,
  preparing,
  failed,
  initialQuery = '',
  onPick,
  onClose,
}: {
  index: FoodIndex | undefined
  /** La base Ciqual se charge pour la première fois. */
  preparing: boolean
  failed: boolean
  initialQuery?: string
  onPick: (food: Food) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState(initialQuery)
  const results = useMemo(() => (index ? searchFoodIndex(index, query, { limit: 25 }) : []), [index, query])
  const photos = usePhotoUrls(results.filter((f) => f.ean !== undefined).map((f) => f.id))
  return (
    <Sheet
      title="Chercher un aliment"
      description="Ciqual, produits scannés et mes aliments"
      onClose={onClose}
    >
      <div className="relative">
        <label htmlFor="recipe-scan-search" className="sr-only">
          Rechercher un aliment
        </label>
        <Search
          size={20}
          strokeWidth={1.75}
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted"
        />
        <input
          id="recipe-scan-search"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoFocus
          placeholder="Rechercher un aliment"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="focus-ring min-h-12 w-full rounded-md bg-canvas pl-11 pr-3.5 font-sans text-input text-ink placeholder:text-ink-muted"
        />
      </div>
      {failed ? (
        <Note tone="error">La base d’aliments n’a pas pu être chargée. Ferme puis rouvre cette feuille.</Note>
      ) : preparing || !index ? (
        <p role="status" className="m-0 text-body text-ink-muted">
          Préparation de la base d’aliments…
        </p>
      ) : null}
      <ul className="m-0 flex list-none flex-col p-0" aria-label="Résultats">
        {results.map((food) => (
          <li key={food.id} className="border-t border-line first:border-t-0">
            <button
              type="button"
              onClick={() => onPick(food)}
              className="focus-ring flex min-h-14 w-full items-center gap-3 py-2 text-left"
            >
              <FoodTile
                category={foodCategory({ name: food.name })}
                {...(photos.get(food.id) !== undefined ? { photoUrl: photos.get(food.id) } : {})}
                {...(food.ean !== undefined ? { badge: 'barcode' as const } : {})}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-headline truncate">{food.name}</span>
                <span className="text-caption text-ink-muted">
                  P {formatDecimal(food.per100g.protein)} · G {formatDecimal(food.per100g.carbs)} · L{' '}
                  {formatDecimal(food.per100g.fat)} / 100 g
                </span>
              </span>
              <span className="shrink-0 font-display text-body-strong tabular-nums">
                {formatInt(food.per100g.kcal)} kcal
              </span>
            </button>
          </li>
        ))}
      </ul>
      {index && !preparing && query.trim() !== '' && results.length === 0 ? (
        <p className="m-0 text-body text-ink-muted">Aucun aliment trouvé. Essaie un mot plus court.</p>
      ) : null}
    </Sheet>
  )
}
