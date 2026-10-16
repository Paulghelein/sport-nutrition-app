// Brouillon du formulaire de recette : les nombres restent du texte tant que l'utilisateur tape.
// Aucune règle métier ici : la validation est faite par `validateRecipeInput` (src/db).
import type { Aisle, MealSlot, Per100g, RecipeInput, RecipeIngredient } from '../../types'
import { parseDecimal, toInputNumber } from '../../ui'

export interface IngredientDraft {
  /** Clé stable pour React (la saisie ne saute pas quand on supprime ou déplace une ligne). */
  key: string
  name: string
  grams: string
  aisle: Aisle
  foodId?: string
  ciqualCode?: string
  /** Valeurs pour 100 g saisies à la main (texte). */
  values?: { kcal: string; protein: string; carbs: string; fat: string }
}

export interface RecipeDraft {
  name: string
  meal: MealSlot[]
  servings: string
  prepMinutes: string
  cookMinutes: string
  /** Vide = durée par défaut. */
  fridgeDays: string
  /** Séparés par des virgules. */
  tags: string
  ingredients: IngredientDraft[]
  steps: string[]
}

export function newIngredientDraft(): IngredientDraft {
  return { key: crypto.randomUUID(), name: '', grams: '', aisle: 'other' }
}

function valuesToDraft(p: Per100g): NonNullable<IngredientDraft['values']> {
  return {
    kcal: toInputNumber(p.kcal),
    protein: toInputNumber(p.protein),
    carbs: toInputNumber(p.carbs),
    fat: toInputNumber(p.fat),
  }
}

export function recipeToDraft(input: RecipeInput): RecipeDraft {
  return {
    name: input.name,
    meal: [...input.meal],
    servings: String(input.servings),
    prepMinutes: String(input.prepMinutes),
    cookMinutes: String(input.cookMinutes),
    fridgeDays: input.fridgeDays !== undefined ? String(input.fridgeDays) : '',
    tags: input.tags.join(', '),
    ingredients: input.ingredients.map((i) => ({
      key: crypto.randomUUID(),
      name: i.name,
      grams: toInputNumber(i.grams),
      aisle: i.aisle,
      ...(i.foodId !== undefined ? { foodId: i.foodId } : {}),
      ...(i.ciqualCode !== undefined ? { ciqualCode: i.ciqualCode } : {}),
      ...(i.per100g !== undefined ? { values: valuesToDraft(i.per100g) } : {}),
    })),
    steps: [...input.steps],
  }
}

/** Minutes : vide = 0. Tout le reste illisible donne NaN, refusé par la validation avec un message. */
function minutes(text: string): number {
  return text.trim() === '' ? 0 : parseDecimal(text)
}

/** Valeur nutritionnelle : vide = 0. */
function value(text: string): number {
  return text.trim() === '' ? 0 : parseDecimal(text)
}

export function draftToInput(draft: RecipeDraft): RecipeInput {
  const input: RecipeInput = {
    name: draft.name,
    meal: [...draft.meal],
    servings: parseDecimal(draft.servings),
    prepMinutes: minutes(draft.prepMinutes),
    cookMinutes: minutes(draft.cookMinutes),
    tags: draft.tags
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t !== ''),
    ingredients: draft.ingredients.map((i): RecipeIngredient => {
      const out: RecipeIngredient = { name: i.name, grams: parseDecimal(i.grams), aisle: i.aisle }
      if (i.foodId !== undefined) out.foodId = i.foodId
      if (i.ciqualCode !== undefined) out.ciqualCode = i.ciqualCode
      if (i.values !== undefined) {
        out.per100g = {
          kcal: value(i.values.kcal),
          protein: value(i.values.protein),
          carbs: value(i.values.carbs),
          fat: value(i.values.fat),
        }
      }
      return out
    }),
    steps: draft.steps.map((s) => s),
  }
  if (draft.fridgeDays.trim() !== '') input.fridgeDays = parseDecimal(draft.fridgeDays)
  return input
}

const KEY_PREFIX = 'recipe-draft:'

function isDraft(v: unknown): v is RecipeDraft {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o['name'] === 'string' &&
    Array.isArray(o['meal']) &&
    typeof o['servings'] === 'string' &&
    typeof o['prepMinutes'] === 'string' &&
    typeof o['cookMinutes'] === 'string' &&
    typeof o['fridgeDays'] === 'string' &&
    typeof o['tags'] === 'string' &&
    Array.isArray(o['ingredients']) &&
    o['ingredients'].every(isIngredientDraft) &&
    Array.isArray(o['steps']) &&
    o['steps'].every((s) => typeof s === 'string') &&
    o['meal'].every((m) => typeof m === 'string')
  )
}

function isIngredientDraft(v: unknown): v is IngredientDraft {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  const values = o['values']
  return (
    typeof o['key'] === 'string' &&
    typeof o['name'] === 'string' &&
    typeof o['grams'] === 'string' &&
    typeof o['aisle'] === 'string' &&
    (o['foodId'] === undefined || typeof o['foodId'] === 'string') &&
    (o['ciqualCode'] === undefined || typeof o['ciqualCode'] === 'string') &&
    (values === undefined ||
      (typeof values === 'object' &&
        values !== null &&
        ['kcal', 'protein', 'carbs', 'fat'].every(
          (k) => typeof (values as Record<string, unknown>)[k] === 'string',
        )))
  )
}

/** Brouillon de ce formulaire (`'new'` ou id de la recette), ou `null`. Vit le temps de la session de l'app. */
export function loadRecipeDraft(key: string): RecipeDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + key)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    return isDraft(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveRecipeDraft(key: string, draft: RecipeDraft): void {
  try {
    sessionStorage.setItem(KEY_PREFIX + key, JSON.stringify(draft))
  } catch {
    // Stockage indisponible : le brouillon n'est simplement pas conservé.
  }
}

export function clearRecipeDraft(key: string): void {
  try {
    sessionStorage.removeItem(KEY_PREFIX + key)
  } catch {
    // Rien à faire.
  }
}
