// Schémas Zod de chaque ligne des 15 tables. Stricts : champ inconnu, type ou valeur d'énumération invalide = rejet.
// Chaque schéma `satisfies z.ZodType<T>` (le type de sortie est assignable à T) ; `AssertSameKeys` vérifie en plus
// à la compilation que les clés de premier niveau sont exactement celles de T (un champ oublié ou en trop échoue).
// Les clés imbriquées ne sont pas comparées. Les règles métier (bornes, âge...) sont dans validation.ts.
import { z } from 'zod'
import { isValidLocalDate } from '../domain/shared/dates'
import { SINGLETON_ID } from '../types'
import type {
  Equipment,
  Exercise,
  ExercisePref,
  ExerciseState,
  Food,
  FoodLogEntry,
  FridgeItem,
  Measurement,
  Profile,
  Recipe,
  Session,
  SessionTemplate,
  Settings,
  ShoppingList,
  TableName,
  TableRows,
  WeighIn,
} from '../types'

const num = z.number()
const str = z.string()
const localDate = z.string().refine(isValidLocalDate, { error: 'date invalide (attendu AAAA-MM-JJ)' })
const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)) && /^\d{4}-\d{2}-\d{2}T/.test(s), {
  error: 'date-heure invalide (attendu ISO 8601)',
})
const id = z.string().min(1)
const singletonId = z.literal(SINGLETON_ID)
const range = z.tuple([num, num])

const macros = { kcal: num, protein: num, carbs: num, fat: num }
const per100g = z.strictObject({ ...macros, fiber: num.optional() })

const aisle = z.enum(['produce', 'butcher', 'fish', 'dairy', 'grocery', 'frozen', 'bakery', 'other'])
const mealSlot = z.enum(['breakfast', 'lunch', 'dinner', 'snack'])
const contentSource = z.enum(['seed', 'user'])
const equipmentId = z.enum(['kettlebell', 'mat', 'pullup_bar', 'bands', 'bench', 'table'])
const trainingLevel = z.union([z.literal(1), z.literal(2), z.literal(3)])
const muscleGroup = z.enum([
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'traps',
  'abs',
  'lower_back',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
])
const feeling = z.enum(['easy', 'ok', 'hard'])
const sessionDuration = z.union([z.literal(20), z.literal(30), z.literal(45), z.literal(60)])

export const profileSchema = z.strictObject({
  id: singletonId,
  name: str.optional(),
  sex: z.enum(['male', 'female']),
  birthDate: localDate,
  heightCm: num,
  activityLevel: z.enum(['sedentary', 'light', 'moderate', 'active']),
  goal: z.enum(['bulk', 'maintain', 'cut']),
  level: trainingLevel,
  weeklySessionsTarget: num,
  weeklySessionsMin: num,
  nutrition: z.strictObject({
    surplus: num,
    proteinPerKg: num,
    fatShare: num,
    kcalAdjustment: num,
    kcalAdjustedOn: localDate.optional(),
  }),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
}) satisfies z.ZodType<Profile>

export const weighInSchema = z.strictObject({
  id,
  date: localDate,
  weightKg: num,
  note: str.optional(),
  createdAt: isoDateTime,
}) satisfies z.ZodType<WeighIn>

export const measurementSchema = z.strictObject({
  id,
  date: localDate,
  armCm: num.optional(),
  chestCm: num.optional(),
  waistCm: num.optional(),
  thighCm: num.optional(),
  note: str.optional(),
  createdAt: isoDateTime,
}) satisfies z.ZodType<Measurement>

export const equipmentSchema = z.strictObject({
  id: singletonId,
  kettlebell: z.strictObject({ minKg: num, maxKg: num, stepKg: num }),
  owned: z.array(equipmentId),
  updatedAt: isoDateTime,
}) satisfies z.ZodType<Equipment>

export const exerciseSchema = z.strictObject({
  id,
  name: str,
  pattern: z.enum(['hinge', 'squat', 'lunge', 'push_h', 'push_v', 'pull', 'core', 'carry', 'arms', 'calves']),
  level: trainingLevel,
  muscles: z.strictObject({ primary: z.array(muscleGroup), secondary: z.array(muscleGroup) }),
  equipment: z.array(equipmentId),
  loadType: z.enum(['kettlebell', 'bodyweight', 'timed']),
  repRange: range.optional(),
  durationRange: range.optional(),
  restSec: num,
  compound: z.boolean(),
  unilateral: z.boolean(),
  loadStepKg: z.union([z.literal(1), z.literal(2)]),
  progressionCriteria: str,
  technique: z.strictObject({
    setup: str,
    steps: z.array(str),
    cues: z.array(str),
    mistakes: z.array(str),
  }),
  illustration: str.optional(),
  videoUrl: str.optional(),
  finisher: z.boolean().optional(),
  learnUnloaded: z.boolean().optional(),
  source: contentSource,
  deleted: z.boolean().optional(),
  updatedAt: isoDateTime,
}) satisfies z.ZodType<Exercise>

