// Profil, pesées, mensurations, matériel (SPEC §2, §8).
import type { Id, IsoDateTime, LocalDate, SingletonId } from './common'

export type Sex = 'male' | 'female'

/** `bulk` = prise de masse (défaut), `maintain` = maintien, `cut` = sèche. */
export type Goal = 'bulk' | 'maintain' | 'cut'

/** Facteur d'activité du TDEE (SPEC §4.1) : 1,2 / 1,375 / 1,55 / 1,725. */
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active'

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
}

/** 1 = débutant, 2 = intermédiaire, 3 = avancé. */
export type TrainingLevel = 1 | 2 | 3

/** Paramètres réglables du calcul des objectifs nutritionnels (SPEC §4.1). */
export interface NutritionParams {
  /** Surplus calorique en fraction du TDEE ; défaut 0,12, bornes 0,05–0,20. */
  surplus: number
  /** Protéines en g/kg de poids ; défaut 1,8, bornes 1,6–2,2. */
  proteinPerKg: number
  /** Part des kcal en lipides ; défaut 0,27. */
  fatShare: number
  /** Ajustement manuel cumulé en kcal (ex. +150 après stagnation acceptée) ; défaut 0. */
  kcalAdjustment: number
  /** Jour du dernier ajustement accepté (bloque une nouvelle proposition pendant 21 jours). */
  kcalAdjustedOn?: LocalDate
}

export interface Profile {
  id: SingletonId
  /** Prénom ou surnom, optionnel (affichage uniquement). */
  name?: string
  sex: Sex
  /** L'âge est calculé à partir de la date de naissance à la date du calcul. */
  birthDate: LocalDate
  heightCm: number
  activityLevel: ActivityLevel
  goal: Goal
  /** Niveau global de départ ; le niveau réel est réévalué par mouvement (ExerciseState). */
  level: TrainingLevel
  /** Séances par semaine visées ; défaut 5. */
  weeklySessionsTarget: number
  /** Minimum acceptable ; défaut 3. */
  weeklySessionsMin: number
  nutrition: NutritionParams
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}

/** Une pesée par jour au plus : en ajouter une à une date existante la remplace. */
export interface WeighIn {
  id: Id
  date: LocalDate
  weightKg: number
  note?: string
  createdAt: IsoDateTime
}

/** Mensurations optionnelles en cm (SPEC §8). Au moins une valeur renseignée. */
export interface Measurement {
  id: Id
  date: LocalDate
  armCm?: number
  chestCm?: number
  waistCm?: number
  thighCm?: number
  note?: string
  createdAt: IsoDateTime
}

/**
 * Matériel possédé. Sert aussi à `Exercise.equipment` : un exercice n'est disponible que si
 * tout son matériel est possédé. `kettlebell` est toujours possédé (réglable, voir `Equipment.kettlebell`).
 * `bench` = chaise ou banc ; `table` = table solide (rowing australien).
 */
export type EquipmentId = 'kettlebell' | 'mat' | 'pullup_bar' | 'bands' | 'bench' | 'table'

export interface KettlebellSpec {
  /** Défauts : 12, 24, 1. */
  minKg: number
  maxKg: number
  stepKg: number
}

export interface Equipment {
  id: SingletonId
  kettlebell: KettlebellSpec
  /** Matériel possédé en plus de la kettlebell ; défaut `['mat']`. */
  owned: EquipmentId[]
  updatedAt: IsoDateTime
}
