// Scénarios F3 : semaines simulées avec séries AMRAP et max en temps fixe
// (générer → faire les séries → terminer la séance → jour suivant).
import { describe, expect, it } from 'vitest'
import type { SessionPlan } from '../../types/engine'
import type { TrainingLevel } from '../../types/profile'
import type { EngineSettings } from '../../types/settings'
import type {
  ExerciseState,
  Feeling,
  LibraryExercise,
  Session,
  SessionDuration,
  SessionSuggestion,
  SetEntry,
} from '../../types/training'
import { addDays, daysBetween } from '../shared/dates'
import { acceptSuggestion, completeSessionPlan } from './completion'
import { estimateSeconds } from './estimate'
import { generateSession } from './generate'
import { isAdjustable } from './loads'
import { applySessionResult } from './progression'
import { AMRAP_RATIO, canAmrap, canTimedMax, setTypeOf } from './setTypes'
import { summarizeSession } from './summary'
import { DURATIONS, T0, byId, defaultSettings, makeEquipment, makeInput, must, seedLibrary } from './testkit'

const START = '2026-10-12' // lundi
const DAYS: Record<3 | 5, number[]> = { 3: [0, 2, 4], 5: [0, 1, 2, 3, 4] }
const equipment = makeEquipment()

interface Day {
  date: string
  plan: SessionPlan
  /** États avant la séance. */
  before: ExerciseState[]
  /** États après la séance. */
  after: ExerciseState[]
  suggestions: SessionSuggestion[]
}

interface SimOptions {
  perWeek: 3 | 5
  durationMin: SessionDuration
  weeks?: number
  library?: LibraryExercise[]
  profileLevel?: TrainingLevel
  settings?: EngineSettings
  feeling?: Feeling
  /** Reps faites sur une AMRAP (défaut : haut de la fourchette + 2, sous le seuil de +30 %). */
  amrapReps?: (top: number) => number
  /** Reps faites sur une série en temps fixe, selon le numéro de la séance (défaut : 20 + n). */
  timedReps?: (sessionIndex: number) => number
}

/** Séance faite : séries normales au haut de la fourchette, AMRAP et temps fixe selon les options. */
function perform(plan: SessionPlan, id: string, index: number, opts: SimOptions): Session {
  const feeling = opts.feeling ?? 'ok'
  const doSet = (s: SetEntry): SetEntry => {
    const done: SetEntry = { ...s, status: 'done', feeling }
    const type = setTypeOf(s)
    if (type === 'amrap') done.actualReps = (opts.amrapReps ?? ((t) => t + 2))(must(s.targetReps)[1])
    else if (type === 'timedMax') {
      done.actualReps = (opts.timedReps ?? ((n) => 20 + n))(index)
      done.actualDurationSec = s.targetDurationSec
    } else if (s.targetReps !== undefined) done.actualReps = s.targetReps[1]
    else if (s.targetDurationSec !== undefined) done.actualDurationSec = s.targetDurationSec
    return done
  }
  return {
    id,
    date: plan.date,
    durationMin: plan.durationMin,
    status: 'in_progress',
    warmup: plan.warmup,
    warmupMin: plan.warmupMin,
    blocks: plan.blocks.map((b) => ({
      ...b,
      exercises: b.exercises.map((e) => ({ ...e, sets: e.sets.map(doSet) })),
    })),
    deload: plan.deload,
    estimatedMin: plan.estimatedMin,
    startedAt: `${plan.date}T08:00:00.000Z`,
    updatedAt: T0,
  }
}

