import { beforeEach, describe, expect, it } from 'vitest'
import { CLAUDE_TEMPLATE_ID } from '../types'
import type { ExerciseInput, ImportSelection, ImportedSessionPlan, RecipeInput } from '../types'
import { importedMealEntry } from '../domain/claude'
import { exportBackup, importBackup, parseBackup } from './backup'
import { applyClaudeSelection } from './claude'
import { db } from './database'
import { ValidationError, listExercisePrefs, listExerciseRows } from './repositories'
import { createExercise, deleteExercise, setExercisePreference } from './repositories'
import { deleteTemplate, listTemplates, updateTemplate } from './sessions'

const T1 = '2026-03-02T09:00:00.000Z'
const T2 = '2026-03-03T09:00:00.000Z'

const recipe: RecipeInput = {
  name: 'Porridge',
  meal: ['breakfast'],
  servings: 2,
  prepMinutes: 5,
  cookMinutes: 5,
  tags: [],
  ingredients: [
    { name: 'Flocons', grams: 100, aisle: 'grocery', per100g: { kcal: 370, protein: 13, carbs: 60, fat: 7 } },
  ],
  steps: ['Chauffer'],
}

const exercise: ExerciseInput = {
  name: 'Pompe lestée',
  pattern: 'push_h',
  level: 1,
  muscles: { primary: ['chest'], secondary: ['triceps'] },
  equipment: [],
  loadType: 'bodyweight',
  repRange: [8, 15],
  restSec: 60,
  compound: true,
  unilateral: false,
  loadStepKg: 1,
  progressionCriteria: 'Atteins 15 répétitions.',
  technique: { setup: 'Mains au sol.', steps: ['Descends'], cues: [], mistakes: [] },
}

const meal = {
  name: 'Burger',
  date: '2026-03-02',
  slot: 'dinner' as const,
  estimated: true,
  totals: { kcal: 800, protein: 40, carbs: 60, fat: 40 },
}

const plan: ImportedSessionPlan = {
  durationMin: 30,
  unknownExerciseIds: [],
  blocks: [
    { exerciseId: 'goblet-squat', sets: 3, reps: [8, 12], restSec: 90, group: 0, kind: 'single' },
    {
      exerciseId: 'Pompe lestée',
      newExerciseIndex: 2,
      sets: 3,
      reps: [8, 12],
      restSec: 60,
      group: 1,
      kind: 'single',
    },
  ],
}

