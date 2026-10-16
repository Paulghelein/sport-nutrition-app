import { describe, expect, it } from 'vitest'
import { COACH_PROJECT_INSTRUCTIONS } from './instructions'
import { extractJsonPayload, parseImport } from './import'
import { checkExercise, validateRecipeInput } from '../../db/validation'
import type { ImportExerciseRef } from './importTraining'

const exercises: ImportExerciseRef[] = [
  { id: 'box-goblet-squat', name: 'Goblet squat sur boîte', pattern: 'squat', level: 1, loadType: 'kettlebell', restSec: 90, repRange: [8, 12] },
  { id: 'incline-push-up', name: 'Pompes inclinées', pattern: 'push_h', level: 1, loadType: 'bodyweight', restSec: 60, repRange: [8, 15] },
]
const ctx = { today: '2026-10-16', ciqual: [], exercises, validateRecipe: validateRecipeInput, validateExercise: checkExercise }

describe('COACH_PROJECT_INSTRUCTIONS', () => {
  const blocks = [...COACH_PROJECT_INSTRUCTIONS.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => m[1] ?? '')
  it('contient un exemple par type', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(5)
    const types = new Set(blocks.flatMap((b) => {
      const v = extractJsonPayload(b)
      if (!v.ok) return []
      return (Array.isArray(v.value) ? v.value : [v.value]).map((x) => (x as { type: string }).type)
    }))
    expect([...types].sort()).toEqual(['exercise', 'exercisePreference', 'meal', 'recipe', 'sessionPlan'])
  })
  it('chaque exemple est valide pour parseImport (aucun invalid, aucun unsupported)', () => {
    for (const b of blocks) {
      const r = parseImport(b, ctx)
      expect(r.ok).toBe(true)
      if (!r.ok) continue
      for (const it of r.items) expect(it.kind, JSON.stringify(it)).not.toMatch(/invalid|unsupported/)
    }
  })
  it('le sessionPlan au nouvel exercice pointe vers l’objet exercise de la même réponse', () => {
    const last = parseImport(blocks[blocks.length - 1] ?? '', ctx)
    if (!last.ok) throw new Error(last.error)
    const plan = last.items.find((i) => i.kind === 'sessionPlan')
    if (plan?.kind !== 'sessionPlan') throw new Error('plan manquant')
    expect(plan.plan.blocks[0]).toMatchObject({ newExerciseIndex: 1, kind: 'superset' })
    expect(plan.plan.unknownExerciseIds).toEqual([])
  })
  it('mentionne la règle des exerciseId', () => {
    expect(COACH_PROJECT_INSTRUCTIONS).toContain("N'invente jamais d'exerciseId")
  })
})
