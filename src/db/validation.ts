// Règles métier uniques, partagées par la saisie (UI, repositories) et l'import de sauvegarde.
// Fonctions pures : elles renvoient un message français affichable tel quel, ou `null` si tout est valide.
// `today` est toujours fourni par l'appelant.
import { isAllowedCoachUrl } from '../domain/claude/coachUrl'
import { ageOn, isValidLocalDate } from '../domain/shared/dates'
import { FAT_SHARE_RANGE, PROTEIN_PER_KG_RANGE, SURPLUS_RANGE } from '../domain/nutrition/targets'
import type {
  EngineSettings,
  Equipment,
  ExerciseInput,
  FoodInput,
  FoodLogEntry,
  FridgeItem,
  LocalDate,
  NutritionParams,
  Profile,
  Range,
  RecipeInput,
  Session,
  SessionTemplate,
  Settings,
  ShoppingList,
} from '../types'

export const MIN_AGE = 14
export const MAX_AGE = 100
export const MIN_HEIGHT_CM = 100
export const MAX_HEIGHT_CM = 250
export const MIN_WEIGHT_KG = 30
export const MAX_WEIGHT_KG = 250
export const MAX_WEEKLY_SESSIONS = 7

export const MAX_EXERCISE_NAME_LENGTH = 80
export const MIN_REPS = 1
export const MAX_REPS = 100
export const MIN_DURATION_SEC = 5
export const MAX_DURATION_SEC = 600
export const MIN_REST_SEC = 0
export const MAX_REST_SEC = 600
export const MAX_SETUP_LENGTH = 500
export const MAX_PROGRESSION_CRITERIA_LENGTH = 500
export const MAX_TECHNIQUE_LINE_LENGTH = 300
export const MAX_TECHNIQUE_LINES = 12
export const MAX_VIDEO_URL_LENGTH = 2000

const DATE_FORMAT_MSG = 'Date invalide : le format attendu est AAAA-MM-JJ.'

/** Date de naissance (âge entre 14 et 100 ans) et taille (100–250 cm). */
export function checkProfileIdentity(
  p: { birthDate: LocalDate; heightCm: number },
  today: LocalDate,
): string | null {
  if (!isValidLocalDate(p.birthDate)) return 'Date de naissance invalide.'
  if (!isValidLocalDate(today)) return DATE_FORMAT_MSG
  const age = ageOn(p.birthDate, today)
  if (age < MIN_AGE || age > MAX_AGE) {
    return `L’âge doit être compris entre ${MIN_AGE} et ${MAX_AGE} ans.`
  }
  if (!Number.isFinite(p.heightCm) || p.heightCm < MIN_HEIGHT_CM || p.heightCm > MAX_HEIGHT_CM) {
    return `La taille doit être comprise entre ${MIN_HEIGHT_CM} et ${MAX_HEIGHT_CM} cm.`
  }
  return null
}

/** Séances par semaine : entiers, 1 ≤ minimum ≤ cible ≤ 7. */
export function checkWeeklySessions(p: {
  weeklySessionsTarget: number
  weeklySessionsMin: number
}): string | null {
  const { weeklySessionsTarget: t, weeklySessionsMin: m } = p
  if (!Number.isInteger(t) || !Number.isInteger(m) || m < 1 || m > t || t > MAX_WEEKLY_SESSIONS) {
    return `Le nombre de séances par semaine doit être un entier entre 1 et ${MAX_WEEKLY_SESSIONS}, et le minimum ne peut pas dépasser la cible.`
  }
  return null
}

export function checkProfile(p: Profile, today: LocalDate): string | null {
  return checkProfileIdentity(p, today) ?? checkWeeklySessions(p) ?? checkNutritionParams(p.nutrition)
}