function simulate(opts: SimOptions): { days: Day[]; sessions: Session[]; library: LibraryExercise[] } {
  const library = opts.library ?? seedLibrary()
  const profileLevel = opts.profileLevel ?? 1
  const base = makeInput({
    durationMin: opts.durationMin,
    library,
    profileLevel,
    equipment,
    settings: opts.settings ?? defaultSettings(),
  })
  let sessions: Session[] = []
  let states: ExerciseState[] = []
  const days: Day[] = []
  let index = 0
  for (let w = 0; w < (opts.weeks ?? 3); w++) {
    for (const off of DAYS[opts.perWeek]) {
      const date = addDays(START, w * 7 + off)
      const plan = generateSession({ ...base, date, sessions, states })
      const now = `${date}T09:00:00.000Z`
      const out = completeSessionPlan({
        session: perform(plan, `s-${date}`, index++, opts),
        library,
        states,
        equipment,
        profileLevel,
        now,
      })
      const before = states
      const changed = new Set(out.states.map((s) => s.exerciseId))
      states = [...states.filter((s) => !changed.has(s.exerciseId)), ...out.states]
      sessions = [...sessions, out.session]
      days.push({ date, plan, before, after: states, suggestions: out.suggestions })
    }
  }
  return { days, sessions, library }
}

const allSets = (plan: SessionPlan) =>
  plan.blocks.flatMap((b) => b.exercises.flatMap((e) => e.sets.map((s) => ({ b, e, s }))))

const amrapsOf = (plan: SessionPlan) => allSets(plan).filter((x) => setTypeOf(x.s) === 'amrap')

/** Bibliothèque où les swings servent de finisher (portés masqués) : temps fixe à 60 min. */
const swingLibrary = () =>
  seedLibrary({
    'farmer-carry': 'hidden',
    'suitcase-carry': 'hidden',
    'rack-carry': 'hidden',
    'two-hand-swing': 'disliked',
  })

describe.each([3, 5] as const)('F3 — semaine simulée de %i séances', (perWeek) => {
  describe.each(DURATIONS)('%i min', (durationMin) => {
    for (const [label, profileLevel, lib] of [
      ['débutant', 1, seedLibrary()],
      ['intermédiaire, swings en finisher', 2, swingLibrary()],
    ] as const) {
      const sim = simulate({ perWeek, durationMin, profileLevel, library: lib })

      it(`${label} : au plus une AMRAP par séance, sur la dernière série d'un exercice admissible fait ≥ 2 fois`, () => {
        for (const { plan, before, date } of sim.days) {
          const amraps = amrapsOf(plan)
          expect(amraps.length, date).toBeLessThanOrEqual(1)
          for (const { b, e, s } of amraps) {
            const ex = byId(sim.library, e.exerciseId)
            expect(canAmrap(ex), ex.id).toBe(true)
            expect(ex.loadType).toBe('bodyweight')
            expect(ex.finisher === true || ex.learnUnloaded === true).toBe(false)
            expect(b.kind).not.toBe('finisher')
            expect(e.sets.at(-1)).toBe(s)
            expect(before.find((x) => x.exerciseId === ex.id)?.recentFeelings.length).toBeGreaterThanOrEqual(
              2,
            )
          }
        }
      })

      it(`${label} : jamais d'AMRAP deux jours de suite`, () => {
        const dates = sim.days.filter((d) => amrapsOf(d.plan).length > 0).map((d) => d.date)
        for (let i = 1; i < dates.length; i++)
          expect(daysBetween(must(dates[i - 1]), must(dates[i]))).toBeGreaterThanOrEqual(2)
      })

      it(`${label} : temps fixe seulement en finisher sur un swing (exercice finisher en répétitions)`, () => {
        for (const { plan } of sim.days) {
          for (const { b, e, s } of allSets(plan)) {
            if (setTypeOf(s) !== 'timedMax') continue
            expect(b.kind).toBe('finisher')
            expect(canTimedMax(byId(sim.library, e.exerciseId))).toBe(true)
            expect(s.targetDurationSec).toBeGreaterThanOrEqual(30)
            expect(s.targetDurationSec).toBeLessThanOrEqual(45)
          }
        }
      })

      it(`${label} : durée estimée dans ± 10 % avec les nouveaux types`, () => {
        for (const { plan, date } of sim.days) {
          const min = estimateSeconds(plan.blocks, sim.library, plan.warmupMin) / 60
          expect(min, date).toBeGreaterThanOrEqual(durationMin * 0.9)
          expect(min, date).toBeLessThanOrEqual(durationMin * 1.1)
        }
      })

      it(`${label} : charges réglables, jamais plus d'un palier de hausse par séance`, () => {
        for (const { plan, before, after } of sim.days) {
          for (const { s } of allSets(plan))
            if (s.loadKg !== undefined) expect(isAdjustable(s.loadKg, equipment.kettlebell)).toBe(true)
          for (const st of after) {
            const prev = before.find((x) => x.exerciseId === st.exerciseId)
            if (prev?.loadKg == null || st.loadKg === null) continue
            const step = byId(sim.library, st.exerciseId).loadStepKg
            expect(st.loadKg - prev.loadKg).toBeLessThanOrEqual(step)
          }
        }
      })
    }
  })
})

