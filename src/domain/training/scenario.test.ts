// Scénarios : semaines simulées (générer → faire les séries → appliquer la progression → jour suivant).
import { describe, expect, it } from 'vitest'
import type { SessionPlan } from '../../types/engine'
import type { Equipment } from '../../types/profile'
import type {
  ExerciseState,
  Feeling,
  LibraryExercise,
  MuscleGroup,
  Session,
  SessionDuration,
} from '../../types/training'
import { addDays } from '../shared/dates'
import { estimateSeconds } from './estimate'
import { generateSession } from './generate'
import { isAdjustable } from './loads'
import { applySessionResult } from './progression'
import {
  DURATIONS,
  byId,
  completePlan,
  makeEquipment,
  makeInput,
  planExerciseIds,
  seedLibrary,
} from './testkit'
import { MAJOR_GROUPS, fatiguedGroups, volumeTargets, weeklyVolume } from './volume'

const START = '2026-10-12' // lundi
const DAYS: Record<3 | 5, number[]> = { 3: [0, 2, 4], 5: [0, 1, 2, 3, 4] }

interface Day {
  date: string
  plan: SessionPlan
  /** Groupes fatigués au moment de générer la séance. */
  fatigued: Set<MuscleGroup>
}

interface Sim {
  days: Day[]
  sessions: Session[]
  states: ExerciseState[]
}

function simulate(opts: {
  perWeek: 3 | 5
  durationMin: SessionDuration
  weeks?: number
  equipment?: Equipment
  library?: LibraryExercise[]
  feeling?: Feeling
}): Sim {
  const equipment = opts.equipment ?? makeEquipment()
  const library = opts.library ?? seedLibrary()
  const base = makeInput({ durationMin: opts.durationMin, equipment, library })
  let sessions: Session[] = []
  let states: ExerciseState[] = []
  const days: Day[] = []
  for (let w = 0; w < (opts.weeks ?? 3); w++) {
    for (const off of DAYS[opts.perWeek]) {
      const date = addDays(START, w * 7 + off)
      const fatigued = fatiguedGroups(sessions, library, date)
      const plan = generateSession({ ...base, date, sessions, states })
      days.push({ date, plan, fatigued })
      const session = completePlan(plan, `s-${date}`, opts.feeling ?? 'ok')
      sessions = [...sessions, session]
      for (const se of session.blocks.flatMap((b) => b.exercises)) {
        const exercise = byId(library, se.exerciseId)
        const before = states.find((s) => s.exerciseId === se.exerciseId)
        const { state } = applySessionResult({
          exercise,
          state: before,
          performed: se,
          equipment,
          library,
          date,
          profileLevel: 1,
          deload: session.deload,
        })
        states = [...states.filter((s) => s.exerciseId !== se.exerciseId), state]
      }
    }
  }
  return { days, sessions, states }
}

/** Séries manquantes sous la cible minimale, sommées sur les grands groupes. */
function majorShortfall(volume: Record<MuscleGroup, number>, equipment: Equipment): number {
  const targets = volumeTargets({ volumeTargets: {}, deloadEveryWeeks: 6 }, equipment)
  return MAJOR_GROUPS.reduce((acc, g) => acc + Math.max(0, targets[g][0] - volume[g]), 0)
}

const library = seedLibrary()

describe.each([3, 5] as const)('semaine simulée de %i séances', (perWeek) => {
  describe.each(DURATIONS)('%i min', (durationMin) => {
    for (const [label, equipment] of [
      ['matériel par défaut', makeEquipment()],
      ['avec barre de traction', makeEquipment(['mat', 'pullup_bar'])],
    ] as const) {
      const sim = simulate({ perWeek, durationMin, equipment })

      it(`${label} : durée estimée dans ± 10 %`, () => {
        for (const { plan, date } of sim.days) {
          const min = estimateSeconds(plan.blocks, library, plan.warmupMin) / 60
          expect(plan.deload).toBe(false)
          expect(min, date).toBeGreaterThanOrEqual(durationMin * 0.9)
          expect(min, date).toBeLessThanOrEqual(durationMin * 1.1)
        }
      })

      it(`${label} : le volume des grands groupes se rapproche de la cible`, () => {
        const start = majorShortfall(weeklyVolume([], library, START), equipment)
        const lastDay = sim.days[sim.days.length - 1]?.date ?? START
        const end = weeklyVolume(sim.sessions, library, lastDay)
        expect(majorShortfall(end, equipment)).toBeLessThan(start)
        const targets = volumeTargets({ volumeTargets: {}, deloadEveryWeeks: 6 }, equipment)
        for (const g of MAJOR_GROUPS) {
          // Chaque grand groupe reçoit au moins la moitié de sa cible minimale.
          expect(end[g], g).toBeGreaterThanOrEqual(targets[g][0] / 2)
          // Charge hebdomadaire modérée : pas plus de 1,5 × la cible haute.
          if (perWeek * durationMin <= 150) expect(end[g], g).toBeLessThanOrEqual(targets[g][1] * 1.5)
        }
      })

      it(`${label} : jamais deux fois le même schéma pour ≤ 30 min`, () => {
        if (durationMin > 30) return
        for (const { plan } of sim.days) {
          const patterns = planExerciseIds(plan).map((id) => byId(library, id).pattern)
          expect(new Set(patterns).size).toBe(patterns.length)
        }
      })

      it(`${label} : matériel respecté, charges réglables`, () => {
        for (const { plan } of sim.days) {
          for (const se of plan.blocks.flatMap((b) => b.exercises)) {
            const ex = byId(library, se.exerciseId)
            for (const need of ex.equipment)
              if (need !== 'kettlebell') expect(equipment.owned).toContain(need)
            for (const s of se.sets)
              if (s.loadKg !== undefined) expect(isAdjustable(s.loadKg, equipment.kettlebell)).toBe(true)
          }
        }
      })

      it(`${label} : un groupe fatigué (< 48 h) est mis en retrait`, () => {
        for (const { plan, fatigued } of sim.days) {
          const exs = planExerciseIds(plan).map((id) => byId(library, id))
          const hits = exs.map((ex) => ex.muscles.primary.some((g) => fatigued.has(g)))
          if (durationMin <= 45) {
            expect(hits.every((h) => !h)).toBe(true)
          } else {
            // 60 min : dernier recours seulement, après tous les autres exercices principaux.
            const main = plan.blocks.filter((b) => b.kind !== 'finisher').flatMap((b) => b.exercises)
            const firstHit = main.findIndex((e) =>
              byId(library, e.exerciseId).muscles.primary.some((g) => fatigued.has(g)),
            )
            if (firstHit >= 0) {
              expect(
                main
                  .slice(firstHit)
                  .every((e) => byId(library, e.exerciseId).muscles.primary.some((g) => fatigued.has(g))),
              ).toBe(true)
            }
          }
        }
      })
    }
  })
})

