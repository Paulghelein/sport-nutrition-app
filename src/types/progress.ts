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

/**
 * Seuil par défaut d'une « bonne semaine » pour la série (SPEC §8). L'écran passe
 * `min(REGULARITY_WEEK_TARGET, profile.weeklySessionsMin)` : un profil à 2 séances/sem. peut aussi avoir une série.
 */
export const REGULARITY_WEEK_TARGET = 3

export interface Regularity {
  /** 12 semaines, la plus ancienne d'abord, la semaine en cours en dernier (même vide). */
  weeks: WeekActivity[]
  /**
   * Semaines consécutives ≥ seuil (`REGULARITY_WEEK_TARGET` par défaut) séances, en remontant depuis la semaine dernière ; la semaine
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

// ---------- Écran Progrès (J8) ----------

/**
 * Carte du lundi fermée : `Settings.reviewDismissedWeek` = lundi de la semaine évaluée dont la carte a été fermée
 * (entrée de `shouldShowReview`). Absent = jamais fermée.
 */
export type ReviewDismissedWeek = WeekStart

/** Délai après lequel l'export de sauvegarde est rappelé (SPEC §5 : rappel hebdomadaire). */
export const BACKUP_REMINDER_DAYS = 7

/**
 * Rappel de sauvegarde (fonction pure depuis `Settings.lastExportAt` et l'instant courant) :
 * - `never` : aucun export encore fait ;
 * - `due` : dernier export il y a au moins `BACKUP_REMINDER_DAYS` jours ;
 * - `ok` : export récent (pas de rappel).
 */
export interface BackupReminder {
  status: 'never' | 'due' | 'ok'
  /** Jours calendaires depuis le dernier export ; `null` si jamais, ou si la date est illisible ou future (`due`). */
  daysSince: number | null
}

// ---------- Calendrier de régularité (v2, F2) ----------

/**
 * Niveau de séance d'un jour : 0 rien ; 1 < 25 min ; 2 de 25 à 45 min ; 3 > 45 min ; 4 record battu ce jour-là
 * (l'emporte sur la durée). Minutes = somme des `sessionMinutes` des séances `done` du jour.
 */
export type DayTrainingLevel = 0 | 1 | 2 | 3 | 4

/** Tolérance « jour nutrition dans la cible » du calendrier : kcal ET protéines à ±10 % de l'objectif du jour. */
export const CALENDAR_NUTRITION_TOLERANCE = 0.1

export interface DayActivity {
  date: LocalDate
  level: DayTrainingLevel
  /** Séances `done` du jour. */
  sessions: number
  minutes: number
  /** `true` si au moins un record a été battu ce jour-là. */
  record: boolean
  /**
   * Nutrition : `true` kcal ET protéines à ±10 % de l'objectif du jour ; `false` journal non vide hors cible ;
   * `null` rien de logué, objectifs du jour inconnus ou ≤ 0, ou jour futur.
   */
  nutritionOk: boolean | null
  /** Jour postérieur à `today` (case affichée vide, jamais comptée). */
  future: boolean
}
