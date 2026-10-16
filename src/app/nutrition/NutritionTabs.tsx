import { Link } from 'react-router-dom'
import { listFridge } from '../../db'
import { useLiveQuery } from '../../ui'
import { cx } from '../../ui/kit'
import { FRIDGE_PATH, NUTRITION_PATH, RECIPES_PATH, SHOPPING_PATH } from '../routes'
import { fmtPortions, portionsWord } from '../recipes/format'

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
}

/**
 * Sections de la nutrition (Journal · Recettes · Frigo · Courses) : navigation par liens en pastilles, la section
 * courante porte `aria-current="page"`. « Frigo · N » = portions restantes. Une seule ligne : défilement
 * horizontal (sans barre) si les pastilles dépassent la largeur, plutôt qu'un retour à la ligne.
 */
export function NutritionTabs({ current }: NutritionTabsProps) {
  const fridge = useLiveQuery(() => listFridge(), [])
  const portions = (fridge.data ?? []).reduce((sum, f) => sum + f.portionsLeft, 0)
  const tabs: { id: NutritionTabId; label: string; ariaLabel?: string }[] = [
    { id: 'journal', label: 'Journal' },
    { id: 'recipes', label: 'Recettes' },
    {
      id: 'fridge',
      label: portions > 0 ? `Frigo · ${fmtPortions(portions)}` : 'Frigo',
      // Le point médian est lu « point » par les lecteurs d'écran : nom accessible en toutes lettres.
      ...(portions > 0 ? { ariaLabel: `Frigo, ${fmtPortions(portions)} ${portionsWord(portions)}` } : {}),
    },
    { id: 'shopping', label: 'Courses' },
  ]
  return (
    <nav
      aria-label="Sections de la nutrition"
      className="-mx-4 -my-1 flex gap-1 overflow-x-auto px-4 py-1 [scrollbar-width:none]"
    >
      {tabs.map((t) => (
        <Link
          key={t.id}
          to={PATHS[t.id]}
          aria-label={t.ariaLabel}
          aria-current={t.id === current ? 'page' : undefined}
          className={cx(
            'focus-ring flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-ds-pill px-3 font-sans text-body-strong no-underline',
            t.id === current ? 'bg-inverse text-on-inverse' : 'bg-surface text-ink',
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
