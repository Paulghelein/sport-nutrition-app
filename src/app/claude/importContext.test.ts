import { describe, expect, it } from 'vitest'
import type { ExerciseInput } from '../../types'
import { makeEquipment, makeInput } from '../../domain/training/testkit'
import { buildImportContext, newExerciseIssueFor } from './importContext'

const exo = (over: Partial<ExerciseInput>): ExerciseInput =>
  ({ name: 'X', pattern: 'hinge', level: 1, equipment: [], ...over }) as ExerciseInput

describe('newExerciseIssueFor', () => {
  const levels = { hinge: 1, squat: 2 } as never
  it('ok / matériel / niveau', () => {
    const f = newExerciseIssueFor(levels, makeEquipment(['mat']))
    expect(f(exo({}))).toBeNull()
    expect(f(exo({ equipment: ['pullup_bar'] }))).toBe('matériel manquant')
    expect(f(exo({ level: 2 }))).toContain('niveau 2')
    expect(f(exo({ pattern: 'squat', level: 2 }))).toBeNull()
  })
})

describe('buildImportContext', () => {
  const engine = makeInput()
  const ctx = buildImportContext({
    today: '2026-10-16',
    ciqual: [],
    engine,
    validateRecipe: () => null,
    validateEntry: () => null,
    validateExercise: () => null,
  })
  it('bibliothèque, kettlebell, date', () => {
    expect(ctx.today).toBe('2026-10-16')
    expect(ctx.exercises?.length).toBe(engine.library.length)
    expect(ctx.kettlebell).toEqual(engine.equipment.kettlebell)
  })
  it('planIssues signale un exercice inconnu', () => {
    const issues = ctx.planIssues?.([{ exerciseId: 'nope', sets: 3, restSec: 60 }]) ?? []
    expect(issues).toEqual([{ exerciseId: 'nope', message: 'n’existe plus' }])
  })
})
