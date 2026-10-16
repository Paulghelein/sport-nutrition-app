// Sélection d'une réponse de Claude (J9) : fonctions pures entre l'aperçu (cases à cocher) et `applyClaudeSelection`.
import type { ClaudeApplyOutcome, ImportedSessionPlan } from '../../types/claude'
import { recipeNutrition, roundMacros } from '../../domain/nutrition'
import type { ImportedExercise, ImportPreviewItem, ImportSelection, Macros, RecipeInput } from '../../types'

/** Éléments qu'on peut cocher (les invalides et non pris en charge ne s'appliquent jamais). */
export function isSelectable(item: ImportPreviewItem): boolean {
  return item.kind !== 'invalid' && item.kind !== 'unsupported'
}

/**
 * Cases cochées au départ : tout ce qui est applicable. Une seule séance à la fois : si la réponse en contient
 * plusieurs, seule la première est cochée (la dernière appliquée écraserait de toute façon les précédentes).
 */
export function defaultSelection(items: readonly ImportPreviewItem[]): Set<number> {
  const out = new Set<number>()
  let plan = false
  for (const item of items) {
    if (!isSelectable(item)) continue
    // Exercice dont le nom existe déjà : le plan utilisera l'existant, le créer ferait un doublon.
    if (item.kind === 'exercise' && item.duplicateOf !== undefined) continue
    if (item.kind === 'sessionPlan') {
      if (plan) continue
      plan = true
    }
    out.add(item.index)
  }
  return out
}

/** Coche / décoche un élément ; cocher une séance décoche les autres séances. */
export function toggleSelection(
  items: readonly ImportPreviewItem[],
  selected: ReadonlySet<number>,
  index: number,
  on: boolean,
): Set<number> {
  const next = new Set(selected)
  const item = items.find((i) => i.index === index)
  if (!item || !isSelectable(item)) return next
  if (!on) {
    next.delete(index)
    return next
  }
  if (item.kind === 'sessionPlan') {
    for (const other of items) if (other.kind === 'sessionPlan') next.delete(other.index)
  }
  next.add(index)
  return next
}

/** `ImportSelection` des éléments cochés (ordre de la réponse conservé). */
export function buildSelection(
  items: readonly ImportPreviewItem[],
  selected: ReadonlySet<number>,
): ImportSelection {
  const selection: ImportSelection = { recipes: [], meals: [] }
  const exercises: { index: number; exercise: ImportedExercise }[] = []
  const preferences: NonNullable<ImportSelection['preferences']> = []
  for (const item of items) {
    if (!selected.has(item.index)) continue
    switch (item.kind) {
      case 'recipe':
        selection.recipes.push(item.recipe)
        break
      case 'meal':
        selection.meals.push(item.meal)
        break
      case 'exercise':
        exercises.push({ index: item.index, exercise: item.exercise })
        break
      case 'exercisePreference':
        preferences.push(item.preference)
        break
      case 'sessionPlan':
        selection.sessionPlan = item.plan
        break
      default:
        break
    }
  }
  if (exercises.length > 0) selection.exercises = exercises
  if (preferences.length > 0) selection.preferences = preferences
  return selection
}

/** Nombre d'éléments à appliquer (bouton désactivé à 0). */
export function selectionSize(s: ImportSelection): number {
  return (
    s.recipes.length +
    s.meals.length +
    (s.exercises?.length ?? 0) +
    (s.preferences?.length ?? 0) +
    (s.sessionPlan ? 1 : 0)
  )
}

const plural = (n: number, one: string, many: string): string => `${n} ${n > 1 ? many : one}`

/** Lignes du message de fin. */
export function outcomeLines(o: ClaudeApplyOutcome): string[] {
  const lines: string[] = []
  if (o.recipesCreated > 0) lines.push(`${plural(o.recipesCreated, 'recette créée', 'recettes créées')}.`)
  if (o.mealsLogged > 0) lines.push(`${plural(o.mealsLogged, 'repas ajouté', 'repas ajoutés')} au journal.`)
  if (o.exercisesCreated > 0) {
    lines.push(`${plural(o.exercisesCreated, 'exercice créé', 'exercices créés')} dans la bibliothèque.`)
  }
  if (o.preferencesSet > 0) {
    lines.push(`${plural(o.preferencesSet, 'préférence enregistrée', 'préférences enregistrées')}.`)
  }
  if (o.sessionPlanFor !== undefined) lines.push('Séance proposée par Claude enregistrée.')
  if (o.sessionPlanSkipped) lines.push('Séance non appliquée : aucun exercice retenu.')
  if (lines.length === 0) lines.push('Rien n’a été appliqué.')
  return lines
}

// ---------- Séance : lignes affichées dans l'aperçu ----------

export interface PlanLine {
  name: string
  /** Exercice créé par la même réponse. */
  isNew: boolean
  /** « 3 × 8 à 12 reps · 16 kg » */
  text: string
  /** Libellé de groupe (superset, finisher) ou `undefined`. */
  group?: string
  /** L'exercice créé par cette ligne est décoché : la ligne ne sera pas appliquée. */
  dropped?: true
}

export function planLines(
  plan: ImportedSessionPlan,
  nameOf: (id: string) => string,
  newExerciseName: (index: number) => string | undefined,
  /** Cases cochées : une ligne dont l'exercice créé est décoché sera écartée à l'application. */
  selected?: ReadonlySet<number>,
): PlanLine[] {
  return plan.blocks.map((b) => {
    const newIndex = b.newExerciseIndex
    const isNew = newIndex !== undefined
    const name = isNew ? (newExerciseName(newIndex) ?? b.exerciseId) : nameOf(b.exerciseId)
    const dropped = isNew && selected !== undefined && !selected.has(newIndex)
    const parts: string[] = []
    if (b.durationSec !== undefined) parts.push(`${b.sets} × ${b.durationSec} s`)
    else if (b.reps)
      parts.push(`${b.sets} × ${b.reps[0] === b.reps[1] ? b.reps[0] : `${b.reps[0]} à ${b.reps[1]}`} reps`)
    else parts.push(`${b.sets} séries`)
    if (b.loadKg !== undefined) parts.push(`${String(b.loadKg).replace('.', ',')} kg`)
    const group = b.kind === 'superset' ? 'Superset' : b.kind === 'finisher' ? 'Finisher' : undefined
    return {
      name,
      isNew,
      text: parts.join(' · '),
      ...(group ? { group } : {}),
      ...(dropped ? { dropped: true as const } : {}),
    }
  })
}

/** Nom d'un exercice créé par la réponse (élément `exercise` d'index `index`). */
export function newExerciseNameAt(items: readonly ImportPreviewItem[], index: number): string | undefined {
  const it = items.find((i) => i.index === index)
  return it?.kind === 'exercise' ? it.exercise.name : undefined
}

/** Macros par portion d'une recette reçue (aperçu) ; `null` tant que les aliments ne sont pas chargés. */
export function recipePreviewNutrition(
  recipe: RecipeInput,
  lookup: Parameters<typeof recipeNutrition>[1] | undefined,
): { perServing: Macros; missing: string[] } | null {
  if (!lookup) return null
  const n = recipeNutrition({ ...recipe, id: 'import', source: 'user', updatedAt: '' }, lookup)
  return { perServing: roundMacros(n.perServing), missing: n.missing }
}
