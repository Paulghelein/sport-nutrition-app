// Modèle de l'écran Journal : fonction pure (aucun accès à Dexie ni au DOM), testée dans journalModel.test.ts.
import {
  copyMeal,
  dayLog,
  entryVisual,
  kcalSuggestion,
  nutritionTargets,
  progressRatio,
  roundMacros,
  targetWeight,
} from '../../domain/nutrition'
import { addDays, formatDateFr } from '../../domain/shared/dates'
import type {
  DayLog,
  Food,
  FoodLogEntry,
  FoodVisual,
  Id,
  IsoDateTime,
  KcalSuggestion,
  LocalDate,
  Macros,
  MealSlot,
  NutritionTargets,
  Profile,
  WeighIn,
} from '../../types'
import { portionsWord } from '../recipes/format'
import { SLOT_LABEL } from './format'
import { formatDecimal, formatInt } from '../../ui/kit/format'

export interface JournalInput {
  /** Jour affiché et jour courant. */
  date: LocalDate
  today: LocalDate
  /** Entrées du jour affiché et de la veille de ce jour (source de « Copier d'hier »). */
  entries: readonly FoodLogEntry[]
  yesterday: readonly FoodLogEntry[]
  /** Lignes `foods` des aliments référencés par les entrées (absents : pur Ciqual ou supprimé). */
  foods: ReadonlyMap<Id, Food>
  /** Groupe Ciqual par id d'aliment (`ciqual-<code>`), si la table Ciqual est prête. */
  ciqualGroups: ReadonlyMap<Id, string>
  profile: Profile | undefined
  weighIns: readonly WeighIn[]
}

export interface JournalRowModel {
  entry: FoodLogEntry
  /** « 150 g », « 1,5 portion · depuis le frigo », « Saisie libre ». */
  quantity: string
  /** Macros arrondies (kcal entier, grammes au dixième). */
  macros: Macros
  visual: FoodVisual
  /** Nom du bouton : « Modifier Poulet, 183 kcal ». */
  ariaLabel: string
}

export interface JournalMealModel {
  slot: MealSlot
  label: string
  /** Total kcal du repas, arrondi. */
  kcal: number
  rows: JournalRowModel[]
  /** Le même repas de la veille contient des entrées : « Copier d'hier » possible. */
  canCopy: boolean
}

export interface JournalBilan {
  /** Totaux arrondis. */
  totals: Macros
  targets: NutritionTargets | undefined
  /** Part des calories de l'objectif consommée, plafonnée à 1 (0 sans objectif). */
  ratio: number
  /** kcal restantes (≥ 0) ou, si l'objectif est dépassé, `over` > 0. */
  left: number
  over: number
}

export interface JournalModel {
  log: DayLog
  bilan: JournalBilan
  meals: JournalMealModel[]
  suggestion: KcalSuggestion | undefined
  /** Aliments dont la photo est à charger (sans doublon). */
  photoFoodIds: Id[]
}

/** « Aujourd’hui », « Hier », « Demain », sinon date longue. */
export function dayLabel(date: LocalDate, today: LocalDate): string {
  if (date === today) return 'Aujourd’hui'
  if (date === addDays(today, -1)) return 'Hier'
  if (date === addDays(today, 1)) return 'Demain'
  return formatDateFr(date, 'long')
}

/** Libellé de quantité d'une entrée. */
export function entryQuantity(entry: FoodLogEntry, fromFridge: boolean): string {
  const o = entry.origin
  if (o.kind === 'food') return `${formatDecimal(o.grams)} g`
  if (o.kind === 'recipe') {
    const base = `${formatDecimal(o.portions, 2)} ${portionsWord(o.portions)}`
    return fromFridge ? `${base} · depuis le frigo` : base
  }
  return o.kind === 'import' ? 'Importé' : 'Saisie libre'
}

function rowModel(entry: FoodLogEntry, input: JournalInput): JournalRowModel {
  const origin = entry.origin
  const food = origin.kind === 'food' ? input.foods.get(origin.foodId) : undefined
  const ciqualGroup = origin.kind === 'food' ? input.ciqualGroups.get(origin.foodId) : undefined
  const visual = entryVisual(entry, { food, ciqualGroup })
  const macros = roundMacros(entry.macros)
  return {
    entry,
    quantity: entryQuantity(entry, visual.fromFridge),
    macros,
    visual,
    ariaLabel: `Modifier ${entry.name}, ${formatInt(macros.kcal)} kcal`,
  }
}

/** Calcule tout ce que l'écran affiche pour un jour. */
export function buildJournalModel(input: JournalInput): JournalModel {
  const { date, today } = input
  const log = dayLog(input.entries, date)
  const yesterdayLog = dayLog(input.yesterday, addDays(date, -1))

  let targets: NutritionTargets | undefined
  let suggestion: KcalSuggestion | undefined
  if (input.profile) {
    const weight = targetWeight(input.weighIns, date) ?? targetWeight(input.weighIns, today)
    if (weight !== undefined) targets = nutritionTargets(input.profile, weight, date)
    if (date === today) suggestion = kcalSuggestion(input.profile, input.weighIns, today)
  }

  const totals = roundMacros(log.totals)
  const ratio = targets ? Math.min(1, progressRatio(log.totals.kcal, targets.kcal)) : 0
  const diff = targets ? Math.round(targets.kcal - log.totals.kcal) : 0
  const bilan: JournalBilan = {
    totals,
    targets,
    ratio,
    left: Math.max(0, diff),
    over: Math.max(0, -diff),
  }

  const meals = log.meals.map<JournalMealModel>((meal) => ({
    slot: meal.slot,
    label: SLOT_LABEL[meal.slot],
    kcal: Math.round(meal.totals.kcal),
    rows: meal.entries.map((entry) => rowModel(entry, input)),
    canCopy: (yesterdayLog.meals.find((m) => m.slot === meal.slot)?.entries.length ?? 0) > 0,
  }))

  const photoFoodIds = [
    ...new Set(
      meals.flatMap((m) => m.rows.flatMap((r) => (r.visual.photoFoodId ? [r.visual.photoFoodId] : []))),
    ),
  ]

  return {
    log,
    bilan,
    meals,
    suggestion,
    photoFoodIds,
  }
}

/** Copies du repas de la veille vers `date` (vide si la veille n'a rien pour ce repas). */
export function mealCopies(
  input: Pick<JournalInput, 'date' | 'yesterday'>,
  slot: MealSlot,
  ctx: { newId: () => Id; now: IsoDateTime },
): FoodLogEntry[] {
  const source = dayLog(input.yesterday, addDays(input.date, -1)).meals.find((m) => m.slot === slot)
  if (!source || source.entries.length === 0) return []
  return copyMeal(source.entries, input.date, slot, ctx)
}