/** Kettlebell réglable : valeurs positives, min ≤ max, (max − min) multiple du pas. */
export function checkEquipment(eq: Pick<Equipment, 'kettlebell'>): string | null {
  const { minKg, maxKg, stepKg } = eq.kettlebell
  if (![minKg, maxKg, stepKg].every(Number.isFinite) || minKg <= 0 || maxKg <= 0) {
    return 'Les poids de la kettlebell doivent être des nombres positifs.'
  }
  if (minKg > maxKg) return 'Le poids minimum de la kettlebell ne peut pas dépasser le maximum.'
  if (stepKg <= 0) return 'Le pas de la kettlebell doit être supérieur à 0.'
  const steps = (maxKg - minKg) / stepKg
  if (Math.abs(steps - Math.round(steps)) > 1e-9) {
    return 'L’écart entre le minimum et le maximum doit être un multiple du pas.'
  }
  return null
}

/** Pesée : date valide et non future, poids entre 30 et 250 kg. */
export function checkWeighIn(w: { date: LocalDate; weightKg: number }, today: LocalDate): string | null {
  if (!isValidLocalDate(w.date)) return DATE_FORMAT_MSG
  if (!Number.isFinite(w.weightKg) || w.weightKg < MIN_WEIGHT_KG || w.weightKg > MAX_WEIGHT_KG) {
    return `Le poids doit être compris entre ${MIN_WEIGHT_KG} et ${MAX_WEIGHT_KG} kg.`
  }
  if (w.date > today) return 'La date d’une pesée ne peut pas être dans le futur.'
  return null
}

const MEASURE_KEYS = ['armCm', 'chestCm', 'waistCm', 'thighCm'] as const

/** Bornes plausibles d'une mensuration, en cm. */
export const MIN_MEASUREMENT_CM = 10
export const MAX_MEASUREMENT_CM = 250

/**
 * Mensuration : date valide (pas dans le futur si `today` est fourni), au moins une valeur,
 * toutes les valeurs renseignées entre 10 et 250 cm.
 */
export function checkMeasurement(
  m: { date: LocalDate } & { [K in (typeof MEASURE_KEYS)[number]]?: number | undefined },
  today?: LocalDate,
): string | null {
  if (!isValidLocalDate(m.date)) return DATE_FORMAT_MSG
  if (today !== undefined && m.date > today) return 'La date ne peut pas être dans le futur.'
  let any = false
  for (const key of MEASURE_KEYS) {
    const v = m[key]
    if (v === undefined) continue
    if (!Number.isFinite(v) || v < MIN_MEASUREMENT_CM || v > MAX_MEASUREMENT_CM)
      return `Les mensurations doivent être comprises entre ${MIN_MEASUREMENT_CM} et ${MAX_MEASUREMENT_CM} cm.`
    any = true
  }
  return any ? null : 'Renseigne au moins une mensuration.'
}

/** Lundi valide au format AAAA-MM-JJ (`WeekStart`). */
export function checkWeekStart(d: string): string | null {
  if (!isValidLocalDate(d)) return DATE_FORMAT_MSG
  const [y, m, da] = d.split('-').map(Number) as [number, number, number]
  const t = new Date(Date.UTC(2000, m - 1, da))
  t.setUTCFullYear(y)
  return t.getUTCDay() === 1 ? null : 'La semaine doit commencer un lundi.'
}

/** URL du Projet Claude : `null` ou `https://claude.ai/…` (règle de `isAllowedCoachUrl`). */
export function checkCoachUrl(url: string | null): string | null {
  if (url === null || isAllowedCoachUrl(url)) return null
  return 'L’adresse du coach doit être une URL commençant par https://claude.ai/.'
}

/** Lien externe générique (vidéo d'un exercice) : URL https valide, refus de `javascript:` et autres schémas. */
function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

export function checkSettings(s: Pick<Settings, 'coachUrl'>): string | null {
  return checkCoachUrl(s.coachUrl)
}

