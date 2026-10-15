// Journal alimentaire (SPEC §4.2) : macros figées au log, totaux, copie, récents, favoris. Fonctions pures :
// identifiants et horodatages sont fournis par l'appelant.
import type { Id, IsoDateTime, LocalDate } from '../../types/common'
import type {
  DayLog,
  Food,
  FoodLogEntry,
  FreeEntryInput,
  Macros,
  MealSlot,
  MealTotals,
  Per100g,
  QuickItem,
} from '../../types/nutrition'
import { normalizeFoodSearch } from './search'

export const MEAL_SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']

export interface LogContext {
  id: Id
  now: IsoDateTime
}

export const ZERO_MACROS: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

/** Macros pour `grams` g d'un aliment dont les valeurs sont données pour 100 g (non arrondi). */
export function macrosFor(per100g: Per100g, grams: number): Macros {
  const k = grams / 100
  return {
    kcal: per100g.kcal * k,
    protein: per100g.protein * k,
    carbs: per100g.carbs * k,
    fat: per100g.fat * k,
  }
}

export function sumMacros(list: readonly Macros[]): Macros {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  for (const m of list) {
    t.kcal += m.kcal
    t.protein += m.protein
    t.carbs += m.carbs
    t.fat += m.fat
  }
  return t
}

export function foodLogEntry(
  food: Food,
  grams: number,
  slot: MealSlot,
  date: LocalDate,
  { id, now }: LogContext,
): FoodLogEntry {
  return {
    id,
    date,
    slot,
    name: food.name,
    origin: { kind: 'food', foodId: food.id, grams },
    macros: macrosFor(food.per100g, grams),
    createdAt: now,
  }
}

export function freeLogEntry(
  input: FreeEntryInput,
  slot: MealSlot,
  date: LocalDate,
  { id, now }: LogContext,
): FoodLogEntry {
  return {
    id,
    date,
    slot,
    name: input.name.trim(),
    origin: { kind: 'free' },
    macros: { kcal: input.kcal, protein: input.protein ?? 0, carbs: input.carbs ?? 0, fat: input.fat ?? 0 },
    createdAt: now,
  }
}

/** Journal d'un jour : toujours les 4 repas dans l'ordre, entrées triées par `createdAt` (stable). */
export function dayLog(entries: readonly FoodLogEntry[], date: LocalDate): DayLog {
  const ofDay = entries.filter((e) => e.date === date)
  const meals: MealTotals[] = MEAL_SLOTS.map((slot) => {
    const list = ofDay
      .filter((e) => e.slot === slot)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    return { slot, entries: list, totals: sumMacros(list.map((e) => e.macros)) }
  })
  return { date, meals, totals: sumMacros(meals.map((m) => m.totals)) }
}

/**
 * Copie des entrées d'un repas vers un autre jour / repas : macros et origine conservées (figées), nouvel id et
 * `createdAt` (now + 1 ms par entrée pour garder l'ordre). `fridgeItemId` est retiré : la copie ne décrémente
 * pas le frigo une seconde fois.
 */
export function copyMeal(
  entries: readonly FoodLogEntry[],
  toDate: LocalDate,
  toSlot: MealSlot,
  { newId, now }: { newId: () => Id; now: IsoDateTime },
): FoodLogEntry[] {
  const t0 = Date.parse(now)
  return [...entries]
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    .map((e, i) => {
      let origin = e.origin
      if (origin.kind === 'recipe' && origin.fridgeItemId !== undefined) {
        const { fridgeItemId: _omit, ...rest } = origin
        void _omit
        origin = rest
      }
      return {
        ...e,
        id: newId(),
        date: toDate,
        slot: toSlot,
        origin: { ...origin },
        macros: { ...e.macros },
        createdAt: Number.isNaN(t0) ? now : new Date(t0 + i).toISOString(),
      }
    })
}

/**
 * Récents : plus récents d'abord, dédoublonnés. Aliment : par `foodId`, dernière quantité utilisée (aliment inconnu
 * de `foodsById`, p. ex. supprimé : ignoré). Saisie libre / import : par nom normalisé, macros de la dernière.
 * Les recettes sont ignorées.
 */
export function recentItems(
  log: readonly FoodLogEntry[],
  foodsById: ReadonlyMap<Id, Food>,
  limit: number,
): QuickItem[] {
  const sorted = log
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.createdAt < b.e.createdAt ? 1 : a.e.createdAt > b.e.createdAt ? -1 : b.i - a.i))
  const seen = new Set<string>()
  const out: QuickItem[] = []
  for (const { e } of sorted) {
    if (out.length >= limit) break
    const o = e.origin
    if (o.kind === 'food') {
      const key = `food:${o.foodId}`
      const food = foodsById.get(o.foodId)
      if (seen.has(key) || !food) continue
      seen.add(key)
      out.push({ kind: 'food', key, food, grams: o.grams })
    } else if (o.kind === 'free' || o.kind === 'import') {
      const key = `free:${normalizeFoodSearch(e.name)}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ kind: 'free', key, name: e.name, macros: { ...e.macros } })
    }
  }
  return out
}

/** Favoris, par nom ; portion = portion habituelle ou 100 g. */
export function favoriteItems(foods: readonly Food[]): QuickItem[] {
  return foods
    .filter((f) => f.favorite)
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    .map((food) => ({ kind: 'food', key: `food:${food.id}`, food, grams: food.defaultPortionG ?? 100 }))
}

/**
 * Corrige la quantité d'une entrée « aliment » en mettant à l'échelle ses macros figées (jamais recalculées depuis
 * l'aliment, qui a pu être modifié depuis le log). Quantité invalide ou autre origine : `RangeError`.
 */
export function regrams(entry: FoodLogEntry, grams: number): FoodLogEntry {
  if (!(grams > 0) || !Number.isFinite(grams)) throw new RangeError(`Quantité invalide : ${grams}`)
  if (entry.origin.kind !== 'food')
    throw new RangeError("Seule une entrée d'aliment a une quantité en grammes")
  const k = grams / entry.origin.grams
  const m = entry.macros
  return {
    ...entry,
    origin: { ...entry.origin, grams },
    macros: { kcal: m.kcal * k, protein: m.protein * k, carbs: m.carbs * k, fat: m.fat * k },
  }
}

/** Arrondis d'affichage : kcal à l'unité, macros au dixième. */
export function roundMacros(m: Macros): Macros {
  const r1 = (n: number): number => Math.round(n * 10) / 10
  return { kcal: Math.round(m.kcal), protein: r1(m.protein), carbs: r1(m.carbs), fat: r1(m.fat) }
}

/** value / target, non plafonné (> 1 = dépassement) ; cible nulle ou invalide → 0. */
export function progressRatio(value: number, target: number): number {
  return target > 0 && Number.isFinite(target) ? value / target : 0
}
