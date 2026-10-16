// Résolution d'une séance importée (J9) : module sans dépendance d'exécution, importable par src/db sans tirer le
// parsing ni le générateur de séances dans le bundle de démarrage.
import type { Id } from '../../types/common'
import type { ImportedSessionPlan } from '../../types/claude'
import type { TemplateBlock } from '../../types/training'

/**
 * Lignes d'une séance prêtes pour `planFromTemplate` : les `newExerciseIndex` sont remplacés par l'id de l'exercice
 * créé (`createdIds` : index source → id) ; les lignes dont l'exercice n'a pas été créé sont écartées. Les `group`
 * ne sont pas renumérotés (des trous restent valides), mais `kind` est recalculé : un superset réduit à une ligne
 * redevient `single`. Peut renvoyer `[]` (toutes les lignes visaient des exercices non créés) : l'appelant ne doit
 * alors rien appliquer.
 */
export function resolvePlanBlocks(
  plan: ImportedSessionPlan,
  createdIds: ReadonlyMap<number, Id>,
): TemplateBlock[] {
  const kept: TemplateBlock[] = []
  for (const b of plan.blocks) {
    const { newExerciseIndex, ...rest } = b
    if (newExerciseIndex === undefined) {
      kept.push(rest)
      continue
    }
    const id = createdIds.get(newExerciseIndex)
    if (id !== undefined) kept.push({ ...rest, exerciseId: id })
  }
  const count = new Map<number, number>()
  for (const b of kept) count.set(b.group ?? -1, (count.get(b.group ?? -1) ?? 0) + 1)
  return kept.map((b) => {
    if (b.group === undefined || b.kind === 'finisher') return b
    return { ...b, kind: (count.get(b.group) ?? 1) > 1 ? ('superset' as const) : ('single' as const) }
  })
}