/** Réglages du moteur : deload toutes les 3 à 12 semaines, cibles entières 0–30 avec min ≤ max. */
export function checkEngineSettings(e: EngineSettings): string | null {
  if (!Number.isInteger(e.deloadEveryWeeks) || e.deloadEveryWeeks < 3 || e.deloadEveryWeeks > 12)
    return 'La fréquence du deload doit être un nombre entier de semaines entre 3 et 12.'
  for (const r of Object.values(e.volumeTargets)) {
    if (!isIntRange(r, 0, 30))
      return 'Chaque cible doit être un nombre entier de séries entre 0 et 30, minimum ≤ maximum.'
  }
  return null
}

function isIntRange(r: Range | undefined, lo: number, hi: number): boolean {
  if (!r || r.length !== 2) return false
  const [min, max] = r
  return Number.isInteger(min) && Number.isInteger(max) && min >= lo && min <= max && max <= hi
}

/** Exercice (création, modification, import) : message français ou `null`. */
export function checkExercise(input: ExerciseInput): string | null {
  const name = input.name.trim()
  if (name.length === 0) return 'Le nom de l’exercice est obligatoire.'
  if (name.length > MAX_EXERCISE_NAME_LENGTH) {
    return `Le nom ne peut pas dépasser ${MAX_EXERCISE_NAME_LENGTH} caractères.`
  }
  const { primary, secondary } = input.muscles
  if (primary.length === 0) return 'Choisis au moins un muscle principal.'
  if (primary.some((m) => secondary.includes(m))) {
    return 'Un muscle ne peut pas être à la fois principal et secondaire.'
  }
  const hasReps = input.repRange !== undefined
  const hasDuration = input.durationRange !== undefined
  if (hasReps && hasDuration) {
    return 'Choisis une seule cible : des répétitions ou une durée, pas les deux.'
  }
  if (input.loadType === 'timed') {
    if (!hasDuration) return 'Un exercice chronométré doit avoir une durée visée.'
  } else if (input.loadType === 'bodyweight') {
    if (!hasReps) return 'Un exercice au poids du corps doit avoir des répétitions visées.'
  } else if (!hasReps && !hasDuration) {
    return 'Indique une cible : des répétitions ou une durée.'
  }
  if (hasReps && !isIntRange(input.repRange, MIN_REPS, MAX_REPS)) {
    return `Les répétitions visées doivent être des entiers entre ${MIN_REPS} et ${MAX_REPS}, minimum ≤ maximum.`
  }
  if (hasDuration && !isIntRange(input.durationRange, MIN_DURATION_SEC, MAX_DURATION_SEC)) {
    return `La durée visée doit être en secondes entières, entre ${MIN_DURATION_SEC} et ${MAX_DURATION_SEC}, minimum ≤ maximum.`
  }
  if (!Number.isInteger(input.restSec) || input.restSec < MIN_REST_SEC || input.restSec > MAX_REST_SEC) {
    return `Le repos doit être un nombre entier de secondes entre ${MIN_REST_SEC} et ${MAX_REST_SEC}.`
  }
  if (new Set(input.equipment).size !== input.equipment.length) return 'Le matériel contient un doublon.'
  if (input.loadType === 'kettlebell' && !input.equipment.includes('kettlebell')) {
    return 'Un exercice avec charge kettlebell requiert la kettlebell dans le matériel.'
  }
  if (input.videoUrl !== undefined && input.videoUrl.trim().length > MAX_VIDEO_URL_LENGTH) {
    return `Le lien vidéo ne peut pas dépasser ${MAX_VIDEO_URL_LENGTH} caractères.`
  }
  if (input.videoUrl !== undefined && !isHttpsUrl(input.videoUrl)) {
    return 'Le lien vidéo doit être une URL valide commençant par https://.'
  }
  const { steps, cues, mistakes } = input.technique
  if ([...steps, ...cues, ...mistakes].some((t) => t.trim().length === 0)) {
    return 'Les étapes, conseils et erreurs courantes ne peuvent pas contenir de ligne vide.'
  }
  if (input.progressionCriteria.trim().length > MAX_PROGRESSION_CRITERIA_LENGTH) {
    return `Le critère de progression ne peut pas dépasser ${MAX_PROGRESSION_CRITERIA_LENGTH} caractères.`
  }
  if (input.technique.setup.trim().length > MAX_SETUP_LENGTH) {
    return `La mise en place ne peut pas dépasser ${MAX_SETUP_LENGTH} caractères.`
  }
  for (const list of [steps, cues, mistakes]) {
    if (list.length > MAX_TECHNIQUE_LINES) {
      return `Chaque liste (étapes, conseils, erreurs) est limitée à ${MAX_TECHNIQUE_LINES} lignes.`
    }
    if (list.some((t) => t.trim().length > MAX_TECHNIQUE_LINE_LENGTH)) {
      return `Chaque ligne d’étape, conseil ou erreur est limitée à ${MAX_TECHNIQUE_LINE_LENGTH} caractères.`
    }
  }
  return null
}

