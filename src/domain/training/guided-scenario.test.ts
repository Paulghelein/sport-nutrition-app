// Scénarios J4 : semaines simulées par le mode guidé (générer → commencer → saisir chaque série → terminer →
// appliquer la progression → jour suivant).
import { describe, expect, it } from 'vitest'
import type { Equipment } from '../../types/profile'
import type { ExerciseState, LibraryExercise, Session, SessionDuration, SetEntry } from '../../types/training'
import { addDays } from '../shared/dates'
import { completeSessionPlan } from './completion'
import { estimateSeconds } from './estimate'
import { generateSession } from './generate'
import { currentStep, recordSet, restAfter, sessionFromPlan, setAt } from './guided'
import { isAdjustable } from './loads'
import { historyItems, summarizeSession } from './summary'
import { DURATIONS, makeEquipment, makeInput, seedLibrary } from './testkit'
import { MAJOR_GROUPS, volumeTargets, weeklyVolume } from './volume'

const START = '2026-10-12'
const DAYS: Record<3 | 5, number[]> = { 3: [0, 2, 4], 5: [0, 1, 2, 3, 4] }

interface Run {
  sessions: Session[]
  states: ExerciseState[]
  estimates: number[]
  outcomesPerSession: { distinct: number; outcomes: number }[]
  rests: number
  records: number
}

function topInput(set: SetEntry): { reps?: number; durationSec?: number } {
  if (set.targetReps !== undefined) return { reps: set.targetReps[1] }
  return { durationSec: set.targetDurationSec ?? 30 }
}

function runWeeks(
  perWeek: 3 | 5,
  durationMin: SessionDuration,
  weeks = 2,
  equipment: Equipment = makeEquipment(),
): Run {
  const library: LibraryExercise[] = seedLibrary()
  const base = makeInput({ durationMin, equipment, library })
  const run: Run = { sessions: [], states: [], estimates: [], outcomesPerSession: [], rests: 0, records: 0 }
  for (let w = 0; w < weeks; w++) {
    for (const off of DAYS[perWeek]) {
      const date = addDays(START, w * 7 + off)
      const plan = generateSession({ ...base, date, sessions: run.sessions, states: run.states })
      run.estimates.push(estimateSeconds(plan.blocks, library, plan.warmupMin) / 60)
      const startedAt = `${date}T18:00:00.000Z`
      let s = sessionFromPlan(plan, { id: `s-${date}`, now: startedAt })
      for (let guard = 0; guard < 500; guard++) {
        const step = currentStep(s)
        if (step.kind === 'finished') break
        const set = setAt(s, step.cursor) as SetEntry
        const rest = restAfter(s, step.cursor, library)
        expect(rest.seconds).toBeGreaterThanOrEqual(0)
        run.rests += rest.seconds
        s = recordSet(s, step.cursor, { ...topInput(set), feeling: 'ok' })
      }
      expect(currentStep(s).kind).toBe('finished')
      const completion = completeSessionPlan({
        session: s,
        library,
        states: run.states,
        equipment,
        profileLevel: 1,
        now: `${date}T18:45:00.000Z`,
      })
      const distinct = new Set(s.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId))).size
      run.outcomesPerSession.push({ distinct, outcomes: completion.outcomes.length })
      run.records += summarizeSession(completion.session, library, run.sessions).records.length
      run.sessions = [...run.sessions, completion.session]
      const updated = new Map(run.states.map((x) => [x.exerciseId, x]))
      for (const st of completion.states) updated.set(st.exerciseId, st)
      run.states = [...updated.values()]
    }
  }
  return run
}

const library = seedLibrary()

describe.each([3, 5] as const)('mode guidé : %i séances par semaine', (perWeek) => {
  describe.each(DURATIONS)('%i min', (durationMin) => {
    const equipment = makeEquipment()
    const run = runWeeks(perWeek, durationMin, 2, equipment)

    it('durée estimée dans ± 10 % du budget', () => {
      for (const min of run.estimates) {
        expect(min).toBeGreaterThanOrEqual(durationMin * 0.9)
        expect(min).toBeLessThanOrEqual(durationMin * 1.1)
      }
    })

    it('une progression par exercice et par séance, appliquée une fois', () => {
      for (const { distinct, outcomes } of run.outcomesPerSession) expect(outcomes).toBe(distinct)
      for (const s of run.sessions) {
        expect(s.status).toBe('done')
        expect(s.progressionAppliedAt).toBeDefined()
        expect(s.cursor).toBeUndefined()
      }
      expect(historyItems(run.sessions)).toHaveLength(run.sessions.length)
    })

    it('le volume des grands groupes converge vers la cible', () => {
      const targets = volumeTargets({ volumeTargets: {}, deloadEveryWeeks: 6 }, equipment)
      const lastDay = run.sessions.at(-1)?.date ?? START
      const end = weeklyVolume(run.sessions, library, lastDay)
      for (const g of MAJOR_GROUPS) expect(end[g], g).toBeGreaterThanOrEqual(targets[g][0] / 2)
      const shortfall = MAJOR_GROUPS.reduce((a, g) => a + Math.max(0, targets[g][0] - end[g]), 0)
      const initial = MAJOR_GROUPS.reduce((a, g) => a + targets[g][0], 0)
      expect(shortfall).toBeLessThan(initial / 2)
    })

    it('charges toujours réglables, jamais plus d’un palier par séance', () => {
      for (const s of run.sessions)
        for (const se of s.blocks.flatMap((b) => b.exercises))
          for (const set of se.sets)
            if (set.loadKg !== undefined) expect(isAdjustable(set.loadKg, equipment.kettlebell)).toBe(true)
      for (const st of run.states)
        if (st.loadKg !== null) expect(isAdjustable(st.loadKg, equipment.kettlebell)).toBe(true)
      // D'une séance à l'autre, la charge prévue d'un exercice monte d'au plus 2 kg (palier hinge/squat/lunge).
      const last = new Map<string, number>()
      for (const s of run.sessions) {
        for (const se of s.blocks.flatMap((b) => b.exercises)) {
          const load = se.sets[0]?.loadKg
          if (load === undefined) continue
          const prev = last.get(se.exerciseId)
          if (prev !== undefined) expect(load - prev).toBeLessThanOrEqual(2)
          last.set(se.exerciseId, load)
        }
      }
    })
  })
})

describe('mode guidé : records', () => {
  it('des records apparaissent au fil des semaines (jamais à la première séance)', () => {
    const run = runWeeks(3, 30, 3)
    expect(run.records).toBeGreaterThan(0)
    const first = run.sessions[0] as Session
    expect(summarizeSession(first, library, run.sessions).records).toEqual([])
  })
})
