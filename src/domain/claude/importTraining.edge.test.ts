import { describe, expect, it } from 'vitest'
import { checkExercise } from '../../db/validation'
import { parseImport } from './import'
import { resolvePlanBlocks, type ImportExerciseRef } from './importTraining'
import type { ImportPreviewItem } from '../../types/recipes'

const exercises: ImportExerciseRef[] = [
  {
    id: 'goblet-squat',
    name: 'Goblet squat',
    pattern: 'squat',
    level: 2,
    loadType: 'kettlebell',
    restSec: 90,
    repRange: [8, 12],
  },
  {
    id: 'incline-push-up',
    name: 'Pompes inclinées',
    pattern: 'push_h',
    level: 1,
    loadType: 'bodyweight',
    restSec: 60,
    repRange: [8, 15],
  },
  {
    id: 'plank',
    name: 'Planche',
    pattern: 'core',
    level: 1,
    loadType: 'timed',
    restSec: 45,
    durationRange: [20, 40],
  },
]
const ctx = { today: '2026-10-16', exercises, validateExercise: checkExercise }
const parse = (text: string) => {
  const r = parseImport(text, ctx)
  if (!r.ok) throw new Error(r.error)
  return r.items
}
const plan = (blocks: unknown[], durationMin: number | string = 30) => ({
  type: 'sessionPlan',
  durationMin,
  blocks,
})
const first = (v: unknown): ImportPreviewItem => parse(JSON.stringify([v]))[0] as ImportPreviewItem

const NEW_EXO = {
  type: 'exercise',
  name: 'Hip thrust au sol KB',
  pattern: 'hinge',
  level: 1,
  muscles: { primary: ['glutes'] },
  loadType: 'kettlebell',
  repRange: [10, 15],
}

describe('réponse réelle de Claude : prose + bloc json', () => {
  it('meal + sessionPlan + exercice cité par nom, accents et fin de prose', () => {
    const text = [
      'Voici ce que je te propose pour ce soir, avec un repas de récupération :',
      '',
      '```json',
      JSON.stringify(
        [
          {
            type: 'meal',
            name: 'Riz poulet',
            date: '2026-10-16',
            slot: 'diner',
            estimated: true,
            totals: { kcal: 700, protein: 45, carbs: 80, fat: 20 },
          },
          plan([
            { exerciseId: 'hip thrust au sol kb', sets: 3, reps: [10, 15], loadKg: 16, restSec: 75 },
            { exerciseId: 'Pompes inclinees', sets: 3 },
          ]),
          NEW_EXO,
        ],
        null,
        2,
      ),
      '```',
      '',
      'Bonne séance ! Dis-moi comment ça se passe.',
    ].join('\n')
    const items = parse(text)
    expect(items.map((i) => i.kind)).toEqual(['meal', 'sessionPlan', 'exercise'])
    const p = items[1]
    if (p?.kind !== 'sessionPlan') throw new Error()
    expect(p.plan.blocks[0]).toMatchObject({ newExerciseIndex: 2, loadKg: 16, restSec: 75 })
    expect(p.plan.blocks[1]).toMatchObject({ exerciseId: 'incline-push-up' })
    expect(p.plan.unknownExerciseIds).toEqual([])
  })
})