// ---------- Aliments, journal, objectifs (J5) ----------

export const MAX_FOOD_NAME_LENGTH = 80
export const MAX_FOOD_KCAL_PER_100G = 900
export const MAX_MACRO_PER_100G = 100
export const MAX_PORTION_G = 5000
export const MAX_LOG_GRAMS = 5000
export const MAX_LOG_KCAL = 10000
export const MAX_LOG_MACRO_G = 1000
export const MAX_LOG_NAME_LENGTH = 120
export const MAX_LOG_PORTIONS = 50
/** EAN-8, UPC-A (12) ou EAN-13 : chiffres seuls. */
const EAN_PATTERN = /^(\d{8}|\d{12}|\d{13})$/

/** Aliment (saisie, surcharge Ciqual, import) : nom, valeurs pour 100 g (kcal 0–900, macros 0–100 g), portion. */
export function checkFoodInput(f: FoodInput): string | null {
  const name = f.name.trim()
  if (name.length === 0) return 'Le nom de l’aliment est obligatoire.'
  if (name.length > MAX_FOOD_NAME_LENGTH) {
    return `Le nom ne peut pas dépasser ${MAX_FOOD_NAME_LENGTH} caractères.`
  }
  const { kcal, protein, carbs, fat, fiber } = f.per100g
  if (!Number.isFinite(kcal) || kcal < 0 || kcal > MAX_FOOD_KCAL_PER_100G) {
    return `Les calories pour 100 g doivent être comprises entre 0 et ${MAX_FOOD_KCAL_PER_100G}.`
  }
  const macroOk = (v: number) => Number.isFinite(v) && v >= 0 && v <= MAX_MACRO_PER_100G
  if (![protein, carbs, fat].every(macroOk) || (fiber !== undefined && !macroOk(fiber))) {
    return `Protéines, glucides, lipides et fibres pour 100 g doivent être compris entre 0 et ${MAX_MACRO_PER_100G} g.`
  }
  if (f.defaultPortionG !== undefined) {
    if (!Number.isFinite(f.defaultPortionG) || f.defaultPortionG <= 0 || f.defaultPortionG > MAX_PORTION_G) {
      return `La portion habituelle doit être comprise entre 0 et ${MAX_PORTION_G} g.`
    }
  }
  if (f.ean !== undefined && f.ean.trim() !== '' && !EAN_PATTERN.test(f.ean.trim())) {
    return 'Le code-barres doit contenir 8, 12 ou 13 chiffres.'
  }
  return null
}