export const exercisePrefSchema = z.strictObject({
  exerciseId: id,
  preference: z.enum(['liked', 'neutral', 'disliked', 'hidden']),
  reason: str.optional(),
  updatedAt: isoDateTime,
}) satisfies z.ZodType<ExercisePref>

export const exerciseStateSchema = z.strictObject({
  exerciseId: id,
  loadKg: num.nullable(),
  targetDurationSec: num.positive().optional(),
  recentFeelings: z.array(feeling),
  topStreak: num.int().nonnegative().optional(),
  tempo: z.boolean().optional(),
  lastPerformedOn: localDate.optional(),
  updatedAt: isoDateTime,
}) satisfies z.ZodType<ExerciseState>

const setEntry = z.strictObject({
  targetReps: range.optional(),
  targetDurationSec: num.optional(),
  loadKg: num.optional(),
  plannedLoadKg: num.optional(),
  actualReps: num.optional(),
  actualDurationSec: num.optional(),
  feeling: feeling.optional(),
  status: z.enum(['done', 'skipped']).optional(),
})

export const sessionSchema = z.strictObject({
  id,
  date: localDate,
  durationMin: sessionDuration,
  status: z.enum(['planned', 'in_progress', 'done', 'abandoned']),
  warmup: z.array(str),
  warmupMin: num.optional(),
  blocks: z.array(
    z.strictObject({
      id,
      kind: z.enum(['single', 'superset', 'finisher']),
      exercises: z.array(
        z.strictObject({
          exerciseId: id,
          restSec: num,
          tempo: str.optional(),
          replacedFrom: id.optional(),
          sets: z.array(setEntry),
        }),
      ),
    }),
  ),
  deload: z.boolean(),
  estimatedMin: num,
  templateId: id.optional(),
  startedAt: isoDateTime.optional(),
  endedAt: isoDateTime.optional(),
  cursor: z.strictObject({ block: num, exercise: num, set: num }).optional(),
  restEndsAt: isoDateTime.optional(),
  progressionAppliedAt: isoDateTime.optional(),
  suggestions: z
    .array(
      z.strictObject({
        kind: z.enum(['level_up', 'tempo']),
        exerciseId: id,
        toExerciseId: id.optional(),
        message: str,
        status: z.enum(['pending', 'accepted', 'dismissed']),
      }),
    )
    .optional(),
  notes: str.optional(),
  updatedAt: isoDateTime,
}) satisfies z.ZodType<Session>

export const sessionTemplateSchema = z.strictObject({
  id,
  name: str,
  durationMin: sessionDuration,
  blocks: z.array(
    z.strictObject({
      group: num.optional(),
      kind: z.enum(['single', 'superset', 'finisher']).optional(),
      exerciseId: id,
      sets: num,
      reps: range.optional(),
      durationSec: num.optional(),
      loadKg: num.optional(),
      restSec: num,
    }),
  ),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
}) satisfies z.ZodType<SessionTemplate>

export const foodSchema = z.strictObject({
  id,
  name: str,
  source: z.enum(['ciqual', 'off', 'user']),
  ciqualCode: str.optional(),
  ean: str.optional(),
  brand: str.optional(),
  per100g,
  defaultPortionG: num.optional(),
  aisle: aisle.optional(),
  favorite: z.boolean(),
  lastUsedAt: isoDateTime.optional(),
  updatedAt: isoDateTime,
}) satisfies z.ZodType<Food>

export const recipeSchema = z.strictObject({
  id,
  name: str,
  meal: z.array(mealSlot),
  servings: num,
  prepMinutes: num,
  cookMinutes: num,
  fridgeDays: num.optional(),
  tags: z.array(str),
  ingredients: z.array(
    z.strictObject({
      name: str,
      grams: num,
      foodId: id.optional(),
      ciqualCode: str.optional(),
      aisle,
      per100g: per100g.optional(),
    }),
  ),
  steps: z.array(str),
  source: contentSource,
  deleted: z.boolean().optional(),
  favorite: z.boolean().optional(),
  updatedAt: isoDateTime,
}) satisfies z.ZodType<Recipe>

