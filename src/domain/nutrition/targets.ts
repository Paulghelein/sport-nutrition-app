// Objectifs nutritionnels (SPEC §4.1). Calculs internes non arrondis ; seul le résultat final est arrondi à l'entier.
import type { LocalDate } from '../../types/common'
import { ACTIVITY_FACTORS, type Profile, type WeighIn } from '../../types/profile'
import type { KcalSuggestion, NutritionTargets } from '../../types/nutrition'
import { addDays, ageOn, daysBetween } from '../shared/dates'
import { movingAverage7d } from '../progress/weight'

/** Bornes réglables des objectifs (SPEC §4.1) ; la validation des réglages (src/db/validation.ts) doit s'y brancher. */
export const SURPLUS_RANGE = [0.05, 0.2] as const
export const PROTEIN_PER_KG_RANGE = [1.6, 2.2] as const
export const FAT_SHARE_RANGE = [0.2, 0.35] as const

export type TargetsProfile = Pick<
  Profile,
  'sex' | 'birthDate' | 'heightCm' | 'activityLevel' | 'goal' | 'nutrition'
>

/** Mifflin-St Jeor : 10·P + 6,25·T − 5·A + 5 (homme) ou − 161 (femme). */
export function bmrMifflin(
  sex: Profile['sex'],
  weightKg: number,
  heightCm: number,
  ageYears: number,
): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === 'male' ? 5 : -161)
}

/**
 * Objectifs du jour.
 *
 * Exemple vérifié à la main : homme, 75 kg, 180 cm, 25 ans, activité modérée (1,55), prise de masse, surplus 0,12,
 * 1,8 g/kg, lipides 27 %, ajustement 0 :
 *   BMR   = 750 + 1125 − 125 + 5        = 1755
 *   TDEE  = 1755 × 1,55                 = 2720,25
 *   kcal  = 2720,25 × 1,12              = 3046,68  -> 3047
 *   prot. = 1,8 × 75                    = 135 g
 *   lip.  = 0,27 × 3046,68 / 9          = 91,40 g  -> 91
 *   gluc. = (3046,68 − 4·135 − 9·91,40) / 4 = (3046,68 − 540 − 822,60) / 4 = 421,02 g -> 421
 */
export function nutritionTargets(profile: TargetsProfile, weightKg: number, on: LocalDate): NutritionTargets {
  const p = profile.nutrition
  const ageYears = ageOn(profile.birthDate, on)
  const bmr = bmrMifflin(profile.sex, weightKg, profile.heightCm, ageYears)
  const tdee = bmr * ACTIVITY_FACTORS[profile.activityLevel]
  const base =
    profile.goal === 'bulk' ? tdee * (1 + p.surplus) : profile.goal === 'cut' ? tdee * (1 - p.surplus) : tdee
  const kcal = base + p.kcalAdjustment
  const protein = p.proteinPerKg * weightKg
  const fat = (p.fatShare * kcal) / 9
  const carbs = Math.max(0, (kcal - 4 * protein - 9 * fat) / 4)
  return {
    kcal: Math.round(kcal),
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    weightKg,
    ageYears,
  }
}

/** Poids de référence : moyenne mobile 7 jours, sinon dernière pesée jusqu'à `on`, sinon `undefined`. */
export function targetWeight(weighIns: readonly WeighIn[], on: LocalDate): number | undefined {
  const avg = movingAverage7d(weighIns as WeighIn[], on)
  if (avg !== null) return avg
  let latest: WeighIn | undefined
  for (const w of weighIns) {
    if (w.date <= on && (latest === undefined || w.date >= latest.date)) latest = w
  }
  return latest?.weightKg
}

export const STAGNATION_DAYS = 21
export const STAGNATION_THRESHOLD_KG = 0.1
export const STAGNATION_KCAL_STEP = 150
/** Pesées minimales dans chacune des deux fenêtres de 7 jours comparées (données suffisantes). */
/** Borne de validation de `kcalAdjustment` (couche données) : au-delà, rien n'est proposé. */
export const MAX_KCAL_ADJUSTMENT = 1000
export const STAGNATION_MIN_WEIGHINS = 3

function countInWindow(weighIns: readonly WeighIn[], on: LocalDate): number {
  const from = addDays(on, -6)
  let n = 0
  for (const w of weighIns) if (w.date >= from && w.date <= on) n++
  return n
}

const fmtKg = (n: number): string => {
  const r = Math.round(n * 10) / 10
  const s = (r === 0 ? 0 : r).toFixed(1).replace('.', ',')
  return r > 0 ? `+${s}` : s
}

/**
 * Proposition +150 kcal (SPEC §4.1) si : objectif prise de masse, moyenne 7 j à `on` et 21 jours plus tôt connues
 * avec au moins 3 pesées chacune, variation < +0,1 kg, et dernier ajustement accepté il y a au moins 21 jours.
 */
export function kcalSuggestion(
  profile: Pick<Profile, 'goal' | 'nutrition'>,
  weighIns: readonly WeighIn[],
  on: LocalDate,
): KcalSuggestion | undefined {
  if (profile.goal !== 'bulk') return undefined
  if (profile.nutrition.kcalAdjustment + STAGNATION_KCAL_STEP > MAX_KCAL_ADJUSTMENT) return undefined
  const last = profile.nutrition.kcalAdjustedOn
  if (last !== undefined && daysBetween(last, on) < STAGNATION_DAYS) return undefined
  const before = addDays(on, -STAGNATION_DAYS)
  const list = weighIns as WeighIn[]
  if (countInWindow(list, on) < STAGNATION_MIN_WEIGHINS) return undefined
  if (countInWindow(list, before) < STAGNATION_MIN_WEIGHINS) return undefined
  const now = movingAverage7d(list, on)
  const then = movingAverage7d(list, before)
  if (now === null || then === null) return undefined
  const changeKg = now - then
  if (changeKg >= STAGNATION_THRESHOLD_KG) return undefined
  return {
    kcal: STAGNATION_KCAL_STEP,
    changeKg,
    days: STAGNATION_DAYS,
    message: `Ta moyenne sur 7 jours a varié de ${fmtKg(changeKg)} kg en ${STAGNATION_DAYS} jours alors que tu vises la prise de masse. Ajouter ${STAGNATION_KCAL_STEP} kcal par jour ?`,
  }
}
