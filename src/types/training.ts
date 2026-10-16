// Exercices, préférences, état de progression, séances et modèles (SPEC §3).
import type { ContentSource, Id, IsoDateTime, LocalDate, Range } from './common'
import type { EquipmentId, TrainingLevel } from './profile'

export type MovementPattern =
  'hinge' | 'squat' | 'lunge' | 'push_h' | 'push_v' | 'pull' | 'core' | 'carry' | 'arms' | 'calves'

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

/**
 * Charge de l'exercice. La cible est donnée par `repRange` (répétitions) ou `durationRange` (secondes), exactement un :
 * - `kettlebell` : chargé (charge suivie et progressive) ; cible en reps, ou en durée pour les portés ;
 * - `bodyweight` : poids du corps, cible en reps ;
 * - `timed` : poids du corps tenu (gainage), cible en durée.
 */
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
  /** Répétitions visées ; exactement un de `repRange` / `durationRange` (voir `LoadType`). */
  repRange?: Range
  /** Durée visée en secondes ; requis si `loadType === 'timed'`, possible avec `kettlebell` (portés). */
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
  /** Peut servir de finisher en fin de séance de 60 min (swings, portés) ; absent = non. Remplace `FINISHER_SWING_IDS`. */
  finisher?: boolean
  /**
   * Geste complexe appris d'abord sans charge (ex. Turkish get-up) : l'état créé au déblocage a `loadKg: null`
   * même pour un exercice `kettlebell`. Remplace `LEARN_UNLOADED_IDS`.
   */
  learnUnloaded?: boolean
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

/**
 * État de progression d'un exercice (SPEC §3.3), mis à jour après chaque séance par le moteur.
 * Une ligne existe dès qu'un exercice a été fait ou débloqué (variante acceptée) : le niveau atteint
 * dans un schéma est le plus haut niveau parmi ses exercices ayant un état (au moins `Profile.level`).
 */
export interface ExerciseState {
  /** Clé primaire. */
  exerciseId: Id
  /**
   * Charge de travail actuelle ; `null` pour le poids du corps, ou pour un exercice `kettlebell` en apprentissage
   * sans charge (`Exercise.learnUnloaded`).
   */
  loadKg: number | null
  /** Durée visée par série en secondes (gainage, portés) ; absente pour un exercice en répétitions. */
  targetDurationSec?: number
  /**
   * Ressenti dominant de chaque séance (un par séance : `hard` si au moins la moitié des séries sont `hard`),
   * le plus récent en dernier (au plus 10).
   */
  recentFeelings: Feeling[]
  /** Séances consécutives avec toutes les séries au haut de la fourchette à la charge actuelle ; défaut 0. */
  topStreak?: number
  /** Tempo 3-1-1 proposé et accepté (charge max atteinte sans variante disponible). */
  tempo?: boolean
  lastPerformedOn?: LocalDate
  updatedAt: IsoDateTime
}

export type SessionDuration = 20 | 30 | 45 | 60

export type SessionStatus = 'planned' | 'in_progress' | 'done' | 'abandoned'

export interface SetEntry {
  targetReps?: Range
  targetDurationSec?: number
  loadKg?: number
  /**
   * Charge prévue, gardée quand la charge saisie (`loadKg`) en diffère : `undoSet` la rétablit. Absente = `loadKg`
   * est la charge prévue ; `0` = pas de charge prévue (poids du corps lesté à la saisie : l'annulation retire `loadKg`).
   * Une série corrigée dans l'historique peut avoir `plannedLoadKg` sans `loadKg` (charge effacée) : la progression
   * n'est jamais rejouée sur une séance corrigée, mais un moteur qui la relirait ne doit pas la compter à la charge
   * courante.
   */
  plannedLoadKg?: number
  actualReps?: number
  actualDurationSec?: number
  feeling?: Feeling
  /** `done` = série faite ; `skipped` = passée. Absent = à faire. */
  status?: 'done' | 'skipped'
}

