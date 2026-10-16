// Contexte d'analyse d'une réponse de Claude (J9) : branche les règles métier de l'app sur `parseImport`.
// Fonctions pures (les données viennent des hooks) ; seules les importations de types viennent de domain/claude.
import type { ImportContext } from '../../domain/claude/import'
import { missingEquipment } from '../../domain/training/library'
import { patternLevels } from '../../domain/training/levels'
import { templateIssues } from '../../domain/training/templates'
import type { TemplateIssue } from '../../domain/training/templates'
import type {
  CiqualFood,
  Equipment,
  ExerciseInput,
  FoodLogEntry,
  LocalDate,
  PatternLevels,
  RecipeInput,
  TemplateBlock,
} from '../../types'
import type { EngineBase } from '../training/useEngineInput'

/** Raisons d'écart d'une ligne de modèle (aperçu de séance et réponse de Claude). */
export const PLAN_ISSUE_TEXT: Record<TemplateIssue['reason'], string> = {
  missing: 'n’existe plus',
  equipment: 'matériel manquant',
  hidden: 'masqué',
  level: 'niveau pas encore atteint',
  no_target: 'sans objectif',
}

/** Raison pour laquelle un exercice créé par la réponse ne serait pas proposé, ou `null`. */
export function newExerciseIssueFor(levels: PatternLevels, equipment: Equipment) {
  return (e: ExerciseInput): string | null => {
    const missing = missingEquipment({ ...e, id: '', source: 'user', updatedAt: '' }, equipment)
    if (missing.length > 0) return 'matériel manquant'
    if (e.level > levels[e.pattern]) return `niveau ${e.level} pas encore atteint pour ce schéma`
    return null
  }
}

export interface ImportDeps {
  today: LocalDate
  ciqual: readonly CiqualFood[]
  engine: EngineBase
  validateRecipe: (r: RecipeInput) => string | null
  validateEntry: (e: FoodLogEntry) => string | null
  validateExercise: (e: ExerciseInput) => string | null
}

/** Durée fictive : `templateIssues` n'en dépend pas. */
const ANY_DURATION = 30

export function buildImportContext(d: ImportDeps): ImportContext {
  const { engine } = d
  const levels = patternLevels(engine.library, engine.states, engine.profileLevel)
  return {
    today: d.today,
    ciqual: d.ciqual,
    validateRecipe: d.validateRecipe,
    validateEntry: d.validateEntry,
    exercises: engine.library.filter((e) => e.deleted !== true),
    kettlebell: engine.equipment.kettlebell,
    validateExercise: d.validateExercise,
    newExerciseIssue: newExerciseIssueFor(levels, engine.equipment),
    planIssues: (blocks: TemplateBlock[]) =>
      templateIssues({ blocks }, { ...engine, durationMin: ANY_DURATION }).map((i) => ({
        exerciseId: i.exerciseId,
        message: PLAN_ISSUE_TEXT[i.reason],
      })),
  }
}