/** Entrée du journal : date valide, nom non vide, macros finies ≥ 0, quantité > 0 selon l'origine. */
export function checkLogEntry(e: FoodLogEntry): string | null {
  if (!isValidLocalDate(e.date)) return DATE_FORMAT_MSG
  if (e.name.trim().length === 0) return 'Le nom de l’entrée est obligatoire.'
  if (e.name.trim().length > MAX_LOG_NAME_LENGTH) {
    return `Le nom ne peut pas dépasser ${MAX_LOG_NAME_LENGTH} caractères.`
  }
  const m = e.macros
  if (![m.kcal, m.protein, m.carbs, m.fat].every((v) => Number.isFinite(v) && v >= 0)) {
    return 'Les calories et macros d’une entrée doivent être des nombres positifs ou nuls.'
  }
  if (m.kcal > MAX_LOG_KCAL || [m.protein, m.carbs, m.fat].some((v) => v > MAX_LOG_MACRO_G)) {
    return `Une entrée ne peut pas dépasser ${MAX_LOG_KCAL} kcal ni ${MAX_LOG_MACRO_G} g de macros.`
  }
  const o = e.origin
  if (o.kind === 'food' && (!Number.isFinite(o.grams) || o.grams <= 0 || o.grams > MAX_LOG_GRAMS)) {
    return `La quantité d’un aliment doit être supérieure à 0 g et au plus ${MAX_LOG_GRAMS} g.`
  }
  if (
    o.kind === 'recipe' &&
    (!Number.isFinite(o.portions) || o.portions <= 0 || o.portions > MAX_LOG_PORTIONS)
  ) {
    return `Le nombre de portions doit être supérieur à 0 et au plus ${MAX_LOG_PORTIONS}.`
  }
  return null
}

/** Objectifs nutritionnels : surplus 0,05–0,20, protéines 1,6–2,2 g/kg, lipides 0,20–0,35, ajustement ±1000 kcal. */
export function checkNutritionParams(p: NutritionParams): string | null {
  const outside = (v: number, [min, max]: readonly [number, number]) =>
    !Number.isFinite(v) || v < min || v > max
  const pct = (v: number) => String(Math.round(v * 100))
  const dec = (v: number) => String(v).replace('.', ',')
  if (outside(p.surplus, SURPLUS_RANGE)) {
    return `Le surplus calorique doit être compris entre ${pct(SURPLUS_RANGE[0])} % et ${pct(SURPLUS_RANGE[1])} %.`
  }
  if (outside(p.proteinPerKg, PROTEIN_PER_KG_RANGE)) {
    return `Les protéines doivent être comprises entre ${dec(PROTEIN_PER_KG_RANGE[0])} et ${dec(PROTEIN_PER_KG_RANGE[1])} g par kg.`
  }
  if (outside(p.fatShare, FAT_SHARE_RANGE)) {
    return `La part de lipides doit être comprise entre ${pct(FAT_SHARE_RANGE[0])} % et ${pct(FAT_SHARE_RANGE[1])} % des calories.`
  }
  if (!Number.isFinite(p.kcalAdjustment) || p.kcalAdjustment < -1000 || p.kcalAdjustment > 1000) {
    return 'L’ajustement calorique doit être compris entre −1000 et +1000 kcal.'
  }
  if (p.kcalAdjustedOn !== undefined && !isValidLocalDate(p.kcalAdjustedOn)) return DATE_FORMAT_MSG
  return null
}

// ---------- Séances et modèles (J4) ----------

export const MAX_TEMPLATE_NAME_LENGTH = 60
export const MIN_TEMPLATE_SETS = 1
export const MAX_TEMPLATE_SETS = 10

function isNonNegative(v: number | undefined): boolean {
  return v === undefined || (Number.isFinite(v) && v >= 0)
}

/** Cohérence légère d'une séance (import, écriture) : répétitions, durées, charges et repos finis et ≥ 0. */
export function checkSessionRow(s: Session): string | null {
  if (!isValidLocalDate(s.date)) return DATE_FORMAT_MSG
  if (!isNonNegative(s.estimatedMin)) return 'La durée estimée d’une séance doit être positive ou nulle.'
  for (const block of s.blocks) {
    for (const ex of block.exercises) {
      if (!isNonNegative(ex.restSec)) return 'Le repos d’un exercice doit être positif ou nul.'
      for (const set of ex.sets) {
        if (
          !isNonNegative(set.actualReps) ||
          !isNonNegative(set.actualDurationSec) ||
          !isNonNegative(set.targetDurationSec) ||
          !isNonNegative(set.loadKg)
        ) {
          return 'Les répétitions, durées et charges d’une série doivent être positives ou nulles.'
        }
      }
    }
  }
  const c = s.cursor
  if (c && ![c.block, c.exercise, c.set].every((v) => Number.isInteger(v) && v >= 0)) {
    return 'La position dans la séance est invalide.'
  }
  return null
}