const full: ImportSelection = {
  recipes: [recipe],
  meals: [meal],
  exercises: [{ index: 2, exercise }],
  preferences: [{ exerciseId: 'goblet-squat', preference: 'liked', reason: 'Bien pour moi' }],
  sessionPlan: plan,
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

async function counts() {
  return [
    await db.exercises.count(),
    await db.exercisePrefs.count(),
    await db.recipes.count(),
    await db.foodLog.count(),
    await db.sessionTemplates.count(),
  ]
}

describe('applyClaudeSelection', () => {
  it('applique une sélection mixte complète', async () => {
    const out = await applyClaudeSelection(full, { now: T1, today: '2026-03-02' })
    expect(out).toEqual({
      recipesCreated: 1,
      mealsLogged: 1,
      exercisesCreated: 1,
      preferencesSet: 1,
      sessionPlanFor: '2026-03-02',
    })
    expect(await counts()).toEqual([1, 1, 1, 1, 1])
    const log = (await db.foodLog.toArray())[0]
    expect(log).toMatchObject({
      name: 'Burger',
      origin: { kind: 'import', estimated: true },
      macros: meal.totals,
    })
    const prefs = await listExercisePrefs()
    expect(prefs[0]).toMatchObject({
      exerciseId: 'goblet-squat',
      preference: 'liked',
      reason: 'Bien pour moi',
    })
  })

  it('référence l’exercice créé dans le modèle', async () => {
    await applyClaudeSelection(full, { now: T1, today: '2026-03-02' })
    const [created] = await listExerciseRows()
    expect(created?.source).toBe('user')
    const [tpl] = await listTemplates()
    expect(tpl).toMatchObject({ id: CLAUDE_TEMPLATE_ID, name: 'Séance proposée par Claude', durationMin: 30 })
    expect(tpl?.blocks.map((b) => b.exerciseId)).toEqual(['goblet-squat', created?.id])
    expect(tpl?.blocks.some((b) => 'newExerciseIndex' in b)).toBe(false)
  })

  it('réécrit le modèle au 2e appel en conservant createdAt', async () => {
    await applyClaudeSelection(
      { recipes: [], meals: [], sessionPlan: plan },
      { now: T1, today: '2026-03-02' },
    )
    const second: ImportedSessionPlan = {
      durationMin: 45,
      unknownExerciseIds: [],
      blocks: [{ exerciseId: 'kb-swing', sets: 4, reps: [10, 15], restSec: 90 }],
    }
    const out = await applyClaudeSelection(
      { recipes: [], meals: [], sessionPlan: second },
      { now: T2, today: '2026-03-03' },
    )
    expect(out.sessionPlanFor).toBe('2026-03-03')
    const tpls = await listTemplates()
    expect(tpls).toHaveLength(1)
    expect(tpls[0]).toMatchObject({ durationMin: 45, createdAt: T1, updatedAt: T2 })
    expect(tpls[0]?.blocks).toHaveLength(1)
  })

  it('aucune ligne restante : pas de modèle ni de sessionPlanFor', async () => {
    const orphan: ImportedSessionPlan = {
      ...plan,
      blocks: [{ exerciseId: 'X', newExerciseIndex: 9, sets: 3, reps: [8, 12], restSec: 60 }],
    }
    const out = await applyClaudeSelection(
      { recipes: [recipe], meals: [], sessionPlan: orphan },
      { now: T1, today: '2026-03-02' },
    )
    expect(out.sessionPlanFor).toBeUndefined()
    expect(out.sessionPlanSkipped).toBe(true)
    expect(out.recipesCreated).toBe(1)
    expect(await db.sessionTemplates.count()).toBe(0)
  })

  it('tout ou rien : un exercice invalide annule tout', async () => {
    const bad: ImportSelection = { ...full, exercises: [{ index: 2, exercise: { ...exercise, name: ' ' } }] }
    await expect(applyClaudeSelection(bad, { now: T1 })).rejects.toBeInstanceOf(ValidationError)
    expect(await counts()).toEqual([0, 0, 0, 0, 0])
  })

  it('tout ou rien : une recette ou un modèle invalide annule les exercices et préférences', async () => {
    const badRecipe: ImportSelection = { ...full, recipes: [{ ...recipe, steps: [] }] }
    await expect(applyClaudeSelection(badRecipe, { now: T1 })).rejects.toBeInstanceOf(ValidationError)
    expect(await counts()).toEqual([0, 0, 0, 0, 0])
    const badPlan: ImportSelection = {
      ...full,
      sessionPlan: { ...plan, blocks: plan.blocks.map((b) => ({ ...b, sets: 99 })) },
    }
    await expect(applyClaudeSelection(badPlan, { now: T1 })).rejects.toBeInstanceOf(ValidationError)
    expect(await counts()).toEqual([0, 0, 0, 0, 0])
  })

  it('pose une préférence sur un exercice de départ, neutre la supprime', async () => {
    await applyClaudeSelection(
      {
        recipes: [],
        meals: [],
        preferences: [{ exerciseId: 'goblet-squat', preference: 'hidden', reason: 'Genou' }],
      },
      { now: T1 },
    )
    expect(await listExercisePrefs()).toEqual([
      { exerciseId: 'goblet-squat', preference: 'hidden', reason: 'Genou', updatedAt: T1 },
    ])
    // Sans raison : l'ancienne est conservée.
    await applyClaudeSelection(
      { recipes: [], meals: [], preferences: [{ exerciseId: 'goblet-squat', preference: 'disliked' }] },
      { now: T2 },
    )
    expect((await listExercisePrefs())[0]).toMatchObject({
      preference: 'disliked',
      reason: 'Genou',
      updatedAt: T2,
    })
    await applyClaudeSelection(
      { recipes: [], meals: [], preferences: [{ exerciseId: 'goblet-squat', preference: 'neutral' }] },
      { now: T2 },
    )
    expect(await listExercisePrefs()).toEqual([])
  })

  it('le modèle claude-plan reste un modèle ordinaire (modifiable, supprimable, sauvegardable)', async () => {
    await applyClaudeSelection(full, { now: T1, today: '2026-03-02' })
    const updated = await updateTemplate(
      CLAUDE_TEMPLATE_ID,
      { name: 'Ma séance', durationMin: 30, blocks: plan.blocks.slice(0, 1) },
      T2,
    )
    expect(updated.name).toBe('Ma séance')

    const backup = await exportBackup(T2)
    const parsed = parseBackup(JSON.stringify(backup))
    expect(parsed.ok).toBe(true)
    await Promise.all(db.tables.map((t) => t.clear()))
    if (parsed.ok) await importBackup(parsed.backup, 'replace')
    expect((await listTemplates()).map((t) => t.id)).toEqual([CLAUDE_TEMPLATE_ID])

    await deleteTemplate(CLAUDE_TEMPLATE_ID)
    expect(await listTemplates()).toEqual([])
  })
})

describe('applyClaudeSelection : cas limites (QA)', () => {
  it('repas importé : macros figées, origine import, estimated recopié (true et false)', async () => {
    const exact = {
      ...meal,
      name: 'Pâtes',
      estimated: false,
      totals: { kcal: 600, protein: 25, carbs: 90, fat: 12 },
    }
    await applyClaudeSelection({ recipes: [], meals: [meal, exact] }, { now: T1 })
    const rows = await db.foodLog.toArray()
    const by = (n: string) => rows.find((r) => r.name === n)
    expect(by('Burger')?.origin).toEqual({ kind: 'import', estimated: true })
    expect(by('Pâtes')?.origin).toEqual({ kind: 'import', estimated: false })
    expect(by('Pâtes')?.macros).toEqual(exact.totals)
    expect(by('Pâtes')?.createdAt).toBe(T1)
    expect(by('Pâtes')?.macros).not.toBe(exact.totals)
  })

  it('équivalence avec importedMealEntry du domaine', async () => {
    await applyClaudeSelection({ recipes: [], meals: [meal] }, { now: T1 })
    const [row] = await db.foodLog.toArray()
    expect(row).toEqual(importedMealEntry(meal, { id: row?.id ?? '', createdAt: T1 }))
    const exact = { ...meal, estimated: false }
    await db.foodLog.clear()
    await applyClaudeSelection({ recipes: [], meals: [exact] }, { now: T2 })
    const [row2] = await db.foodLog.toArray()
    expect(row2).toEqual(importedMealEntry(exact, { id: row2?.id ?? '', createdAt: T2 }))
  })

  it('exercice créé puis préférence : la préférence ne se résout pas par index (exerciseId littéral)', async () => {
    const sel: ImportSelection = {
      recipes: [],
      meals: [],
      exercises: [{ index: 2, exercise }],
      preferences: [{ exerciseId: 'Pompe lestée', preference: 'liked' }],
    }
    const out = await applyClaudeSelection(sel, { now: T1 })
    expect(out).toMatchObject({ exercisesCreated: 1, preferencesSet: 1 })
    const [created] = await listExerciseRows()
    const prefs = await listExercisePrefs()
    // Documente le comportement actuel : la préférence est stockée sous l'id fourni, pas sous l'id généré.
    expect(prefs.map((p) => p.exerciseId)).toEqual(['Pompe lestée'])
    expect(prefs[0]?.exerciseId).not.toBe(created?.id)
  })

  it('préférence sur un exercice créé auparavant (id réel) : fonctionne dans la même transaction', async () => {
    const e = await createExercise(exercise, T1)
    await applyClaudeSelection(
      { recipes: [], meals: [], preferences: [{ exerciseId: e.id, preference: 'hidden' }] },
      { now: T2 },
    )
    expect(await listExercisePrefs()).toEqual([{ exerciseId: e.id, preference: 'hidden', updatedAt: T2 }])
  })

  it('plan référant un exercice de départ supprimé : le modèle est créé quand même', async () => {
    const { listExerciseRows: rows } = await import('./repositories')
    await deleteExercise(
      { ...exercise, id: 'goblet-squat', source: 'seed' } as unknown as Parameters<typeof deleteExercise>[0],
      T1,
    )
    expect((await rows()).find((r) => r.id === 'goblet-squat')?.deleted).toBe(true)
    const out = await applyClaudeSelection(
      { recipes: [], meals: [], sessionPlan: plan },
      { now: T2, today: '2026-03-03' },
    )
    expect(out.sessionPlanFor).toBe('2026-03-03')
    const [tpl] = await listTemplates()
    expect(tpl?.blocks[0]?.exerciseId).toBe('goblet-squat')
  })

  it('sélection vide : outcome à zéro, aucune écriture', async () => {
    const out = await applyClaudeSelection({ recipes: [], meals: [] }, { now: T1 })
    expect(out).toEqual({ recipesCreated: 0, mealsLogged: 0, exercisesCreated: 0, preferencesSet: 0 })
    expect('sessionPlanFor' in out).toBe(false)
    expect(await counts()).toEqual([0, 0, 0, 0, 0])
    const out2 = await applyClaudeSelection(
      { recipes: [], meals: [], exercises: [], preferences: [] },
      { now: T1 },
    )
    expect(out2).toEqual(out)
    expect(await counts()).toEqual([0, 0, 0, 0, 0])
  })

  it('today par défaut = jour local de now', async () => {
    const out = await applyClaudeSelection({ recipes: [], meals: [], sessionPlan: plan }, { now: T1 })
    expect(out.sessionPlanFor).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('refactors repositories (non-régression)', () => {
  it('createExercise : ligne user, validation, id unique', async () => {
    const a = await createExercise(exercise, T1)
    const b = await createExercise(exercise, T1)
    expect(a).toMatchObject({ source: 'user', name: 'Pompe lestée' })
    expect(a.id).not.toBe(b.id)
    await expect(createExercise({ ...exercise, name: '' }, T1)).rejects.toBeInstanceOf(ValidationError)
    expect(await db.exercises.count()).toBe(2)
  })

  it('setExercisePreference : conserve la raison existante, neutral supprime, sans toucher updatedAt des autres', async () => {
    await applyClaudeSelection(
      { recipes: [], meals: [], preferences: [{ exerciseId: 'kb-swing', preference: 'liked', reason: 'R' }] },
      { now: T1 },
    )
    await setExercisePreference('kb-swing', 'disliked', T2)
    expect(await listExercisePrefs()).toEqual([
      { exerciseId: 'kb-swing', preference: 'disliked', reason: 'R', updatedAt: T2 },
    ])
    await setExercisePreference('kb-swing', 'neutral', T2)
    expect(await listExercisePrefs()).toEqual([])
    await setExercisePreference('kb-swing', 'liked', T2)
    expect((await listExercisePrefs())[0]).not.toHaveProperty('reason')
  })

  it('raison fournie vide ou blanche : l’ancienne est conservée ; non vide : remplacée et rognée', async () => {
    await applyClaudeSelection(
      { recipes: [], meals: [], preferences: [{ exerciseId: 'a', preference: 'liked', reason: 'Old' }] },
      { now: T1 },
    )
    await applyClaudeSelection(
      { recipes: [], meals: [], preferences: [{ exerciseId: 'a', preference: 'liked', reason: '   ' }] },
      { now: T2 },
    )
    expect((await listExercisePrefs())[0]?.reason).toBe('Old')
    await applyClaudeSelection(
      { recipes: [], meals: [], preferences: [{ exerciseId: 'a', preference: 'liked', reason: '  New ' }] },
      { now: T2 },
    )
    expect((await listExercisePrefs())[0]?.reason).toBe('New')
  })
})
