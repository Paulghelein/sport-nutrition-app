// État pur de « Recette par scan » (F4) : reducer du brouillon, sérialisation localStorage, petits calculs d'affichage.
// Aucune dépendance au DOM ni à Dexie : tout est testé dans draftState.test.ts.
import {
  MAX_INGREDIENT_GRAMS,
  MAX_RECIPE_NAME_LENGTH,
  MAX_RECIPE_SERVINGS,
  MAX_SERVING_UNIT_LENGTH,
} from '../../domain/nutrition/limits'
import { setIngredientGrams, withWholePackage } from '../../domain/nutrition/scan'
import type { Aisle, MealSlot, ScanIngredient, ScanRecipeDraft } from '../../types'

/** Brouillon + nombre de portions à mettre au frigo (`null` = suit le nombre de portions de la recette). */
export interface RecipeScanState {
  draft: ScanRecipeDraft
  fridge: number | null
}

export const EMPTY_STATE: RecipeScanState = {
  draft: { name: '', servings: 1, servingUnit: '', meal: [], ingredients: [] },
  fridge: null,
}

export type ScanAction =
  | { type: 'add'; ingredient: ScanIngredient }
  | { type: 'set_grams'; key: string; grams: number }
  | { type: 'whole_package'; key: string }
  | { type: 'remove'; key: string }
  | { type: 'set_name'; name: string }
  | { type: 'set_servings'; servings: number }
  | { type: 'set_unit'; unit: string }
  | { type: 'set_fridge'; fridge: number | null }
  | { type: 'clear' }

const clampInt = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, Math.round(n)))

/** Un ingrédient relié au même aliment est déjà dans la liste (même `foodId` ou même code Ciqual). */
export function findIngredient(
  draft: ScanRecipeDraft,
  ref: { foodId?: string; ciqualCode?: string },
): ScanIngredient | undefined {
  return draft.ingredients.find(
    (i) =>
      (ref.foodId !== undefined && i.foodId === ref.foodId) ||
      (ref.ciqualCode !== undefined && i.ciqualCode === ref.ciqualCode),
  )
}

/** Portions à mettre au frigo : la valeur choisie, ramenée dans [0, servings] ; par défaut toutes les portions. */
export function effectiveFridge(state: RecipeScanState): number {
  const n = state.fridge ?? state.draft.servings
  return clampInt(n, 0, state.draft.servings)
}

/**
 * Ajout d'un ingrédient. Doublon (même aliment) : l'état est renvoyé tel quel — l'écran affiche « Déjà dans la
 * liste » plutôt que d'incrémenter en silence (une caméra qui relit le même code ne doit pas doubler la quantité).
 */
export function scanReducer(state: RecipeScanState, action: ScanAction): RecipeScanState {
  const { draft } = state
  const mapIngredients = (key: string, fn: (i: ScanIngredient) => ScanIngredient): RecipeScanState => ({
    ...state,
    draft: { ...draft, ingredients: draft.ingredients.map((i) => (i.key === key ? fn(i) : i)) },
  })
  switch (action.type) {
    case 'add': {
      const ing = action.ingredient
      if (draft.ingredients.some((i) => i.key === ing.key)) return state
      if (findIngredient(draft, ing) !== undefined) return state
      return { ...state, draft: { ...draft, ingredients: [...draft.ingredients, ing] } }
    }
    case 'set_grams':
      return mapIngredients(action.key, (i) => setIngredientGrams(i, action.grams))
    case 'whole_package':
      return mapIngredients(action.key, withWholePackage)
    case 'remove':
      return {
        ...state,
        draft: { ...draft, ingredients: draft.ingredients.filter((i) => i.key !== action.key) },
      }
    case 'set_name':
      return { ...state, draft: { ...draft, name: action.name.slice(0, MAX_RECIPE_NAME_LENGTH) } }
    case 'set_servings':
      return { ...state, draft: { ...draft, servings: clampInt(action.servings, 1, MAX_RECIPE_SERVINGS) } }
    case 'set_unit':
      return { ...state, draft: { ...draft, servingUnit: action.unit.slice(0, MAX_SERVING_UNIT_LENGTH) } }
    case 'set_fridge':
      return {
        ...state,
        fridge: action.fridge === null ? null : clampInt(action.fridge, 0, MAX_RECIPE_SERVINGS),
      }
    case 'clear':
      return EMPTY_STATE
  }
}

/** Rien à conserver : ni nom, ni ingrédient. */
export function isEmptyState(state: RecipeScanState): boolean {
  return state.draft.name.trim() === '' && state.draft.ingredients.length === 0
}

// ---------- Affichage ----------

/** Sous-titre d'une ligne : « scanné · paquet entier », « scanné · 80 g sur 200 g », « Ciqual », « mon aliment ». */
export function ingredientSource(i: ScanIngredient): string {
  if (i.origin === 'ciqual') return 'Ciqual'
  if (i.origin === 'food') return 'mon aliment'
  if (i.wholePackage === true) return 'scanné · paquet entier'
  if (i.packageG !== undefined) return `scanné · ${i.grams} g sur ${i.packageG} g`
  return 'scanné'
}