describe('scénarios ciblés', () => {
  it('séance de la veille lourde en jambes → pas de jambes en primaire le lendemain (5 × 30 min)', () => {
    const sim = simulate({ perWeek: 5, durationMin: 30, weeks: 1 })
    for (let i = 1; i < sim.days.length; i++) {
      const prev = sim.days[i - 1] as Day
      const today = sim.days[i] as Day
      const legsYesterday = planExerciseIds(prev.plan)
        .map((id) => byId(library, id))
        .filter((ex) => ex.muscles.primary.includes('quads'))
        .reduce(
          (acc, ex) =>
            acc +
            (prev.plan.blocks.flatMap((b) => b.exercises).find((e) => e.exerciseId === ex.id)?.sets.length ??
              0),
          0,
        )
      if (legsYesterday >= 4) {
        const quadsToday = planExerciseIds(today.plan).some((id) =>
          byId(library, id).muscles.primary.includes('quads'),
        )
        expect(quadsToday).toBe(false)
      }
    }
  })

  it('préférences : hidden jamais, liked plus souvent, disliked moins souvent', () => {
    const neutral = simulate({ perWeek: 5, durationMin: 45, weeks: 2 })
    const prefLib = seedLibrary({
      'half-kneeling-press': 'hidden',
      'box-goblet-squat': 'liked',
      'kb-deadlift': 'disliked',
    })
    const pref = simulate({ perWeek: 5, durationMin: 45, weeks: 2, library: prefLib })
    const count = (sim: Sim, id: string): number =>
      sim.days.filter((d) => planExerciseIds(d.plan).includes(id)).length
    expect(count(pref, 'half-kneeling-press')).toBe(0)
    expect(count(pref, 'box-goblet-squat')).toBeGreaterThan(count(neutral, 'box-goblet-squat'))
    expect(count(pref, 'kb-deadlift')).toBeLessThan(count(neutral, 'kb-deadlift'))
  })

  it('la progression monte les charges au fil des semaines sans dépasser le max', () => {
    const sim = simulate({ perWeek: 3, durationMin: 30, weeks: 3 })
    const row = sim.states.find((s) => s.exerciseId === 'supported-one-arm-row')
    expect(row?.loadKg).toBeGreaterThan(12)
    for (const s of sim.states) if (s.loadKg !== null) expect(s.loadKg).toBeLessThanOrEqual(24)
  })

  it('séances majoritairement hard → deload à la 4e séance : séries réduites, charges inchangées', () => {
    const sim = simulate({ perWeek: 5, durationMin: 30, weeks: 1, feeling: 'hard' })
    const [d1, d2, d3, d4] = sim.days
    expect([d1, d2, d3].map((d) => d?.plan.deload)).toEqual([false, false, false])
    expect(d4?.plan.deload).toBe(true)
    for (const se of d4?.plan.blocks.flatMap((b) => b.exercises) ?? []) expect(se.sets.length).toBe(2)
  })

  it('déterminisme : la même semaine simulée deux fois donne les mêmes séances', () => {
    for (const d of DURATIONS) {
      const a = simulate({ perWeek: 5, durationMin: d, weeks: 1 })
      const b = simulate({ perWeek: 5, durationMin: d, weeks: 1 })
      expect(b.days.map((x) => x.plan)).toEqual(a.days.map((x) => x.plan))
      expect(b.states).toEqual(a.states)
    }
  })
})
