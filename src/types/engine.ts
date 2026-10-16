// Contrats du moteur d'entraînement (SPEC §3.2, §3.3) : entrées et sorties des fonctions pures de
// src/domain/training/. Aucune donnée n'est lue ici : tout arrive en paramètre.
import type { LocalDate } from './common'
import type { Equipment, TrainingLevel } from './profile'
import type { EngineSettings } from './settings'
import type {
  ExerciseState,
  LibraryExercise,
  MovementPattern,
  MuscleGroup,
  Session,
  SessionBlock,
  SessionDuration,
} from './training'

/** Séries effectives par groupe (primaire = 1, secondaire = 0,5). Tous les groupes sont présents (0 par défaut). */
export type MuscleVolume = Record<MuscleGroup, number>

/** Niveau atteint par schéma de mouvement (sert au filtrage des exercices et au remplacement). */
export type PatternLevels = Record<MovementPattern, TrainingLevel>

/** Raison d'une semaine allégée (volume × 0,5). */
export type DeloadReason = 'scheduled' | 'fatigue'

export interface DeloadStatus {
  active: boolean
  reason?: DeloadReason
  /** Premier jour du deload en cours (le deload dure 7 jours à partir de cette date). */
  since?: LocalDate
}

/** Entrées de la génération d'une séance. */
export interface EngineInput {
  /** Jour de la séance ; sert aussi de graine (déterminisme). */
  date: LocalDate
  durationMin: SessionDuration
  /** Niveau global de départ (Profile.level). */
  profileLevel: TrainingLevel
  equipment: Equipment
  /** Bibliothèque fusionnée (mergeLibrary) : exercices supprimés déjà exclus, préférences incluses. */
  library: readonly LibraryExercise[]
  states: readonly ExerciseState[]
  /** Historique complet ; seules les séances `done` comptent (volume, fatigue, deload). */
  sessions: readonly Session[]
  settings: EngineSettings
}

/** Séance proposée, avant enregistrement (l'interface ajoute id, statut et horodatages pour créer une `Session`). */
export interface SessionPlan {
  date: LocalDate
  durationMin: SessionDuration
  /** Étapes d'échauffement lisibles (mobilité puis séries légères du premier mouvement). */
  warmup: string[]
  warmupMin: number
  /** Ids de blocs déterministes (`b1`, `b2`, …). */
  blocks: SessionBlock[]
  deload: boolean
  /** Raison du deload quand `deload` est vrai et qu'elle est connue. */
  deloadReason?: DeloadReason
  /** Durée estimée totale, échauffement compris, arrondie à la minute. */
  estimatedMin: number
  /** Groupes visés en priorité (déficit de volume), du plus prioritaire au moins prioritaire. */
  focus: MuscleGroup[]
}

/** Évolution de la charge (ou de la durée visée) décidée après une séance. */
export type LoadChange = 'increase' | 'hold' | 'decrease' | 'none'

/**
 * Proposition faite à l'utilisateur après une séance (jamais appliquée sans son accord) :
 * - `level_up` : critère atteint → variante du niveau supérieur (`toExerciseId`) ;
 * - `tempo` : charge max et haut de fourchette atteints sans variante disponible → tempo 3-1-1.
 */
export interface ProgressionSuggestion {
  kind: 'level_up' | 'tempo'
  exerciseId: string
  toExerciseId?: string
  /** Message en français prêt à afficher. */
  message: string
}

export interface ProgressionOutcome {
  /** Nouvel état à enregistrer. */
  state: ExerciseState
  change: LoadChange
  suggestion?: ProgressionSuggestion
}

// ---------- Accueil « Aujourd'hui » (v2, F1) ----------

/**
 * Titre et raison de la séance du jour (carte « Séance du jour »), produits par `sessionHeadline`
 * (src/domain/training/headline.ts) à partir de la séance générée et du volume des 7 derniers jours.
 * Ex. : `{ title: 'Bas du corps et tirage', reason: 'Les quadriceps et le dos sont en retard sur ta semaine.' }`.
 */
export interface SessionHeadline {
  /** Court (≤ 32 caractères), sans point final, dérivé des schémas de mouvement de la séance. */
  title: string
  /** Une phrase terminée par un point, qui dit pourquoi cette séance aujourd'hui. */
  reason: string
  /** Groupes cités dans la raison (en retard sur leur cible), dans l'ordre de la phrase ; vide sinon. */
  laggingGroups: MuscleGroup[]
}
