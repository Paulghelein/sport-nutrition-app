import { describe, expect, it } from 'vitest'
import type { Session, SessionExercise, SetEntry } from '../../types'
import { defaultReps, nextDetail, stepType, stepWindow, targetSummary } from './guidedInfo'
import type { StepInfo } from './guidedInfo'
import { doneText, effectiveType, exerciseText, lastLoadKg, loadIncrease } from './prescription'

const se = (sets: SetEntry[], extra: Partial<SessionExercise> = {}): SessionExercise => ({
  exerciseId: 'x',
  restSec: 60,
  sets,
  ...extra,
})

describe('effectiveType', () => {
  it('lit le type via setTypeOf : timedMax a un targetDurationSec mais n’est pas une série en durée', () => {
    expect(effectiveType({ setType: 'timedMax', targetDurationSec: 45 })).toBe('timedMax')
    expect(effectiveType({ targetDurationSec: 30 })).toBe('time')
    expect(effectiveType({ targetReps: [8, 12] })).toBe('reps')
    expect(effectiveType({ setType: 'amrap', targetReps: [8, 12] })).toBe('amrap')
  })
  it('timedMax sans fenêtre : série normale ; cible absente sur un exercice en durée : time', () => {
    expect(effectiveType({ setType: 'timedMax', targetReps: [8, 12] })).toBe('reps')
    expect(effectiveType({}, { durationRange: [30, 45] })).toBe('time')
  })
})

describe('exerciseText', () => {
  it('reps, hausse et côté', () => {
    const t = exerciseText(se(Array(4).fill({ targetReps: [8, 12], loadKg: 18 })), {
      unilateral: true,
    } as never)
    expect(t.summary).toBe('4 × 8–12')
    expect(t.details).toEqual(['18 kg', 'chaque côté'])
  })
  it('dernière série max et max en temps fixe', () => {
    const amrap = exerciseText(
      se([{ targetReps: [8, 12] }, { targetReps: [8, 12] }, { targetReps: [8, 12], setType: 'amrap' }]),
      undefined,
    )
    expect(amrap.summary).toBe('3 × 8–12')
    expect(amrap.details).toContain('dernière série : max')
    const timed = exerciseText(se([{ setType: 'timedMax', targetDurationSec: 45, loadKg: 16 }]), undefined)
    expect(timed.summary).toBe('1 × max en 45 s')
  })
  it('durée', () => {
    expect(exerciseText(se([{ targetDurationSec: 40 }, { targetDurationSec: 40 }]), undefined).summary).toBe(
      '2 × 40 s',
    )
  })
})

describe('charge', () => {
  const done = (date: string, kg: number): Session =>
    ({
      id: date,
      date,
      status: 'done',
      blocks: [
        { id: 'b', kind: 'single', exercises: [se([{ status: 'done', loadKg: kg, actualReps: 10 }])] },
      ],
    }) as unknown as Session
  it('dernière charge = séance terminée la plus récente ; hausse affichée seulement si supérieure', () => {
    const sessions = [done('2026-10-01', 16), done('2026-10-08', 17)]
    expect(lastLoadKg(sessions, 'x')).toBe(17)
    expect(loadIncrease(18, 17)).toBe('+1 kg')
    expect(loadIncrease(17, 17)).toBeUndefined()
    expect(loadIncrease(18, undefined)).toBeUndefined()
  })
})

describe('doneText et type affiché en séance', () => {
  it('résumés des séries faites', () => {
    expect(doneText({ targetReps: [8, 12], loadKg: 18, actualReps: 10 })).toBe('18 kg × 10')
    expect(doneText({ setType: 'amrap', targetReps: [8, 12], actualReps: 14 })).toBe('max : 14 reps')
    expect(doneText({ setType: 'timedMax', targetDurationSec: 45, actualReps: 24, loadKg: 16 })).toBe(
      '16 kg · 24 reps en 45 s',
    )
  })
  it('stepType / stepWindow / targetSummary via setTypeOf', () => {
    const info = (set: SetEntry) =>
      ({ set, exercise: undefined, cursor: { block: 0, exercise: 0, set: 0 } }) as unknown as StepInfo
    const tm = info({ setType: 'timedMax', targetDurationSec: 45 })
    expect(stepType(tm)).toBe('timedMax')
    expect(stepWindow(tm)).toBe(45)
    expect(targetSummary(tm)).toBe('max en 45 s')
    expect(targetSummary(info({ setType: 'amrap', targetReps: [8, 12] }))).toBe('max')
    expect(targetSummary(info({ targetDurationSec: 30 }))).toBe('30 s')
    expect(stepWindow(info({ targetDurationSec: 30 }))).toBeUndefined()
  })
})

describe('carte « Ensuite » et préremplissage du temps fixe', () => {
  const base = { cursor: { block: 0, exercise: 0, set: 0 }, exercise: undefined } as const
  it('nextDetail : reps avec charge, max, temps fixe, côté', () => {
    const i = (set: SetEntry, extra: object = {}) => ({ ...base, set, ...extra }) as unknown as StepInfo
    expect(nextDetail(i({ targetReps: [8, 12], loadKg: 18 }))).toBe('18 kg × 8–12 reps')
    expect(nextDetail(i({ targetReps: [8, 12] }, { exercise: { unilateral: true } }))).toBe(
      '8–12 reps par côté',
    )
    expect(nextDetail(i({ setType: 'amrap', targetReps: [8, 12] }))).toBe('max')
    expect(nextDetail(i({ setType: 'timedMax', targetDurationSec: 45, loadKg: 16 }))).toBe(
      '16 kg · max en 45 s',
    )
  })
  it('timedMax : prérempli au record (même fenêtre, même charge), sinon 0', () => {
    const set: SetEntry = { setType: 'timedMax', targetDurationSec: 45, loadKg: 16 }
    const info = (state: object | undefined) =>
      ({ ...base, set, se: { sets: [set] }, state }) as unknown as StepInfo
    const st = { loadKg: 16, timedMaxBestReps: 24, timedMaxSec: 45 }
    expect(defaultReps(info(st))).toBe(24)
    expect(defaultReps(info({ ...st, timedMaxSec: 30 }))).toBe(0)
    expect(defaultReps(info({ ...st, loadKg: 14 }))).toBe(0)
    expect(defaultReps(info(undefined))).toBe(0)
  })
})