/** Modèle de séance : nom 1–60 caractères, au moins un bloc, séries entières 1–10, repos 0–600 s. */
export function checkTemplate(t: Pick<SessionTemplate, 'name' | 'blocks'>): string | null {
  const name = t.name.trim()
  if (name.length === 0) return 'Le nom du modèle est obligatoire.'
  if (name.length > MAX_TEMPLATE_NAME_LENGTH) {
    return `Le nom ne peut pas dépasser ${MAX_TEMPLATE_NAME_LENGTH} caractères.`
  }
  if (t.blocks.length === 0) return 'Un modèle doit contenir au moins un exercice.'
  for (const b of t.blocks) {
    if (!Number.isInteger(b.sets) || b.sets < MIN_TEMPLATE_SETS || b.sets > MAX_TEMPLATE_SETS) {
      return `Le nombre de séries doit être un entier entre ${MIN_TEMPLATE_SETS} et ${MAX_TEMPLATE_SETS}.`
    }
    if (!Number.isInteger(b.restSec) || b.restSec < MIN_REST_SEC || b.restSec > MAX_REST_SEC) {
      return `Le repos doit être un nombre entier de secondes entre ${MIN_REST_SEC} et ${MAX_REST_SEC}.`
    }
    if (b.reps !== undefined && !isIntRange(b.reps, MIN_REPS, MAX_REPS)) {
      return `Les répétitions doivent être des entiers entre ${MIN_REPS} et ${MAX_REPS}, minimum ≤ maximum.`
    }
    if (
      b.durationSec !== undefined &&
      (!Number.isInteger(b.durationSec) ||
        b.durationSec < MIN_DURATION_SEC ||
        b.durationSec > MAX_DURATION_SEC)
    ) {
      return `La durée doit être en secondes entières, entre ${MIN_DURATION_SEC} et ${MAX_DURATION_SEC}.`
    }
    if (b.loadKg !== undefined && (!Number.isFinite(b.loadKg) || b.loadKg < 0)) {
      return 'La charge doit être positive ou nulle.'
    }
  }
  return null
}

// ---------- Recettes, frigo, courses (J6) ----------

export const MAX_RECIPE_NAME_LENGTH = 120
export const MAX_RECIPE_SERVINGS = 50
export const MAX_RECIPE_MINUTES = 600
export const MIN_FRIDGE_DAYS = 1
export const MAX_FRIDGE_DAYS = 14
export const MAX_INGREDIENT_GRAMS = 10000
export const MAX_FRIDGE_PORTIONS = 1000
export const MAX_SHOPPING_GRAMS = 1000000

