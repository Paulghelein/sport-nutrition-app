// Ciqual : jeu embarqué → aliments (SPEC §4.4). Le JSON est chargé à la demande par la couche appelante.
import type { CiqualDataset, CiqualFood, Food } from '../../types/nutrition'
import type { IsoDateTime } from '../../types/common'
import { normalizeFoodSearch } from './search'

export function ciqualDatasetToFoods(ds: CiqualDataset): CiqualFood[] {
  return ds.foods.map(([code, name, group, kcal, protein, carbs, fat, fiber]) => ({
    id: `ciqual-${code}`,
    code,
    name,
    group: ds.groups[group] ?? '',
    search: normalizeFoodSearch(name),
    per100g: fiber === null ? { kcal, protein, carbs, fat } : { kcal, protein, carbs, fat, fiber },
  }))
}

/** Aliment Ciqual sous forme de `Food` (non favori), pour l'affichage et le log. */
export function ciqualToFood(c: CiqualFood, updatedAt: IsoDateTime): Food {
  return {
    id: c.id,
    name: c.name,
    source: 'ciqual',
    ciqualCode: c.code,
    per100g: { ...c.per100g },
    favorite: false,
    updatedAt,
  }
}

/**
 * Liste complète des aliments : une ligne `foods` de même id qu'un aliment Ciqual le remplace (favori, valeurs
 * corrigées) ; les autres lignes (perso, OFF) s'ajoutent. Ordre : Ciqual d'abord (ordre du jeu), puis les ajouts.
 * `updatedAt` des aliments Ciqual non surchargés = `epoch` fourni (aucune horloge ici).
 */
export function mergeFoods(
  ciqual: readonly CiqualFood[],
  rows: readonly Food[],
  epoch: IsoDateTime = '1970-01-01T00:00:00.000Z',
): Food[] {
  const overrides = new Map<string, Food>()
  for (const r of rows) overrides.set(r.id, r)
  const out: Food[] = []
  const seen = new Set<string>()
  for (const c of ciqual) {
    out.push(overrides.get(c.id) ?? ciqualToFood(c, epoch))
    seen.add(c.id)
  }
  for (const r of rows) if (!seen.has(r.id)) out.push(r)
  return out
}

/**
 * Vrai si une surcharge `foods` d'un aliment Ciqual diffère de l'original (nom, valeurs pour 100 g, portion, marque,
 * rayon) : l'UI propose alors « Rétablir l'original ». Le favori ne compte pas. L'original n'a ni portion, ni marque,
 * ni rayon : en définir un est une modification.
 */
export function isCiqualOverrideModified(food: Food, original: CiqualFood): boolean {
  const a = food.per100g
  const b = original.per100g
  return (
    food.name !== original.name ||
    a.kcal !== b.kcal ||
    a.protein !== b.protein ||
    a.carbs !== b.carbs ||
    a.fat !== b.fat ||
    a.fiber !== b.fiber ||
    food.defaultPortionG !== undefined ||
    food.brand !== undefined ||
    food.aisle !== undefined
  )
}