describe('F3 — scénarios ciblés', () => {
  it('les AMRAP apparaissent bien (pas à chaque séance) dans une semaine de 5 × 45 min', () => {
    const sim = simulate({ perWeek: 5, durationMin: 45, weeks: 2 })
    const withAmrap = sim.days.filter((d) => amrapsOf(d.plan).length > 0).length
    expect(withAmrap).toBeGreaterThan(0)
    expect(withAmrap).toBeLessThan(sim.days.length)
  })

  it('deload programmé : ni AMRAP ni temps fixe pendant la semaine allégée', () => {
    const sim = simulate({
      perWeek: 5,
      durationMin: 60,
      weeks: 3,
      profileLevel: 2,
      library: swingLibrary(),
      settings: defaultSettings({ deloadEveryWeeks: 1 }),
    })
    const deloads = sim.days.filter((d) => d.plan.deload)
    expect(deloads.length).toBeGreaterThan(0)
    for (const { plan } of deloads) {
      expect(allSets(plan).some(({ s }) => s.setType !== undefined)).toBe(false)
    }
    // Hors deload, la fonctionnalité reste utilisée.
    expect(
      sim.days.some((d) => !d.plan.deload && allSets(d.plan).some(({ s }) => s.setType !== undefined)),
    ).toBe(true)
  })

  // Bornes de la variante (profil + 1, jamais le TGU) : tests unitaires (settypes.test.ts).
  it('AMRAP > +30 % → level_up proposé à la fin de la séance, accepté → variante débloquée', () => {
    const sim = simulate({
      perWeek: 5,
      durationMin: 45,
      weeks: 2,
      amrapReps: (top) => Math.ceil(top * AMRAP_RATIO) + 1,
    })
    let seen = 0
    for (const day of sim.days) {
      const amrap = amrapsOf(day.plan)[0]
      if (amrap === undefined) continue
      const sug = day.suggestions.find((s) => s.exerciseId === amrap.e.exerciseId)
      // Variante déjà débloquée lors d'une séance précédente : suggestion retirée (completeSessionPlan).
      if (sug === undefined) continue
      seen++
      expect(sug.kind).toBe('level_up')
      const target = byId(sim.library, must(sug.toExerciseId))
      const unlocked = acceptSuggestion(sug, {
        library: sim.library,
        states: day.before,
        equipment,
        date: day.date,
        now: T0,
      })
      expect(unlocked?.exerciseId).toBe(target.id)
    }
    expect(seen).toBeGreaterThan(0)
  })

  // Règle détaillée (seuil, record égalé, 2 séances, remise à zéro) : tests unitaires (settypes.test.ts).
  it('temps fixe sur 4 semaines : record suivi puis charge augmentée', () => {
    const sim = simulate({ perWeek: 5, durationMin: 60, weeks: 4, profileLevel: 2, library: swingLibrary() })
    const swingDays = sim.days.filter((d) =>
      d.plan.blocks.some(
        (b) => b.kind === 'finisher' && b.exercises.some((e) => e.exerciseId === 'two-hand-swing'),
      ),
    )
    expect(swingDays.length).toBeGreaterThanOrEqual(3)
    const swingState = (list: ExerciseState[]) => list.find((s) => s.exerciseId === 'two-hand-swing')
    expect(swingDays.some((d) => swingState(d.after)?.timedMaxBestReps !== undefined)).toBe(true)
    const first = swingState(must(swingDays[0]).before)?.loadKg ?? 12
    const last = must(swingState(must(swingDays.at(-1)).after)).loadKg ?? 0
    expect(last).toBeGreaterThan(first)
  })
})

