// Application d'une réponse de Claude (J9, SPEC §10.2) : exercices, préférences, recettes, repas et séance en UNE
// transaction (tout ou rien). Les validations sont celles des fonctions unitaires (createExercise, commitImport…).
import { CLAUDE_TEMPLATE_ID } from '../types'
import type { ClaudeApplyOutcome, FoodLogEntry, Id, ImportSelection, IsoDateTime, LocalDate } from '../types'
import { resolvePlanBlocks } from '../domain/claude/plan'
import { toLocalDate } from '../domain/shared/dates'
import { db } from './database'
import { newId, nowIso } from './helpers'
import { commitImport } from './recipes'
import { insertUserExercise, putExercisePreference } from './repositories'
import { buildTemplate } from './sessions'

export const CLAUDE_TEMPLATE_NAME = 'Séance proposée par Claude'

export async function applyClaudeSelection(
  selection: ImportSelection,
  opts: { now?: IsoDateTime; today?: LocalDate } = {},
): Promise<ClaudeApplyOutcome> {
  const now = opts.now ?? nowIso()
  const today = opts.today ?? toLocalDate(new Date(now))
  return db.transaction(
    'rw',
    [db.exercises, db.exercisePrefs, db.recipes, db.foodLog, db.sessionTemplates],
    async () => {
      const createdIds = new Map<number, Id>()
      for (const { index, exercise } of selection.exercises ?? []) {
        createdIds.set(index, (await insertUserExercise(exercise, now)).id)
      }
      const prefs = selection.preferences ?? []
      for (const p of prefs) await putExercisePreference(p.exerciseId, p.preference, now, p.reason)

      // Même conversion que importedMealEntry (domain/claude/import), recopiée pour ne pas charger Zod ici.
      const entries: FoodLogEntry[] = selection.meals.map((m) => ({
        id: newId(),
        date: m.date,
        slot: m.slot,
        name: m.name,
        origin: { kind: 'import', estimated: m.estimated },
        macros: { ...m.totals },
        createdAt: now,
      }))
      const imported = await commitImport(selection.recipes, entries, now)

      const outcome: ClaudeApplyOutcome = {
        recipesCreated: imported.recipesCreated,
        mealsLogged: imported.mealsLogged,
        exercisesCreated: createdIds.size,
        preferencesSet: prefs.length,
      }
      const plan = selection.sessionPlan
      if (plan) {
        const blocks = resolvePlanBlocks(plan, createdIds)
        if (blocks.length > 0) {
          const existing = await db.sessionTemplates.get(CLAUDE_TEMPLATE_ID)
          const row = buildTemplate(
            { name: CLAUDE_TEMPLATE_NAME, durationMin: plan.durationMin, blocks },
            CLAUDE_TEMPLATE_ID,
            existing?.createdAt ?? now,
            now,
          )
          await db.sessionTemplates.put(row)
          outcome.sessionPlanFor = today
        } else {
          outcome.sessionPlanSkipped = true
        }
      }
      return outcome
    },
  )
}
