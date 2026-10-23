import { Link } from 'react-router-dom'
import { pillClass } from '../../ui/kit'
import { formatDecimal } from '../../ui/kit/format'
import { FRIDGE_PATH, NUTRITION_PATH, RECIPES_PATH, SHOPPING_PATH } from '../routes'
import { portionsWord } from '../recipes/format'

export type NutritionTabId = 'journal' | 'recipes' | 'fridge' | 'shopping'

const PATHS: Record<NutritionTabId, string> = {
  journal: NUTRITION_PATH,
  recipes: RECIPES_PATH,
  fridge: FRIDGE_PATH,
  shopping: SHOPPING_PATH,
}

export interface NutritionTabsProps {
  /** Section de l'écran affiché. */
  current: NutritionTabId
  /** Portions au frigo, pour « Frigo · N » ; absent ou 0 : « Frigo » seul. Fourni par l'écran, qui les lit déjà. */
  fridgePortions?: number
}

/**
 * Sections de la nutrition (Journal · Recettes · Frigo · Courses) : navigation par liens en pastilles, la section
 * courante porte `aria-current="page"`. « Frigo · N » = portions restantes. Une seule ligne : défilement
 * horizontal (sans barre) si les pastilles dépassent la largeur, plutôt qu'un retour à la ligne.
 */
export function NutritionTabs({ current, fridgePortions = 0 }: NutritionTabsProps) {
  const portions = fridgePortions
  const tabs: { id: NutritionTabId; label: string; ariaLabel?: string }[] = [
    { id: 'journal', label: 'Journal' },
    { id: 'recipes', label: 'Recettes' },
    {
      id: 'fridge',
      label: portions > 0 ? `Frigo · ${formatDecimal(portions, 2)}` : 'Frigo',
      // Le point médian est lu « point » par les lecteurs d'écran : nom accessible en toutes lettres.
      ...(portions > 0
        ? { ariaLabel: `Frigo, ${formatDecimal(portions, 2)} ${portionsWord(portions)}` }
        : {}),
    },
    { id: 'shopping', label: 'Courses' },
  ]
  return (
    <nav
      aria-label="Sections de la nutrition"
      className="ds-bleed -my-1 flex gap-1 overflow-x-auto py-1 [scrollbar-width:none]"
    >
      {tabs.map((t) => (
        <Link
          key={t.id}
          to={PATHS[t.id]}
          aria-label={t.ariaLabel}
          aria-current={t.id === current ? 'page' : undefined}
          className={pillClass(t.id === current, true)}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