/** Quantité saisie (« 80 », « 37,5 g ») -> grammes, ou `null` si vide, illisible, ≤ 0 ou au-dessus de la borne. */
export function parseGrams(text: string): number | null {
  const t = text.trim().replace(/\s*g$/i, '').replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return n > 0 && n <= MAX_INGREDIENT_GRAMS ? n : null
}

// ---------- Persistance (localStorage) ----------

/** Clé versionnée : un changement de format incompatible passe à `.v2` (l'ancien brouillon est alors ignoré). */
export const STORAGE_KEY = 'forge.recipeScanDraft.v1'

const AISLES: readonly Aisle[] = [
  'produce',
  'butcher',
  'fish',
  'dairy',
  'grocery',
  'frozen',
  'bakery',
  'other',
]
const MEALS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']
const ORIGINS = ['scan', 'food', 'ciqual'] as const

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
/** Identifiant plausible : non vide, au plus 200 caractères. */
const isId = (v: unknown): v is string => typeof v === 'string' && v !== '' && v.length <= 200
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function parseIngredient(v: unknown): ScanIngredient | null {
  if (!isRecord(v)) return null
  const { key, name, grams, origin, foodId, ciqualCode, aisle, packageG, wholePackage } = v
  if (!isId(key) || !isStr(name) || !isNum(grams) || grams <= 0 || grams > MAX_INGREDIENT_GRAMS) return null
  const o = ORIGINS.find((x) => x === origin)
  const a = AISLES.find((x) => x === aisle)
  if (o === undefined || a === undefined) return null
  const ing: ScanIngredient = { key, name: name.slice(0, MAX_RECIPE_NAME_LENGTH), grams, origin: o, aisle: a }
  if (isId(foodId)) ing.foodId = foodId
  if (isId(ciqualCode)) ing.ciqualCode = ciqualCode
  if (isNum(packageG) && packageG > 0) ing.packageG = packageG
  // Cohérence : l'ingrédient doit être relié à un aliment, et « paquet entier » doit rester vrai.
  if (o === 'ciqual' ? ing.ciqualCode === undefined : ing.foodId === undefined) return null
  if (wholePackage === true && ing.packageG === grams) ing.wholePackage = true
  return ing
}

/** Brouillon -> texte JSON (versionné). */
export function serializeState(state: RecipeScanState): string {
  return JSON.stringify({ v: 1, draft: state.draft, fridge: state.fridge })
}

/**
 * Texte -> état, validé champ par champ. Tolérant : tout ce qui est illisible donne `null` ; un ingrédient invalide
 * est écarté sans perdre les autres ; nombres ramenés dans leurs bornes.
 */
export function parseState(raw: string | null): RecipeScanState | null {
  if (raw === null) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isRecord(data) || data['v'] !== 1 || !isRecord(data['draft'])) return null
  const d = data['draft']
  const list = Array.isArray(d['ingredients']) ? d['ingredients'] : []
  const seen = new Set<string>()
  const ingredients: ScanIngredient[] = []
  for (const item of list) {
    const ing = parseIngredient(item)
    if (ing && !seen.has(ing.key)) {
      seen.add(ing.key)
      ingredients.push(ing)
    }
  }
  const meal = Array.isArray(d['meal']) ? MEALS.filter((m) => (d['meal'] as unknown[]).includes(m)) : []
  const fridge = data['fridge']
  const state: RecipeScanState = {
    draft: {
      name: isStr(d['name']) ? d['name'].slice(0, MAX_RECIPE_NAME_LENGTH) : '',
      servings: isNum(d['servings']) ? clampInt(d['servings'], 1, MAX_RECIPE_SERVINGS) : 1,
      servingUnit: isStr(d['servingUnit']) ? d['servingUnit'].slice(0, MAX_SERVING_UNIT_LENGTH) : '',
      meal,
      ingredients,
    },
    fridge: isNum(fridge) ? clampInt(fridge, 0, MAX_RECIPE_SERVINGS) : null,
  }
  return isEmptyState(state) ? null : state
}

/** Lecture tolérante (stockage indisponible ou refusé = pas de brouillon). */
export function loadState(storage: Pick<Storage, 'getItem'> | undefined = safeStorage()): RecipeScanState {
  try {
    return parseState(storage?.getItem(STORAGE_KEY) ?? null) ?? EMPTY_STATE
  } catch {
    return EMPTY_STATE
  }
}

/** Écrit le brouillon, ou efface la clé s'il est vide. Échecs (quota, navigation privée) ignorés. */
export function saveState(
  state: RecipeScanState,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = safeStorage(),
): void {
  try {
    if (isEmptyState(state)) storage?.removeItem(STORAGE_KEY)
    else storage?.setItem(STORAGE_KEY, serializeState(state))
  } catch {
    // brouillon non conservé : l'écran reste utilisable
  }
}

export function clearStoredState(storage: Pick<Storage, 'removeItem'> | undefined = safeStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY)
  } catch {
    // rien à faire
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}
