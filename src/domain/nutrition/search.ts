// Recherche d'aliments : normalisation, index pré-calculé, classement (SPEC §4.2, §4.4).
import type { Food } from '../../types/nutrition'

/** Minuscules, sans accents, œ→oe, æ→ae, ponctuation → espace, espaces réduits. */
export function normalizeFoodSearch(s: string): string {
  return s
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

interface IndexEntry {
  food: Food
  /** Nom normalisé (sert au critère « commence par la requête »). */
  name: string
  words: string[]
  /** Nom + marque, pour la recherche d'un produit OFF par sa marque. */
  brandWords: string[]
}

export interface FoodIndex {
  entries: IndexEntry[]
}

export interface SearchOptions {
  /** Nombre maximal de résultats ; défaut 30. */
  limit?: number
  /** Les favoris passent avant les autres à pertinence égale ; défaut true. */
  favoritesFirst?: boolean
}

/**
 * Note : `CiqualFood.search` est déjà normalisé mais n'est pas réutilisé ici, car l'index porte sur des `Food`
 * (Ciqual surchargé, perso, OFF) qui n'ont pas ce champ et dont le nom peut avoir été modifié.
 */
export function buildFoodIndex(foods: readonly Food[]): FoodIndex {
  return {
    entries: foods.map((food) => {
      const name = normalizeFoodSearch(food.name)
      const words = name === '' ? [] : name.split(' ')
      const brand = food.brand ? normalizeFoodSearch(food.brand) : ''
      return { food, name, words, brandWords: brand === '' ? words : [...words, ...brand.split(' ')] }
    }),
  }
}

/** Un mot de requête d'au moins 5 lettres finissant par s/x est cherché sans cette lettre (« oeufs », « bananes »). */
function queryStem(w: string): string {
  return w.length >= 5 && (w.endsWith('s') || w.endsWith('x')) ? w.slice(0, -1) : w
}

/**
 * Tous les mots de la requête doivent préfixer un mot du nom (ou de la marque), dans n'importe quel ordre.
 * Classement : nom qui commence par la requête, favoris, aliments perso, nom court, ordre alphabétique.
 */
export function searchFoodIndex(index: FoodIndex, query: string, opts: SearchOptions = {}): Food[] {
  const { limit = 30, favoritesFirst = true } = opts
  const q = normalizeFoodSearch(query)
  if (q === '' || limit <= 0) return []
  const stems = q.split(' ').map(queryStem)
  const hits: IndexEntry[] = []
  for (const e of index.entries) {
    let ok = true
    for (const s of stems) {
      let found = false
      for (const w of e.brandWords) {
        if (w.startsWith(s)) {
          found = true
          break
        }
      }
      if (!found) {
        ok = false
        break
      }
    }
    if (ok) hits.push(e)
  }
  const startsWith = (e: IndexEntry): number => (e.name.startsWith(q) ? 0 : 1)
  hits.sort((a, b) => {
    return (
      startsWith(a) - startsWith(b) ||
      (favoritesFirst ? Number(b.food.favorite) - Number(a.food.favorite) : 0) ||
      Number(b.food.source === 'user') - Number(a.food.source === 'user') ||
      a.name.length - b.name.length ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    )
  })
  return hits.slice(0, limit).map((e) => e.food)
}

/** Commodité hors boucle chaude : construit l'index à chaque appel (préférer `buildFoodIndex` + `searchFoodIndex`). */
export function searchFoods(foods: readonly Food[], query: string, opts: SearchOptions = {}): Food[] {
  return searchFoodIndex(buildFoodIndex(foods), query, opts)
}