/** Recette (saisie, import JSON, import de sauvegarde) : message français ou `null`. */
export function validateRecipeInput(r: RecipeInput): string | null {
  const name = r.name.trim()
  if (name.length === 0) return 'Le nom de la recette est obligatoire.'
  if (name.length > MAX_RECIPE_NAME_LENGTH) {
    return `Le nom ne peut pas dépasser ${MAX_RECIPE_NAME_LENGTH} caractères.`
  }
  if (r.meal.length === 0) return 'Choisis au moins un repas pour la recette.'
  if (!Number.isInteger(r.servings) || r.servings < 1 || r.servings > MAX_RECIPE_SERVINGS) {
    return `Le nombre de portions doit être un entier entre 1 et ${MAX_RECIPE_SERVINGS}.`
  }
  for (const m of [r.prepMinutes, r.cookMinutes]) {
    if (!Number.isFinite(m) || m < 0 || m > MAX_RECIPE_MINUTES) {
      return `Les temps de préparation et de cuisson doivent être compris entre 0 et ${MAX_RECIPE_MINUTES} minutes.`
    }
  }
  if (
    r.fridgeDays !== undefined &&
    (!Number.isInteger(r.fridgeDays) || r.fridgeDays < MIN_FRIDGE_DAYS || r.fridgeDays > MAX_FRIDGE_DAYS)
  ) {
    return `La conservation au frigo doit être comprise entre ${MIN_FRIDGE_DAYS} et ${MAX_FRIDGE_DAYS} jours.`
  }
  if (r.ingredients.length === 0) return 'Ajoute au moins un ingrédient.'
  for (const i of r.ingredients) {
    if (i.name.trim().length === 0) return 'Chaque ingrédient doit avoir un nom.'
    if (!Number.isFinite(i.grams) || i.grams <= 0 || i.grams > MAX_INGREDIENT_GRAMS) {
      return `La quantité d’un ingrédient doit être supérieure à 0 g et au plus ${MAX_INGREDIENT_GRAMS} g.`
    }
    if (i.per100g !== undefined) {
      const { kcal, protein, carbs, fat, fiber } = i.per100g
      const ok = (v: number, max: number) => Number.isFinite(v) && v >= 0 && v <= max
      if (
        !ok(kcal, MAX_FOOD_KCAL_PER_100G) ||
        ![protein, carbs, fat].every((v) => ok(v, MAX_MACRO_PER_100G)) ||
        (fiber !== undefined && !ok(fiber, MAX_MACRO_PER_100G))
      ) {
        return `Les valeurs pour 100 g de « ${i.name.trim()} » sont hors limites.`
      }
    }
  }
  if (r.steps.length === 0) return 'Ajoute au moins une étape.'
  if (r.steps.some((s) => s.trim().length === 0)) return 'Une étape ne peut pas être vide.'
  return null
}

/** Ligne du frigo : dates valides, péremption ≥ préparation, portions restantes > 0 (0 = ligne supprimée). */
export function validateFridgeItem(item: FridgeItem): string | null {
  if (!isValidLocalDate(item.preparedOn) || !isValidLocalDate(item.expiresOn)) return DATE_FORMAT_MSG
  if (item.expiresOn < item.preparedOn) return 'La date de péremption précède la date de préparation.'
  if (
    !Number.isFinite(item.portionsLeft) ||
    item.portionsLeft <= 0 ||
    item.portionsLeft > MAX_FRIDGE_PORTIONS
  ) {
    return `Les portions restantes doivent être supérieures à 0 et au plus ${MAX_FRIDGE_PORTIONS}.`
  }
  return null
}

/** Liste de courses : nom non vide, quantités finies ≥ 0, portions des sources > 0. */
export function validateShoppingList(list: ShoppingList): string | null {
  const name = list.name.trim()
  if (name.length === 0) return 'Le nom de la liste est obligatoire.'
  if (name.length > MAX_RECIPE_NAME_LENGTH) {
    return `Le nom ne peut pas dépasser ${MAX_RECIPE_NAME_LENGTH} caractères.`
  }
  if (list.sources.some((s) => !Number.isFinite(s.portions) || s.portions <= 0)) {
    return 'Le nombre de portions d’une recette de la liste doit être supérieur à 0.'
  }
  const ids = new Set<string>()
  for (const i of list.items) {
    if (i.name.trim().length === 0) return 'Chaque article doit avoir un nom.'
    if (!Number.isFinite(i.grams) || i.grams < 0 || i.grams > MAX_SHOPPING_GRAMS) {
      return 'La quantité d’un article doit être un nombre positif ou nul.'
    }
    if (ids.has(i.id)) return 'Identifiant d’article en double.'
    ids.add(i.id)
  }
  return null
}
