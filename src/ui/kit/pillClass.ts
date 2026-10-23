import { cx } from './cx'

/**
 * Classes d'une pastille (partagées avec `NutritionTabs`, qui rend des liens) : sélectionnée = fond inverse.
 * `compact` réduit le remplissage horizontal pour qu'une rangée de liens tienne mieux sur 390 px.
 */
export function pillClass(selected: boolean, compact = false): string {
  return cx(
    'focus-ring flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full font-sans text-body-strong',
    compact ? 'px-3' : 'px-4',
    selected ? 'bg-inverse text-on-inverse' : 'bg-surface text-ink',
  )
}