export const fridgeItemSchema = z.strictObject({
  id,
  recipeId: id,
  portionsLeft: num,
  preparedOn: localDate,
  expiresOn: localDate,
}) satisfies z.ZodType<FridgeItem>

export const foodLogEntrySchema = z.strictObject({
  id,
  date: localDate,
  slot: mealSlot,
  name: str,
  origin: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('food'), foodId: id, grams: num }),
    z.strictObject({
      kind: z.literal('recipe'),
      recipeId: id,
      portions: num,
      fridgeItemId: id.optional(),
    }),
    z.strictObject({ kind: z.literal('free') }),
    z.strictObject({ kind: z.literal('import'), estimated: z.boolean() }),
  ]),
  macros: z.strictObject(macros),
  createdAt: isoDateTime,
}) satisfies z.ZodType<FoodLogEntry>

export const shoppingListSchema = z.strictObject({
  id,
  name: str,
  sources: z.array(z.strictObject({ recipeId: id, portions: num })),
  items: z.array(
    z.strictObject({
      id,
      key: str,
      name: str,
      grams: num,
      aisle,
      foodId: id.optional(),
      checked: z.boolean(),
      manual: z.boolean().optional(),
    }),
  ),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
}) satisfies z.ZodType<ShoppingList>

export const settingsSchema = z.strictObject({
  id: singletonId,
  onboardingCompleted: z.boolean(),
  coachUrl: str.nullable(),
  lastExportAt: isoDateTime.nullable(),
  engine: z.strictObject({
    volumeTargets: z.partialRecord(muscleGroup, range),
    deloadEveryWeeks: num,
  }),
  ciqualVersion: str.optional(),
  reviewDismissedWeek: localDate.optional(),
  updatedAt: isoDateTime,
}) satisfies z.ZodType<Settings>

type AssertSameKeys<T, S extends z.ZodType> = [keyof T] extends [keyof z.input<S>]
  ? [keyof z.input<S>] extends [keyof T]
    ? true
    : never
  : never

// Si une ligne devient `never`, le schéma et le type ne déclarent pas les mêmes clés.
export type SchemaKeyChecks = [
  AssertSameKeys<Profile, typeof profileSchema>,
  AssertSameKeys<WeighIn, typeof weighInSchema>,
  AssertSameKeys<Measurement, typeof measurementSchema>,
  AssertSameKeys<Equipment, typeof equipmentSchema>,
  AssertSameKeys<Exercise, typeof exerciseSchema>,
  AssertSameKeys<ExercisePref, typeof exercisePrefSchema>,
  AssertSameKeys<ExerciseState, typeof exerciseStateSchema>,
  AssertSameKeys<Session, typeof sessionSchema>,
  AssertSameKeys<SessionTemplate, typeof sessionTemplateSchema>,
  AssertSameKeys<Food, typeof foodSchema>,
  AssertSameKeys<Recipe, typeof recipeSchema>,
  AssertSameKeys<FridgeItem, typeof fridgeItemSchema>,
  AssertSameKeys<FoodLogEntry, typeof foodLogEntrySchema>,
  AssertSameKeys<ShoppingList, typeof shoppingListSchema>,
  AssertSameKeys<Settings, typeof settingsSchema>,
]
export const schemaKeyChecks: SchemaKeyChecks = [
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
  true,
]

/** Schéma de ligne par table. */
export const rowSchemas: { [K in TableName]: z.ZodType<TableRows[K]> } = {
  profile: profileSchema,
  weighIns: weighInSchema,
  measurements: measurementSchema,
  equipment: equipmentSchema,
  exercises: exerciseSchema,
  exercisePrefs: exercisePrefSchema,
  exerciseState: exerciseStateSchema,
  sessions: sessionSchema,
  sessionTemplates: sessionTemplateSchema,
  foods: foodSchema,
  recipes: recipeSchema,
  fridge: fridgeItemSchema,
  foodLog: foodLogEntrySchema,
  shoppingLists: shoppingListSchema,
  settings: settingsSchema,
}

/** Clé primaire de chaque table (pour la détection de doublons et le merge). */
export const primaryKeys: { [K in TableName]: keyof TableRows[K] & string } = {
  profile: 'id',
  weighIns: 'id',
  measurements: 'id',
  equipment: 'id',
  exercises: 'id',
  exercisePrefs: 'exerciseId',
  exerciseState: 'exerciseId',
  sessions: 'id',
  sessionTemplates: 'id',
  foods: 'id',
  recipes: 'id',
  fridge: 'id',
  foodLog: 'id',
  shoppingLists: 'id',
  settings: 'id',
}