export interface SessionExercise {
  exerciseId: Id
  restSec: number
  /** Tempo imposé (ex. `'3-1-1'` : 3 s de descente, 1 s de pause, 1 s de montée) ; absent = tempo libre. */
  tempo?: string
  /** Exercice proposé à l'origine, quand l'utilisateur l'a remplacé (avant ou pendant la séance). */
  replacedFrom?: Id
  sets: SetEntry[]
}

export interface SessionBlock {
  id: Id
  /** `superset` = exercices enchaînés, repos après le tour. */
  kind: 'single' | 'superset' | 'finisher'
  exercises: SessionExercise[]
}

/** Position dans une séance : indices du bloc, de l'exercice dans le bloc, de la série dans l'exercice. */
export interface SessionCursor {
  block: number
  exercise: number
  set: number
}

/** Suggestion de progression (`ProgressionSuggestion`, src/types/engine.ts) gardée avec la séance qui l'a produite. */
export interface SessionSuggestion {
  kind: 'level_up' | 'tempo'
  exerciseId: Id
  toExerciseId?: Id
  message: string
  /** `pending` tant que l'utilisateur n'a pas répondu. Accepter crée l'état (level_up) ou pose `tempo` (tempo). */
  status: 'pending' | 'accepted' | 'dismissed'
}

/**
 * Séance enregistrée. Cycle de vie :
 * - `planned` : non utilisé en J4 (l'aperçu édité reste en mémoire jusqu'au départ) ;
 * - `in_progress` : créée au départ (« Commencer »), sauvegardée à chaque série ; une seule à la fois ;
 * - `done` : terminée, progression appliquée une fois (`progressionAppliedAt`) ;
 * - `abandoned` : arrêtée sans terminer ; ne compte ni pour le volume ni pour la progression.
 * Une séance `done` corrigée dans l'historique ne rejoue pas la progression (seuls volume et records changent).
 */
export interface Session {
  id: Id
  date: LocalDate
  durationMin: SessionDuration
  status: SessionStatus
  warmup: string[]
  /** Durée de l'échauffement prévue (pour recalculer `estimatedMin` après une édition) ; absente = séances antérieures à J4. */
  warmupMin?: number
  blocks: SessionBlock[]
  deload: boolean
  estimatedMin: number
  templateId?: Id
  startedAt?: IsoDateTime
  endedAt?: IsoDateTime
  /** Position courante pour la reprise du mode guidé. */
  cursor?: SessionCursor
  /** Fin du repos en cours (minuteur), pour le reprendre après fermeture de l'app ; absent = pas de repos. */
  restEndsAt?: IsoDateTime
  /** Moment où la progression a été appliquée aux états : garde-fou, `applySessionResult` n'est jamais rejouée. */
  progressionAppliedAt?: IsoDateTime
  /** Suggestions produites à la fin de la séance (récapitulatif), avec la réponse de l'utilisateur. */
  suggestions?: SessionSuggestion[]
  notes?: string
  updatedAt: IsoDateTime
}

export interface TemplateBlock {
  /**
   * Regroupement : les lignes consécutives de même `group` forment un même bloc de séance (superset, finisher) ;
   * absent = bloc simple d'un exercice (modèles antérieurs à J4).
   */
  group?: number
  /** Nature du bloc d'origine ; absent = `single`. */
  kind?: SessionBlock['kind']
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

/** Champs saisis à la création ou à la modification d'un exercice (formulaire, futur import Claude). */
export type ExerciseInput = Omit<Exercise, 'id' | 'source' | 'deleted' | 'updatedAt'>

/**
 * Exercice tel que l'app le présente : contenu de départ (src/content/) fusionné avec les surcharges et
 * créations en base (table `exercises`) et la préférence (table `exercisePrefs`, défaut `neutral`).
 * Un exercice de départ supprimé (`deleted`) n'apparaît pas dans la bibliothèque.
 */
export interface LibraryExercise extends Exercise {
  /** Exercice de départ modifié par l'utilisateur : « Rétablir l'original » est possible. */
  overridden: boolean
  preference: ExercisePreference
}
