// Brouillon du formulaire d'exercice : nombres en texte, listes avec lignes vides tolérées.
// Aucune règle métier ici : la validation est faite par `checkExercise` (src/db).
import { PATTERN_ORDER, defaultLoadStep } from '../domain/training/library'
import type {
  EquipmentId,
  ExerciseInput,
  LoadType,
  MovementPattern,
  MuscleGroup,
  TrainingLevel,
} from '../types'
import { equipmentChoices, muscles } from './choices'
import { parseDecimal } from './format'

export interface ExerciseDraft {
  name: string
  pattern: MovementPattern
  level: TrainingLevel
  loadType: LoadType
  /** Cible de la série : répétitions ou durée (au choix pour la kettlebell, imposé sinon). */
  target: 'reps' | 'duration'
  repMin: string
  repMax: string
  durMin: string
  durMax: string
  restSec: string
  compound: boolean
  unilateral: boolean
  /** Peut servir de finisher en fin de séance de 60 min. */
  finisher: boolean
  /** Geste appris d'abord sans charge (kettlebell). */
  learnUnloaded: boolean
  loadStepKg: 1 | 2
  /** Vrai dès que l'utilisateur a choisi lui-même le palier (le changement de schéma ne l'écrase plus). */
  loadStepTouched: boolean
  primary: MuscleGroup[]
  secondary: MuscleGroup[]
  equipment: EquipmentId[]
  progressionCriteria: string
  setup: string
  steps: string[]
  cues: string[]
  mistakes: string[]
  videoUrl: string
  /** Id d'illustration conservé tel quel (non éditable ici). */
  illustration: string
}

export function exerciseToDraft(input: ExerciseInput): ExerciseDraft {
  return {
    name: input.name,
    pattern: input.pattern,
    level: input.level,
    loadType: input.loadType,
    target: input.durationRange ? 'duration' : 'reps',
    repMin: String(input.repRange?.[0] ?? 8),
    repMax: String(input.repRange?.[1] ?? 12),
    durMin: String(input.durationRange?.[0] ?? 30),
    durMax: String(input.durationRange?.[1] ?? 45),
    restSec: String(input.restSec),
    compound: input.compound,
    unilateral: input.unilateral,
    finisher: input.finisher === true,
    learnUnloaded: input.learnUnloaded === true,
    loadStepKg: input.loadStepKg,
    loadStepTouched: input.loadStepKg !== defaultLoadStep(input.pattern),
    primary: [...input.muscles.primary],
    secondary: [...input.muscles.secondary],
    equipment: [...input.equipment],
    progressionCriteria: input.progressionCriteria,
    setup: input.technique.setup,
    steps: [...input.technique.steps],
    cues: [...input.technique.cues],
    mistakes: [...input.technique.mistakes],
    videoUrl: input.videoUrl ?? '',
    illustration: input.illustration ?? '',
  }
}

/** Timed → durée, bodyweight → répétitions, kettlebell → selon le choix. */
export function usesDuration(draft: Pick<ExerciseDraft, 'loadType' | 'target'>): boolean {
  return draft.loadType === 'timed' || (draft.loadType === 'kettlebell' && draft.target === 'duration')
}

const nonEmpty = (lines: string[]): string[] => lines.map((l) => l.trim()).filter((l) => l !== '')

/** Les champs numériques vides ou illisibles donnent NaN : `checkExercise` les refuse avec un message. */
export function draftToExercise(draft: ExerciseDraft): ExerciseInput {
  const input: ExerciseInput = {
    name: draft.name,
    pattern: draft.pattern,
    level: draft.level,
    muscles: { primary: draft.primary, secondary: draft.secondary },
    equipment: draft.equipment,
    loadType: draft.loadType,
    restSec: parseDecimal(draft.restSec),
    compound: draft.compound,
    unilateral: draft.unilateral,
    loadStepKg: draft.loadStepKg,
    progressionCriteria: draft.progressionCriteria,
    technique: {
      setup: draft.setup,
      steps: nonEmpty(draft.steps),
      cues: nonEmpty(draft.cues),
      mistakes: nonEmpty(draft.mistakes),
    },
  }
  // Absent = non : on n'écrit les drapeaux que lorsqu'ils sont cochés.
  if (draft.finisher) input.finisher = true
  if (draft.learnUnloaded && draft.loadType === 'kettlebell') input.learnUnloaded = true
  if (usesDuration(draft)) input.durationRange = [parseDecimal(draft.durMin), parseDecimal(draft.durMax)]
  else input.repRange = [parseDecimal(draft.repMin), parseDecimal(draft.repMax)]
  const video = draft.videoUrl.trim()
  if (video !== '') input.videoUrl = video
  if (draft.illustration !== '') input.illustration = draft.illustration
  return input
}

const KEY_PREFIX = 'forge:exercise-draft:'

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

const muscleIds: readonly string[] = muscles.map((m) => m.value)
const equipmentIds: readonly string[] = equipmentChoices.map((e) => e.value)

function isOneOf(v: unknown, allowed: readonly string[]): boolean {
  return isStringArray(v) && v.every((x) => allowed.includes(x))
}

function isDraft(v: unknown): v is ExerciseDraft {
  if (typeof v !== 'object' || v === null) return false
  const d = v as Record<string, unknown>
  const strings = [
    'name',
    'repMin',
    'repMax',
    'durMin',
    'durMax',
    'restSec',
    'progressionCriteria',
    'setup',
    'videoUrl',
    'illustration',
  ]
  return (
    strings.every((k) => typeof d[k] === 'string') &&
    PATTERN_ORDER.includes(d.pattern as MovementPattern) &&
    [1, 2, 3].includes(d.level as number) &&
    ['kettlebell', 'bodyweight', 'timed'].includes(d.loadType as string) &&
    (d.target === 'reps' || d.target === 'duration') &&
    typeof d.compound === 'boolean' &&
    typeof d.unilateral === 'boolean' &&
    typeof d.loadStepTouched === 'boolean' &&
    (d.loadStepKg === 1 || d.loadStepKg === 2) &&
    ['steps', 'cues', 'mistakes'].every((k) => isStringArray(d[k])) &&
    isOneOf(d.primary, muscleIds) &&
    isOneOf(d.secondary, muscleIds) &&
    isOneOf(d.equipment, equipmentIds)
  )
}

/** Brouillon enregistré pour ce formulaire (`'new'` ou id de l'exercice), ou `null`. Vit le temps de la session de l'app. */
export function loadExerciseDraft(key: string): ExerciseDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY_PREFIX + key)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    // Les brouillons enregistrés avant l'ajout des drapeaux n'ont pas ces deux champs : absent = non.
    if (!isDraft(parsed)) return null
    const flags = parsed as unknown as Record<string, unknown>
    return { ...parsed, finisher: flags['finisher'] === true, learnUnloaded: flags['learnUnloaded'] === true }
  } catch {
    return null
  }
}

export function saveExerciseDraft(key: string, draft: ExerciseDraft): void {
  try {
    sessionStorage.setItem(KEY_PREFIX + key, JSON.stringify(draft))
  } catch {
    // Stockage indisponible : le brouillon n'est simplement pas conservé.
  }
}

export function clearExerciseDraft(key: string): void {
  try {
    sessionStorage.removeItem(KEY_PREFIX + key)
  } catch {
    // Rien à faire.
  }
}
