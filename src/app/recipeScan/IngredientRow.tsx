import { Trash2 } from 'lucide-react'
import { foodCategory } from '../../domain/nutrition/category'
import type { ScanIngredient } from '../../types'
import { FoodTile } from '../../ui/kit/FoodPictogram'
import { formatDecimal } from '../../ui/kit/format'
import { ingredientSource } from './draftState'

/** Ligne d'ingrédient : visuel 40 px, nom, source, pastille de quantité (ouvre la feuille) et suppression. */
export function IngredientRow({
  ingredient,
  photoUrl,
  onEdit,
  onRemove,
}: {
  ingredient: ScanIngredient
  photoUrl: string | undefined
  onEdit: () => void
  onRemove: () => void
}) {
  const grams = `${formatDecimal(ingredient.grams, 2)} g`
  return (
    <li className="flex items-center gap-2.5 border-t border-line py-2 first:border-t-0">
      <FoodTile
        category={foodCategory({ name: ingredient.name })}
        {...(photoUrl !== undefined ? { photoUrl } : {})}
        {...(ingredient.origin === 'scan' ? { badge: 'barcode' as const } : {})}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-headline truncate">{ingredient.name}</span>
        <span className="text-caption text-ink-muted">{ingredientSource(ingredient)}</span>
      </div>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Quantité de ${ingredient.name} : ${grams}. Modifier`}
        className="focus-ring min-h-11 min-w-16 shrink-0 rounded-full bg-surface-sunken px-3 text-center font-display text-body-strong tabular-nums"
      >
        {grams}
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Retirer ${ingredient.name}`}
        className="focus-ring grid size-11 shrink-0 place-items-center rounded-full text-ink-muted active:bg-surface-sunken"
      >
        <Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </li>
  )
}