describe('F3 — anciennes séances sans setType', () => {
  /** Historique « v1 » : séries sans setType (AMRAP et temps fixe retirés, cibles d'origine). */
  const legacy = (): { sessions: Session[]; library: LibraryExercise[] } => {
    const sim = simulate({ perWeek: 5, durationMin: 45, weeks: 2 })
    const strip = (s: SetEntry): SetEntry => {
      const { setType, ...rest } = s
      void setType
      return rest
    }
    return {
      library: sim.library,
      sessions: sim.sessions.map((s) => ({
        ...s,
        blocks: s.blocks.map((b) => ({
          ...b,
          exercises: b.exercises.map((e) => ({
            ...e,
            sets: e.sets.filter((x) => x.setType !== 'timedMax').map(strip),
          })),
        })),
      })),
    }
  }
  /** Même historique avec le type déduit écrit explicitement. */
  const explicit = (sessions: Session[]): Session[] =>
    sessions.map((s) => ({
      ...s,
      blocks: s.blocks.map((b) => ({
        ...b,
        exercises: b.exercises.map((e) => ({
          ...e,
          sets: e.sets.map((x) => ({ ...x, setType: setTypeOf(x) })),
        })),
      })),
    }))

  it('progression, records et estimation identiques avec le type absent ou déduit explicitement', () => {
    const { sessions, library } = legacy()
    const typed = explicit(sessions)
    expect(
      typed
        .flatMap((s) => s.blocks.flatMap((b) => b.exercises.flatMap((e) => e.sets)))
        .every((x) => x.setType === 'reps' || x.setType === 'time'),
    ).toBe(true)

    const replay = (list: Session[]): ExerciseState[] => {
      let states: ExerciseState[] = []
      for (const s of list) {
        for (const se of s.blocks.flatMap((b) => b.exercises)) {
          const { state } = applySessionResult({
            exercise: byId(library, se.exerciseId),
            state: states.find((x) => x.exerciseId === se.exerciseId),
            performed: se,
            equipment,
            library,
            date: s.date,
            profileLevel: 1,
            deload: s.deload,
          })
          states = [...states.filter((x) => x.exerciseId !== se.exerciseId), state]
        }
      }
      return states
    }
    const a = replay(sessions)
    expect(replay(typed)).toEqual(a)
    // Aucun record de temps fixe sur un historique v1.
    expect(a.some((s) => s.timedMaxBestReps !== undefined || s.timedMaxSec !== undefined)).toBe(false)

    sessions.forEach((s, i) => {
      const t = must(typed[i])
      expect(summarizeSession(t, library, typed).records).toEqual(
        summarizeSession(s, library, sessions).records,
      )
      expect(estimateSeconds(t.blocks, library, 5)).toBe(estimateSeconds(s.blocks, library, 5))
    })
  })

  it('un historique v1 ne bloque pas l’AMRAP du jour (aucune AMRAP lue sans setType)', () => {
    const { sessions, library } = legacy()
    const last = must(sessions.at(-1))
    const states = library.filter(canAmrap).map((e) => ({
      exerciseId: e.id,
      loadKg: null,
      recentFeelings: ['ok' as const, 'ok' as const],
      lastPerformedOn: last.date,
      updatedAt: T0,
    }))
    const plan = generateSession(
      makeInput({ durationMin: 45, library, sessions, states, date: addDays(last.date, 1) }),
    )
    if (plan.deload) return
    if (plan.blocks.some((b) => b.exercises.some((e) => canAmrap(byId(library, e.exerciseId)))))
      expect(amrapsOf(plan).length).toBe(1)
  })
})
