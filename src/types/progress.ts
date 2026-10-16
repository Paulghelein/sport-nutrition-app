// Page Progrès (J8, SPEC §8) : contrats des fonctions pures de src/domain/progress/.
// Semaines du lundi au dimanche (dates locales). Seules les séances `done` comptent.
import type { Id, LocalDate, Range } from './common'
import type { MovementPattern, MuscleGroup } from './training'
import type { PersonalRecord } from './guided'
import type { TrainingLevel } from './profile'

/** Lundi de la semaine d'une date. */
export type WeekStart = LocalDate

// ---------- Régularité ----------

export interface WeekActivity {
  weekStart: WeekStart
  sessions: number
  /** Minutes réelles (`actualMinutes`), sinon durée prévue de la séance. */
  minutes: number
}

/** Seuil d'une « bonne semaine » pour la série (SPEC §8). */
export const REGULARITY_WEEK_TARGET = 3

export interface Regularity {
  /** 12 semaines, la plus ancienne d'abord, la semaine en cours en dernier (même vide). */
  weeks: WeekActivity[]
  /**
   * Semaines consécutives ≥ `REGULARITY_WEEK_TARGET` séances, en remontant depuis la semaine dernière ; la semaine
   * en cours s'ajoute si elle a déjà atteint le seuil (sinon elle ne casse pas la série).
   */
  currentStreak: number
  /** Meilleure série sur tout l'historique. */
  bestStreak: number
  /** Minutes totales sur les 12 semaines. */
  totalMinutes: number
}

// ---------- Force ----------

/** Meilleure performance d'un exercice dans une séance `done` (séries faites seulement). */
export interface StrengthPoint {
  date: LocalDate
  sessionId: Id
  /** Charge la plus lourde (absente au poids du corps). */
  topLoadKg?: number
  /** Reps max en une série à `topLoadKg` (exercices en répétitions). */
  bestReps?: number
  /** Durée max en une série (exercices en durée). */
  bestDurationSec?: number
  /** Somme charge × reps (0 au poids du corps ou en durée). */
  tonnageKg: number
}

export interface RecordValue {
  value: number
  date: LocalDate
  /** Charge associée pour les records de reps / durée. */
  loadKg?: number
}

export interface ExerciseRecords {
  load?: RecordValue
  reps?: RecordValue
  duration?: RecordValue
  tonnage?: RecordValue
}

export interface ExerciseStrength {
  exerciseId: Id
  /** Un point par séance, dans l'ordre chronologique. */
  points: StrengthPoint[]
  records: ExerciseRecords
  lastPerformedOn: LocalDate
}

/** Niveau atteint par schéma de mouvement (même règle que le moteur : max(profil, plus haut niveau ayant un état)). */
export type PatternLevelView = Record<MovementPattern, TrainingLevel>

// ---------- Volume ----------

export type VolumeStatus = 'below' | 'within' | 'above' | 'untracked'

export interface GroupVolume {
  group: MuscleGroup
  /** Séries effectives sur 7 jours (primaire 1, secondaire 0,5). */
  sets: number
  target: Range
  /** `untracked` : cible `[0, 0]` (groupe compté pour la fatigue seulement). */
  status: VolumeStatus
}

// ---------- Nutrition ----------

/** Tolérance « jour dans la cible » : kcal à ±10 % de l'objectif (SPEC §8). */
export const NUTRITION_DAY_TOLERANCE = 0.1

export interface NutritionWeek {
  from: LocalDate
  to: LocalDate
  /** Jours ayant au moins une entrée au journal (seuls ceux-là entrent dans les moyennes). */
  daysLogged: number
  avgKcal: number | null
  avgProtein: number | null
  targetKcal: number
  targetProtein: number
  /** Jours logués dont les kcal sont à ±10 % de l'objectif. */
  daysInTarget: number
}

// ---------- Bilan hebdomadaire (carte du lundi) ----------

/**
 * Règle qui a produit la suggestion, par priorité décroissante (une seule suggestion) :
 * `no_data` (rien de logué ni fait) → `few_sessions` (< séances/semaine du profil) → `low_protein`
 * (moyenne < 90 % de l'objectif) → `weight_stalled` (objectif bulk et proposition `kcalSuggestion` active : mêmes
 * règles que SPEC §4.1, 21 jours de stagnation, jamais juste après un ajustement accepté) → `weight_too_fast`
 * (bulk, > +0,5 % du poids/sem. en moyenne sur 14 jours, ≥ 3 pesées) → `low_kcal` (moyenne < 90 %) → `volume_gap`
 * (un grand groupe sous sa cible) → `all_good`.
 */
export type ReviewRule =
  | 'no_data'
  | 'few_sessions'
  | 'low_protein'
  | 'weight_stalled'
  | 'weight_too_fast'
  | 'low_kcal'
  | 'volume_gap'
  | 'all_good'

export interface ReviewSuggestion {
  rule: ReviewRule
  /** Phrase courte en français, tutoiement. */
  message: string
}

export interface WeeklyReview {
  /** Lundi de la semaine écoulée (la carte s'affiche à partir du lundi suivant). */
  weekStart: WeekStart
  sessions: number
  plannedSessions: number
  minutes: number
  /** Records battus pendant la semaine. */
  records: PersonalRecord[]
  /** Variation de la moyenne mobile 7 j entre le début et la fin de la semaine ; `null` si pesées insuffisantes. */
  weightChangeKg: number | null
  nutrition: NutritionWeek
  suggestion: ReviewSuggestion
}
