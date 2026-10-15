// Exercices, préférences, état de progression, séances et modèles (SPEC §3).
// Les champs du moteur (ExerciseState, Session) seront affinés par le chef en J3/J4 si besoin.
import type { ContentSource, Id, IsoDateTime, LocalDate, Range } from './common'
import type { EquipmentId, TrainingLevel } from './profile'

export type MovementPattern =
  | 'hinge'
  | 'squat'
  | 'lunge'
  | 'push_h'
  | 'push_v'
  | 'pull'
  | 'core'
  | 'carry'
  | 'arms'
  | 'calves'

/** Groupes musculaires suivis par le calcul de volume. Libellés français dans l'UI. */
export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'traps'
  | 'abs'
  | 'lower_back'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'calves'

export type LoadType = 'kettlebell' | 'bodyweight' | 'timed'

export interface Technique {
  setup: string
  steps: string[]
  cues: string[]
  mistakes: string[]
}

export interface Exercise {
  /** Id lisible et stable pour le contenu de départ (ex. `goblet-squat`), UUID pour l'utilisateur. */
  id: Id
  name: string
  pattern: MovementPattern
  level: TrainingLevel
  muscles: { primary: MuscleGroup[]; secondary: MuscleGroup[] }
  /** Matériel requis (vide = aucun). */
  equipment: EquipmentId[]
  loadType: LoadType
  /** Répétitions visées ; requis sauf si `loadType === 'timed'`. */
  repRange?: Range
  /** Durée visée en secondes ; requis si `loadType === 'timed'`. */
  durationRange?: Range
  restSec: number
  compound: boolean
  unilateral: boolean
  /** Palier de hausse de charge : 1 kg (push/pull/arms), 2 kg (hinge/squat/lunge). */
  loadStepKg: 1 | 2
  /** Critère lisible de passage au niveau supérieur (ex. « 3 × 15 propres »). */
  progressionCriteria: string
  technique: Technique
  /** Id de l'illustration SVG dans src/content/ ; absent pour un exercice personnel sans dessin. */
  illustration?: string
  /** Lien vidéo saisi par l'utilisateur. */
  videoUrl?: string
  source: ContentSource
  /** Surcharge d'un exercice de départ supprimé par l'utilisateur (masqué partout). */
  deleted?: boolean
  updatedAt: IsoDateTime
}

export type ExercisePreference = 'liked' | 'neutral' | 'disliked' | 'hidden'

export interface ExercisePref {
  /** Clé primaire. */
  exerciseId: Id
  preference: ExercisePreference
  reason?: string
  updatedAt: IsoDateTime
}

export type Feeling = 'easy' | 'ok' | 'hard'

/** État de progression d'un exercice (SPEC §3.3). */
export interface ExerciseState {
  /** Clé primaire. */
  exerciseId: Id
  /** Charge de travail actuelle ; `null` pour le poids du corps. */
  loadKg: number | null
  /** Ressentis des dernières séances, le plus récent en dernier (au plus 10). */
  recentFeelings: Feeling[]
  lastPerformedOn?: LocalDate
  updatedAt: IsoDateTime
}

export type SessionDuration = 20 | 30 | 45 | 60

export type SessionStatus = 'planned' | 'in_progress' | 'done' | 'abandoned'

export interface SetEntry {
  targetReps?: Range
  targetDurationSec?: number
  loadKg?: number
  actualReps?: number
  actualDurationSec?: number
  feeling?: Feeling
  /** `done` = série faite ; `skipped` = passée. Absent = à faire. */
  status?: 'done' | 'skipped'
}

export interface SessionExercise {
  exerciseId: Id
  restSec: number
  sets: SetEntry[]
}

export interface SessionBlock {
  id: Id
  /** `superset` = exercices enchaînés, repos après le tour. */
  kind: 'single' | 'superset' | 'finisher'
  exercises: SessionExercise[]
}

export interface Session {
  id: Id
  date: LocalDate
  durationMin: SessionDuration
  status: SessionStatus
  warmup: string[]
  blocks: SessionBlock[]
  deload: boolean
  estimatedMin: number
  templateId?: Id
  startedAt?: IsoDateTime
  endedAt?: IsoDateTime
  /** Position courante pour la reprise du mode guidé. */
  cursor?: { block: number; exercise: number; set: number }
  notes?: string
  updatedAt: IsoDateTime
}

export interface TemplateBlock {
  exerciseId: Id
  sets: number
  reps?: Range
  durationSec?: number
  loadKg?: number
  restSec: number
}

export interface SessionTemplate {
  id: Id
  name: string
  durationMin: SessionDuration
  blocks: TemplateBlock[]
  createdAt: IsoDateTime
  updatedAt: IsoDateTime
}