describe('sessionPlan : cas limites', () => {
  it('exerciseId inconnu : ligne écartée avec avertissement, les autres gardées', () => {
    const it0 = first(
      plan([
        { exerciseId: 'zzz-inconnu', sets: 3 },
        { exerciseId: 'plank', sets: 2 },
      ]),
    )
    expect(it0).toMatchObject({ kind: 'sessionPlan', plan: { unknownExerciseIds: ['zzz-inconnu'] } })
    if (it0.kind !== 'sessionPlan') return
    expect(it0.plan.blocks).toHaveLength(1)
    expect(it0.warnings.join(' ')).toContain('zzz-inconnu')
  })

  it('séries et répétitions absurdes : invalid, sans exception', () => {
    for (const bad of [
      { sets: 0 },
      { sets: 11 },
      { sets: -3 },
      { sets: 2.5 },
      { sets: 'beaucoup' },
      { sets: 1e9 },
      { sets: 3, reps: [0, 5] },
      { sets: 3, reps: [12, 8] },
      { sets: 3, reps: [1, 101] },
      { sets: 3, reps: 'plein' },
      { sets: 3, reps: [1e9, 1e9] },
    ]) {
      expect(first(plan([{ exerciseId: 'goblet-squat', ...bad }])).kind).toBe('invalid')
    }
  })

  it('durée 25 → 20 ou 30 avertie ; hors bornes ou texte : invalid', () => {
    const it0 = first(plan([{ exerciseId: 'plank', sets: 2 }], 25))
    expect(it0.kind).toBe('sessionPlan')
    if (it0.kind !== 'sessionPlan') return
    expect([20, 30]).toContain(it0.plan.durationMin)
    expect(it0.warnings.join(' ')).toContain('arrondie')
    for (const d of [0, -5, 500, 'longue'])
      expect(first(plan([{ exerciseId: 'plank', sets: 2 }], d)).kind).toBe('invalid')
  })

  it('loadKg : ignoré sur le poids du corps, négatif ou énorme invalide', () => {
    const it0 = first(plan([{ exerciseId: 'incline-push-up', sets: 3, loadKg: 10 }]))
    if (it0.kind !== 'sessionPlan') throw new Error()
    expect(it0.plan.blocks[0]?.loadKg).toBeUndefined()
    expect(it0.warnings.join(' ')).toContain('charge ignorée')
    for (const loadKg of [-4, 'lourd']) {
      expect(first(plan([{ exerciseId: 'goblet-squat', sets: 3, loadKg }])).kind).toBe('invalid')
    }
  })

  it('group non consécutif : pas de superset ; 3 lignes même group : un seul circuit de 3', () => {
    const a = first(
      plan([
        { exerciseId: 'goblet-squat', sets: 3, group: 1 },
        { exerciseId: 'plank', sets: 2, group: 2 },
        { exerciseId: 'incline-push-up', sets: 3, group: 1 },
      ]),
    )
    if (a.kind !== 'sessionPlan') throw new Error()
    expect(a.plan.blocks.map((b) => b.kind)).toEqual(['single', 'single', 'single'])
    expect(new Set(a.plan.blocks.map((b) => b.group)).size).toBe(3)
    const b = first(
      plan([
        { exerciseId: 'goblet-squat', sets: 3, group: 'A' },
        { exerciseId: 'plank', sets: 2, group: 'A' },
        { exerciseId: 'incline-push-up', sets: 3, group: 'A' },
      ]),
    )
    if (b.kind !== 'sessionPlan') throw new Error()
    expect(b.plan.blocks.map((x) => x.kind)).toEqual(['superset', 'superset', 'superset'])
    expect(new Set(b.plan.blocks.map((x) => x.group)).size).toBe(1)
  })

  it('deux sessionPlan valides : le premier est rejeté, le dernier applicable', () => {
    const items = parse(
      JSON.stringify([
        plan([{ exerciseId: 'plank', sets: 2 }]),
        plan([{ exerciseId: 'goblet-squat', sets: 3 }]),
      ]),
    )
    expect(items.map((i) => i.kind)).toEqual(['invalid', 'sessionPlan'])
  })

  it('blocks absent, vide ou non liste : invalid', () => {
    for (const blocks of [undefined, [], 'plank', {}]) {
      expect(
        first({ type: 'sessionPlan', durationMin: 30, ...(blocks === undefined ? {} : { blocks }) }).kind,
      ).toBe('invalid')
    }
  })
})

describe('exercisePreference : cas limites', () => {
  it('exercice inexistant : invalid ; nom reconnu sans accents : avertissement', () => {
    expect(first({ type: 'exercisePreference', exerciseId: 'fantome', preference: 'liked' }).kind).toBe(
      'invalid',
    )
    const it0 = first({ type: 'exercisePreference', exerciseId: 'pompes inclinees', preference: 'aimé' })
    expect(it0).toMatchObject({
      kind: 'exercisePreference',
      preference: { exerciseId: 'incline-push-up', preference: 'liked' },
    })
  })
})

describe('resolvePlanBlocks : décochage', () => {
  it('un exercice créé sur deux décoché : ligne retirée, groupes renumérotés cohérents', () => {
    const second = { ...NEW_EXO, name: 'Swing assis' }
    const items = parse(
      JSON.stringify([
        plan([
          { exerciseId: 'Hip thrust au sol KB', sets: 3, group: 1 },
          { exerciseId: 'Swing assis', sets: 3, group: 1 },
          { exerciseId: 'plank', sets: 2 },
        ]),
        NEW_EXO,
        second,
      ]),
    )
    const p = items[0]
    if (p?.kind !== 'sessionPlan') throw new Error()
    const resolved = resolvePlanBlocks(p.plan, new Map([[1, 'id-hip']]))
    expect(resolved.map((b) => b.exerciseId)).toEqual(['id-hip', 'plank'])
    expect(resolved.map((b) => b.kind)).toEqual(['single', 'single'])
    expect(resolved.some((b) => 'newExerciseIndex' in b)).toBe(false)
    expect(resolvePlanBlocks(p.plan, new Map())).toHaveLength(1)
  })
})
