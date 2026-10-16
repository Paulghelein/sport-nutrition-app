// Liste de courses (SPEC §4.3) : fusion par aliment, grammes, regroupement par rayon. Fonctions pures.
import type { Id } from '../../types/common'
import type { Aisle, Recipe, RecipeIngredient, ShoppingItem } from '../../types/nutrition'
import type { ShoppingGroup } from '../../types/recipes'
import { normalizeFoodSearch } from './search'
import { scaleGrams } from './recipes'

/** Ordre de parcours d'un magasin. */
export const AISLE_ORDER: readonly Aisle[] = [
  'produce',
  'bakery',
  'butcher',
  'fish',
  'dairy',
  'grocery',
  'frozen',
  'other',
]

export const AISLE_LABELS: Record<Aisle, string> = {
  produce: 'Fruits et légumes',
  bakery: 'Boulangerie',
  butcher: 'Boucherie',
  fish: 'Poissonnerie',
  dairy: 'Crèmerie',
  grocery: 'Épicerie',
  frozen: 'Surgelés',
  other: 'Autre',
}

const collator = new Intl.Collator('fr')

/** Clé de fusion : `food:<foodId>`, sinon `ciqual:<code>`, sinon `name:<nom normalisé>`. */
export function shoppingKey(ingredient: Pick<RecipeIngredient, 'name' | 'foodId' | 'ciqualCode'>): string {
  // Un aliment Ciqual a une seule clé, qu'il soit référencé par foodId (`ciqual-<code>`) ou par ciqualCode.
  if (ingredient.ciqualCode !== undefined) return `ciqual:${ingredient.ciqualCode}`
  if (ingredient.foodId !== undefined) {
    return ingredient.foodId.startsWith('ciqual-')
      ? `ciqual:${ingredient.foodId.slice('ciqual-'.length)}`
      : `food:${ingredient.foodId}`
  }
  return `name:${normalizeFoodSearch(ingredient.name)}`
}

/**
 * Liste de courses depuis des recettes et leurs portions. Grammes additionnés par clé (nom et rayon du premier
 * rencontré), arrondis une seule fois à la fin. Avec `previous` : `checked` et id des clés identiques conservés,
 * articles `manual` repris tels quels (en fin de liste).
 */
export function buildShoppingItems(
  sources: readonly { recipe: Recipe; portions: number }[],
  previous: readonly ShoppingItem[] | undefined,
  newId: () => Id,
): ShoppingItem[] {
  const acc = new Map<string, { name: string; aisle: Aisle; grams: number; foodId?: Id }>()
  for (const { recipe, portions } of sources) {
    const k = portions / (recipe.servings > 0 ? recipe.servings : 1)
    for (const ing of recipe.ingredients) {
      const key = shoppingKey(ing)
      const existing = acc.get(key)
      if (existing) existing.grams += ing.grams * k
      else
        acc.set(key, {
          name: ing.name,
          aisle: ing.aisle,
          grams: ing.grams * k,
          ...(ing.foodId !== undefined ? { foodId: ing.foodId } : {}),
        })
    }
  }
  const prev0 = previous ?? []
  const prevByKey = new Map(prev0.filter((p) => p.manual !== true).map((p) => [p.key, p]))
  const items: ShoppingItem[] = []
  for (const [key, a] of acc) {
    const prev = prevByKey.get(key)
    items.push({
      id: prev?.id ?? newId(),
      key,
      name: a.name,
      grams: scaleGrams(a.grams, 1, 1),
      aisle: a.aisle,
      ...(a.foodId !== undefined ? { foodId: a.foodId } : {}),
      checked: prev?.checked ?? false,
    })
  }
  for (const p of prev0) if (p.manual === true) items.push(p)
  return items
}

/** Rayons dans l'ordre `AISLE_ORDER` (vides omis) ; articles par nom (fr), cochés en fin de rayon. */
export function groupShoppingItems(items: readonly ShoppingItem[]): ShoppingGroup[] {
  return AISLE_ORDER.map((aisle) => ({
    aisle,
    items: items
      .filter((i) => i.aisle === aisle)
      .sort((a, b) => Number(a.checked) - Number(b.checked) || collator.compare(a.name, b.name)),
  })).filter((g) => g.items.length > 0)
}

/** Article ajouté à la main : clé `manual:<id>`, conservé quand la liste est régénérée. */
export function manualShoppingItem(name: string, aisle: Aisle, grams: number, id: Id): ShoppingItem {
  return { id, key: `manual:${id}`, name: name.trim(), grams, aisle, checked: false, manual: true }
}
