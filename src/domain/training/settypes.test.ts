// Types de séries (v2, F3) : AMRAP et max en temps fixe — règles unitaires.
import { describe, expect, it } from 'vitest'
import type {
  ExerciseState,
  Feeling,
  Session,
  SessionBlock,
  SessionExercise,
  SessionTemplate,
  MuscleGroup,
  SetEntry,
  TemplateBlock,
} from '../../types/training'
import { setWorkSeconds } from './estimate'
import { generateSession } from './generate'
import { recordSet, skipSet, undoSet } from './guided'
import { applySessionResult, type SessionResultParams } from './progression'
import {
  AMRAP_RATIO,
  amrapAllowed,
  amrapEligible,
  asTimedMax,
  canAmrap,
  canTimedMax,
  placeAmrap,
  recentAmrap,
  setTypeOf,
  timedMaxThreshold,
  timedMaxWindowOf,
  timedMaxWindowSec,
  withLastSetAmrap,
} from './setTypes'
import { summarizeSession } from './summary'
import { planFromTemplate, templateFromSession, templateTargetNotes } from './templates'
import {
  T0,
  byId,
  defaultSettings,
  exAt,
  makeEquipment,
  makeInput,
  makeState,
  must,
  seedLibrary,
} from './testkit'

const library = seedLibrary()
const equipment = makeEquipment()
const DATE = '2026-10-15'

/** Exercices de départ avec le drapeau `amrap` (échec technique sûr). */
const AMRAP_IDS = ['australian-row', 'bodyweight-squat', 'incline-push-up', 'pull-up', 'push-up']
const AMRAP_EXERCISES = library.filter(canAmrap)

function amrapCount(blocks: readonly SessionBlock[]): number {
  return blocks.reduce(
    (a, b) => a + b.exercises.reduce((n, e) => n + e.sets.filter((s) => setTypeOf(s) === 'amrap').length, 0),
    0,
  )
}

function se(exerciseId: string, sets: SetEntry[], over: Partial<SessionExercise> = {}): SessionExercise {
  return { exerciseId, restSec: 60, sets, ...over }
}

function session(date: string, blocks: SessionBlock[], over: Partial<Session> = {}): Session {
  return {
    id: `s-${date}`,
    date,
    durationMin: 45,
    status: 'done',
    warmup: [],
    blocks,
    deload: false,
    estimatedMin: 45,
    updatedAt: T0,
    ...over,
  }
}

const performedState = (id: string, over: Partial<ExerciseState> = {}): ExerciseState =>
  makeState(id, { lastPerformedOn: '2026-10-10', recentFeelings: ['ok', 'ok'], ...over })

/** États « déjà fait 2 fois » pour tous les exercices au poids du corps en répétitions. */
const bwStates = (): ExerciseState[] =>
  library
    .filter((e) => e.loadType === 'bodyweight' && e.repRange !== undefined)
    .map((e) => performedState(e.id))

// ---------------------------------------------------------------------------------------------------------------

describe('setTypeOf : anciennes données sans setType', () => {
  it('absent → reps si targetReps, time si durée seule, reps sinon ; explicite lu tel quel', () => {
    expect(setTypeOf({ targetReps: [8, 12] })).toBe('reps')
    expect(setTypeOf({ targetDurationSec: 30 })).toBe('time')
    expect(setTypeOf({ targetReps: [8, 12], targetDurationSec: 30 })).toBe('reps')
    expect(setTypeOf({})).toBe('reps')
    expect(setTypeOf({ setType: 'amrap', targetReps: [8, 12] })).toBe('amrap')
    expect(setTypeOf({ setType: 'timedMax', targetDurationSec: 45 })).toBe('timedMax')
  })

  it('estimation inchangée pour une série sans setType (reps milieu × 3 s ou durée)', () => {
    const ex = byId(library, 'incline-push-up')
    expect(setWorkSeconds({ targetReps: [8, 12] }, ex)).toBe(30)
    expect(setWorkSeconds({ targetDurationSec: 40 }, byId(library, 'plank'))).toBe(40)
    expect(setWorkSeconds({ targetReps: [8, 12], setType: 'reps' }, ex)).toBe(30)
  })
})

describe('admissibilité', () => {
  it('AMRAP : drapeau amrap seulement (pompes, squat, rowing australien, tractions), jamais les autres', () => {
    expect(AMRAP_EXERCISES.map((e) => e.id).sort()).toEqual(AMRAP_IDS)
    for (const id of [
      'negative-pull-up',
      'dead-bug',
      'calf-raise',
      'single-leg-calf-raise',
      'reverse-lunge-bw',
      'pike-push-up',
      'archer-push-up',
      'decline-push-up',
      'diamond-push-up',
      'goblet-squat',
      'two-hand-swing',
      'one-hand-swing',
      'turkish-get-up',
      'plank',
      'farmer-carry',
    ])
      expect(canAmrap(byId(library, id)), id).toBe(false)
    // Le drapeau seul ne suffit pas : kettlebell exclu.
    expect(canAmrap({ ...byId(library, 'goblet-squat'), amrap: true })).toBe(false)
    // Exercice perso au poids du corps sans drapeau : jamais d'AMRAP.
    const { amrap, ...custom } = byId(library, 'bodyweight-squat')
    void amrap
    expect(canAmrap({ ...custom, id: 'b6f1c2d4-0000-4000-8000-000000000001', source: 'user' })).toBe(false)
    // Un exercice perso au poids du corps marqué finisher (balistique) : exclu.
    expect(canAmrap({ ...byId(library, 'bodyweight-squat'), finisher: true })).toBe(false)
    expect(canAmrap({ ...byId(library, 'bodyweight-squat'), learnUnloaded: true })).toBe(false)
  })

  it('temps fixe : finisher bilatéral en répétitions (swing deux mains), jamais unilatéral, porté ni TGU', () => {
    expect(canTimedMax(byId(library, 'two-hand-swing'))).toBe(true)
    for (const id of [
      'one-hand-swing',
      'farmer-carry',
      'suitcase-carry',
      'turkish-get-up',
      'push-up',
      'kb-deadlift',
    ])
      expect(canTimedMax(byId(library, id)), id).toBe(false)
  })

  it('amrapEligible : fait ≥ 2 fois, dernier ressenti pas hard, groupe reposé, ≥ 2 séries, sans tempo, hors finisher', () => {
    const ex = byId(library, 'incline-push-up')
    const ok = se(ex.id, [{ targetReps: [8, 15] }, { targetReps: [8, 15] }])
    const single: SessionBlock = { id: 'b1', kind: 'single', exercises: [ok] }
    expect(amrapEligible(ex, ok, single, performedState(ex.id))).toBe(true)
    expect(amrapEligible(ex, ok, single, undefined)).toBe(false)
    expect(amrapEligible(ex, ok, single, makeState(ex.id))).toBe(false)
    // Une seule séance faite : pas encore.
    expect(amrapEligible(ex, ok, single, performedState(ex.id, { recentFeelings: ['ok'] }))).toBe(false)
    // Groupe primaire fatigué (< 48 h) : jamais d'échec.
    expect(amrapEligible(ex, ok, single, performedState(ex.id), new Set(['chest']))).toBe(false)
    expect(amrapEligible(ex, ok, single, performedState(ex.id, { recentFeelings: ['ok', 'hard'] }))).toBe(
      false,
    )
    const one = se(ex.id, [{ targetReps: [8, 15] }])
    expect(amrapEligible(ex, one, single, performedState(ex.id))).toBe(false)
    const tempo = { ...ok, tempo: '3-1-1' }
    expect(amrapEligible(ex, tempo, single, performedState(ex.id))).toBe(false)
    expect(amrapEligible(ex, ok, { ...single, kind: 'finisher' }, performedState(ex.id))).toBe(false)
    // Superset permis (dernière série = dernier tour, ordre de passage inchangé).
    expect(amrapEligible(ex, ok, { ...single, kind: 'superset' }, performedState(ex.id))).toBe(true)
  })

  it('pas d’AMRAP en deload, ni si une AMRAP a été faite aujourd’hui ou hier', () => {
    const amrapDone = (date: string, status: Session['status'] = 'done', set: Partial<SetEntry> = {}) =>
      session(
        date,
        [
          {
            id: 'b1',
            kind: 'single',
            exercises: [se('push-up', [{ setType: 'amrap', status: 'done', actualReps: 12, ...set }])],
          },
        ],
        { status },
      )
    expect(amrapAllowed([], DATE, false)).toBe(true)
    expect(amrapAllowed([], DATE, true)).toBe(false)
    expect(recentAmrap([amrapDone('2026-10-14')], DATE)).toBe(true)
    expect(recentAmrap([amrapDone('2026-10-15')], DATE)).toBe(true)
    expect(recentAmrap([amrapDone('2026-10-13')], DATE)).toBe(false)
    expect(recentAmrap([amrapDone('2026-10-16')], DATE)).toBe(false) // séance future ignorée
    expect(recentAmrap([amrapDone('2026-10-14', 'abandoned')], DATE)).toBe(false)
    expect(recentAmrap([amrapDone('2026-10-14', 'done', { status: 'skipped' })], DATE)).toBe(false)
  })
})

describe('placeAmrap', () => {
  const index = new Map(library.map((e) => [e.id, e]))
  const states = new Map(bwStates().map((s) => [s.exerciseId, s]))
  const ctx = (over: { allowed?: boolean; fatigued?: Set<MuscleGroup> } = {}) => ({
    allowed: over.allowed ?? true,
    states,
    exercises: index,
    fatigued: over.fatigued ?? new Set<MuscleGroup>(),
  })
  const three = (id: string, extra: Partial<SetEntry> = {}): SessionExercise =>
    se(
      id,
      [0, 1, 2].map(() => ({ targetReps: must(byId(library, id).repRange), ...extra })),
    )

  it('au plus une, sur la dernière série du premier exercice admissible ; entrée intacte', () => {
    const blocks: SessionBlock[] = [
      { id: 'b1', kind: 'single', exercises: [three('goblet-squat', { loadKg: 12 })] },
      { id: 'b2', kind: 'single', exercises: [three('calf-raise')] },
      { id: 'b3', kind: 'single', exercises: [three('incline-push-up')] },
      { id: 'b4', kind: 'single', exercises: [three('bodyweight-squat')] },
    ]
    const out = placeAmrap(blocks, ctx())
    expect(amrapCount(out)).toBe(1)
    expect(exAt(out, 2, 0).sets.map(setTypeOf)).toEqual(['reps', 'reps', 'amrap'])
    expect(amrapCount(blocks)).toBe(0)
  })

  it('rien si non autorisé ; groupe fatigué écarté au profit du suivant', () => {
    const blocks: SessionBlock[] = [
      { id: 'b1', kind: 'single', exercises: [three('incline-push-up')] },
      { id: 'b2', kind: 'single', exercises: [three('bodyweight-squat')] },
    ]
    expect(amrapCount(placeAmrap(blocks, ctx({ allowed: false })))).toBe(0)
    const out = placeAmrap(blocks, ctx({ fatigued: new Set(['chest']) }))
    expect(setTypeOf(must(exAt(out, 1, 0).sets[2]))).toBe('amrap')
    expect(amrapCount(out)).toBe(1)
  })

  it('AMRAP déjà présentes retirées puis une seule reposée ; filtre wanted respecté', () => {
    const blocks: SessionBlock[] = [
      { id: 'b1', kind: 'single', exercises: [withLastSetAmrap(three('incline-push-up'))] },
      { id: 'b2', kind: 'single', exercises: [withLastSetAmrap(three('bodyweight-squat'))] },
    ]
    const out = placeAmrap(blocks, ctx(), (bi) => bi === 1)
    expect(amrapCount(out)).toBe(1)
    expect(setTypeOf(must(exAt(out, 1, 0).sets[2]))).toBe('amrap')
    expect(exAt(out, 0, 0).sets.every((s) => s.setType === undefined)).toBe(true)
  })
})

describe('génération', () => {
  it('finisher swing (60 min) → toutes ses séries en temps fixe, fenêtre 45 s, charge gardée, sans fourchette', () => {
    // Portés masqués et swing peu aimé : le swing sert de finisher plutôt que d'exercice principal.
    const lib = seedLibrary({
      'farmer-carry': 'hidden',
      'suitcase-carry': 'hidden',
      'rack-carry': 'hidden',
      'two-hand-swing': 'disliked',
    })
    let found = 0
    for (let d = 10; d <= 28; d++) {
      const plan = generateSession(
        makeInput({ durationMin: 60, profileLevel: 2, library: lib, date: `2026-10-${String(d)}` }),
      )
      const fin = plan.blocks.find((b) => b.kind === 'finisher')
      if (fin === undefined) continue
      found++
      const e = must(fin.exercises[0])
      expect(e.exerciseId).toBe('two-hand-swing')
      for (const s of e.sets) {
        expect(s.setType).toBe('timedMax')
        expect(s.targetDurationSec).toBe(timedMaxWindowSec(60))
        expect(s.targetReps).toBeUndefined()
        expect(s.loadKg).toBe(12)
      }
      // Le swing choisi comme exercice principal (hors finisher) reste en répétitions.
      for (const b of plan.blocks.filter((x) => x.kind !== 'finisher'))
        for (const x of b.exercises) expect(x.sets.some((s) => setTypeOf(s) === 'timedMax')).toBe(false)
    }
    expect(found).toBeGreaterThan(0)
  })

  it('tractions négatives et exercice perso sans drapeau : jamais d’AMRAP, même aimés et déjà faits', () => {
    const { amrap, ...base } = byId(library, 'incline-push-up')
    void amrap
    const custom = {
      ...base,
      id: 'b6f1c2d4-0000-4000-8000-000000000002',
      name: 'Pompes perso',
      source: 'user' as const,
      preference: 'liked' as const,
    }
    const lib = [...seedLibrary({ 'negative-pull-up': 'liked', 'incline-push-up': 'hidden' }), custom]
    const states = [...bwStates(), performedState(custom.id)]
    for (let d = 10; d <= 24; d++) {
      for (const durationMin of [30, 45] as const) {
        const plan = generateSession(
          makeInput({
            durationMin,
            library: lib,
            states,
            date: `2026-10-${String(d)}`,
            equipment: makeEquipment(['mat', 'pullup_bar']),
          }),
        )
        for (const b of plan.blocks)
          for (const e of b.exercises)
            if (e.exerciseId === 'negative-pull-up' || e.exerciseId === custom.id)
              expect(
                e.sets.some((x) => setTypeOf(x) === 'amrap'),
                e.exerciseId,
              ).toBe(false)
      }
    }
  })

  it('finisher swing une main (unilatéral) : séries normales, jamais en temps fixe', () => {
    const lib = seedLibrary({
      'farmer-carry': 'hidden',
      'suitcase-carry': 'hidden',
      'rack-carry': 'hidden',
      'two-hand-swing': 'hidden',
      'one-hand-swing': 'disliked',
    })
    let found = 0
    for (let d = 10; d <= 28; d++) {
      const plan = generateSession(
        makeInput({ durationMin: 60, profileLevel: 3, library: lib, date: `2026-10-${String(d)}` }),
      )
      const fin = plan.blocks.find((b) => b.kind === 'finisher')
      if (fin === undefined) continue
      found++
      expect(must(fin.exercises[0]).exerciseId).toBe('one-hand-swing')
      for (const x of must(fin.exercises[0]).sets) {
        expect(x.setType).toBeUndefined()
        expect(x.targetReps).toEqual([10, 16])
      }
    }
    expect(found).toBeGreaterThan(0)
  })

  it('finisher porté : reste une série en durée (time)', () => {
    let found = 0
    for (let d = 10; d <= 20; d++) {
      const plan = generateSession(makeInput({ durationMin: 60, date: `2026-10-${String(d)}` }))
      const fin = plan.blocks.find((b) => b.kind === 'finisher')
      if (fin === undefined || !byId(library, must(fin.exercises[0]).exerciseId).durationRange) continue
      found++
      for (const s of must(fin.exercises[0]).sets) {
        expect(s.setType).toBeUndefined()
        expect(setTypeOf(s)).toBe('time')
      }
    }
    expect(found).toBeGreaterThan(0)
  })
})

describe('estimation (F3)', () => {
  it('AMRAP ≈ haut de fourchette × 1,3 répétitions (× 2 unilatéral, tempo pris en compte)', () => {
    const push = byId(library, 'incline-push-up') // 8–15
    expect(setWorkSeconds({ setType: 'amrap', targetReps: [8, 15] }, push)).toBeCloseTo(15 * AMRAP_RATIO * 3)
    expect(setWorkSeconds({ setType: 'amrap', targetReps: [8, 15] }, push, '3-1-1')).toBeCloseTo(
      15 * AMRAP_RATIO * 5,
    )
    const lunge = byId(library, 'reverse-lunge-bw') // 8–12, unilatéral
    expect(setWorkSeconds({ setType: 'amrap', targetReps: [8, 12] }, lunge)).toBeCloseTo(
      12 * AMRAP_RATIO * 3 * 2,
    )
    // Sans fourchette sur la série : celle de l'exercice.
    expect(setWorkSeconds({ setType: 'amrap' }, push)).toBeCloseTo(15 * AMRAP_RATIO * 3)
  })

  it('temps fixe = la fenêtre (× 2 unilatéral) ; sans fenêtre valide → série en répétitions', () => {
    expect(timedMaxWindowOf({ setType: 'timedMax', targetDurationSec: 0 })).toBeUndefined()
    expect(timedMaxWindowOf({ setType: 'timedMax' })).toBeUndefined()
    expect(setWorkSeconds({ setType: 'timedMax' }, byId(library, 'two-hand-swing'))).toBe(48)
    expect(
      setWorkSeconds({ setType: 'timedMax', targetDurationSec: 45 }, byId(library, 'two-hand-swing')),
    ).toBe(45)
    expect(
      setWorkSeconds({ setType: 'timedMax', targetDurationSec: 30 }, byId(library, 'one-hand-swing')),
    ).toBe(60)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Progression

interface Spec {
  reps?: number
  feeling?: Feeling
  load?: number
  type?: SetEntry['setType']
  window?: number
}

function perf(target: { reps?: [number, number]; load?: number }, specs: Spec[]): { sets: SetEntry[] } {
  return {
    sets: specs.map((s) => {
      const set: SetEntry = { status: 'done', feeling: s.feeling ?? 'ok' }
      if (s.type !== undefined) set.setType = s.type
      if (s.type === 'timedMax') set.targetDurationSec = s.window ?? 45
      else if (target.reps !== undefined) set.targetReps = target.reps
      const load = s.load ?? target.load
      if (load !== undefined) set.loadKg = load
      if (s.reps !== undefined) set.actualReps = s.reps
      return set
    }),
  }
}

function run(
  id: string,
  state: ExerciseState | undefined,
  performed: { sets: SetEntry[] },
  extra: Partial<SessionResultParams> = {},
) {
  return applySessionResult({
    exercise: byId(library, id),
    state,
    performed,
    equipment,
    library,
    date: DATE,
    profileLevel: 1,
    ...extra,
  })
}

describe('progression AMRAP', () => {
  const R: [number, number] = [8, 15] // pompes inclinées

  it('max > haut × 1,3 (20 > 19,5) avec toutes les séries au haut → level_up immédiat (pompes au sol)', () => {
    const out = run(
      'incline-push-up',
      makeState('incline-push-up'),
      perf({ reps: R }, [{ reps: 15 }, { reps: 15 }, { reps: 20, type: 'amrap' }]),
    )
    expect(out.suggestion?.kind).toBe('level_up')
    const variant = byId(library, must(out.suggestion?.toExerciseId))
    expect([variant.pattern, variant.level]).toEqual(['push_h', 2])
    expect(out.suggestion?.message).toContain('20 répétitions')
    expect(out.state.topStreak).toBe(1)
  })

  it('max ≤ haut × 1,3 (19) → pas de suggestion à la 1re séance ; la série compte pour la double progression', () => {
    const out = run(
      'incline-push-up',
      makeState('incline-push-up'),
      perf({ reps: R }, [{ reps: 15 }, { reps: 15 }, { reps: 19, type: 'amrap' }]),
    )
    expect(out.suggestion).toBeUndefined()
    expect(out.state.topStreak).toBe(1)
    // AMRAP sous le haut de fourchette : la séance n'est pas au haut.
    const low = run(
      'incline-push-up',
      makeState('incline-push-up'),
      perf({ reps: R }, [{ reps: 15 }, { reps: 15 }, { reps: 12, type: 'amrap' }]),
    )
    expect(low.state.topStreak).toBe(0)
  })

  it('seuil strict : 10 × 1,3 = 13 → 13 ne suffit pas, 14 oui (fourchette 8–10 fictive)', () => {
    const t: [number, number] = [8, 10]
    const lib = library.map((e) => (e.id === 'incline-push-up' ? { ...e, repRange: t } : e))
    const go = (reps: number) =>
      applySessionResult({
        exercise: byId(lib, 'incline-push-up'),
        state: makeState('incline-push-up'),
        performed: perf({ reps: t }, [{ reps: 10 }, { reps, type: 'amrap' }]),
        equipment,
        library: lib,
        date: DATE,
        profileLevel: 1,
      }).suggestion
    expect(go(13)).toBeUndefined()
    expect(go(14)?.kind).toBe('level_up')
  })

  it('garde-fous : séries précédentes sous le haut, deload, 2 séances hard → pas de suggestion', () => {
    const big = { reps: 30, type: 'amrap' as const }
    expect(
      run(
        'incline-push-up',
        makeState('incline-push-up'),
        perf({ reps: R }, [{ reps: 12 }, { reps: 15 }, big]),
      ).suggestion,
    ).toBeUndefined()
    expect(
      run(
        'incline-push-up',
        makeState('incline-push-up'),
        perf({ reps: R }, [{ reps: 15 }, { reps: 15 }, big]),
        { deload: true },
      ).suggestion,
    ).toBeUndefined()
    const tired = makeState('incline-push-up', { recentFeelings: ['hard'] })
    const hardSets = perf({ reps: R }, [
      { reps: 15, feeling: 'hard' },
      { reps: 15, feeling: 'hard' },
      { ...big, feeling: 'hard' },
    ])
    expect(run('incline-push-up', tired, hardSets).suggestion).toBeUndefined()
  })

  it('jamais au-delà de profil + 1 : pompes (niv. 2) pour un débutant → aucune variante proposée', () => {
    const out = run(
      'push-up',
      makeState('push-up'),
      perf({ reps: [6, 15] }, [{ reps: 15 }, { reps: 15 }, { reps: 40, type: 'amrap' }]),
    )
    expect(out.suggestion).toBeUndefined()
    const inter = run(
      'push-up',
      makeState('push-up'),
      perf({ reps: [6, 15] }, [{ reps: 15 }, { reps: 15 }, { reps: 40, type: 'amrap' }]),
      { profileLevel: 2 },
    )
    expect(byId(library, must(inter.suggestion?.toExerciseId)).level).toBe(3)
  })

  it('débutant : aucune AMRAP ne mène au Turkish get-up ni au-delà du niveau 2', () => {
    for (const ex of AMRAP_EXERCISES) {
      const r = must(ex.repRange)
      const out = run(
        ex.id,
        makeState(ex.id),
        perf({ reps: r }, [{ reps: r[1] }, { reps: r[1] }, { reps: r[1] * 3, type: 'amrap' }]),
      )
      if (out.suggestion?.toExerciseId === undefined) continue
      expect(out.suggestion.toExerciseId).not.toBe('turkish-get-up')
      expect(byId(library, out.suggestion.toExerciseId).level).toBeLessThanOrEqual(2)
    }
  })

  it('AMRAP sur un exercice chargé (donnée incohérente) : pas de suggestion AMRAP', () => {
    const out = run(
      'goblet-squat',
      makeState('goblet-squat', { loadKg: 16 }),
      perf({ reps: [8, 12], load: 16 }, [{ reps: 12 }, { reps: 12 }, { reps: 30, type: 'amrap' }]),
      { profileLevel: 2 },
    )
    expect(out.suggestion).toBeUndefined()
    expect(out.change).toBe('increase') // double progression habituelle
  })
})

describe('progression temps fixe (swings)', () => {
  const swing = (over: Partial<ExerciseState> = {}) => makeState('two-hand-swing', { loadKg: 16, ...over })
  const tm = (reps: number, extra: Spec = {}): Spec => ({ reps, type: 'timedMax', ...extra })
  const P = (specs: Spec[]) => perf({ load: 16 }, specs)

  it('seuil proportionnel à la fenêtre : floor(haut × fenêtre / 45), au moins 1', () => {
    expect(timedMaxThreshold(20, 45)).toBe(20)
    expect(timedMaxThreshold(20, 30)).toBe(13)
    expect(timedMaxThreshold(20, 60)).toBe(26)
    expect(timedMaxThreshold(1, 20)).toBe(1)
    // 30 s : 13 suffisent, 12 non.
    expect(run('two-hand-swing', swing(), P([tm(13, { window: 30 })])).state.topStreak).toBe(1)
    expect(run('two-hand-swing', swing(), P([tm(12, { window: 30 })])).state.topStreak).toBe(0)
  })

  it('1re séance au seuil (≥ 20 reps en 45 s) : record posé, charge gardée, topStreak 1', () => {
    const out = run('two-hand-swing', swing(), P([tm(22), tm(24)]), { profileLevel: 2 })
    expect(out.change).toBe('hold')
    expect(out.state.loadKg).toBe(16)
    expect(out.state.timedMaxBestReps).toBe(24)
    expect(out.state.timedMaxSec).toBe(45)
    expect(out.state.topStreak).toBe(1)
  })

  it('2e séance de suite au seuil en égalant le record → +1 palier (2 kg), record remis à zéro', () => {
    const out = run(
      'two-hand-swing',
      swing({ topStreak: 1, timedMaxBestReps: 24, timedMaxSec: 45 }),
      P([tm(23), tm(24)]),
      { profileLevel: 2 },
    )
    expect(out.change).toBe('increase')
    expect(out.state.loadKg).toBe(18)
    expect(out.state.timedMaxBestReps).toBeUndefined()
    expect(out.state.timedMaxSec).toBeUndefined()
    expect(out.state.topStreak).toBe(0)
  })

  it('record non égalé, ou une série sous le seuil → série remise à 0, record gardé', () => {
    const below = run(
      'two-hand-swing',
      swing({ topStreak: 1, timedMaxBestReps: 26, timedMaxSec: 45 }),
      P([tm(24), tm(25)]),
    )
    expect(below.change).toBe('hold')
    expect(below.state.topStreak).toBe(0)
    expect(below.state.timedMaxBestReps).toBe(26)
    const under = run('two-hand-swing', swing({ topStreak: 1 }), P([tm(30), tm(18)]))
    expect(under.state.topStreak).toBe(0)
    expect(under.state.timedMaxBestReps).toBe(30)
  })

  it('nouveau record retenu ; fenêtre différente → le record repart de cette séance', () => {
    const better = run('two-hand-swing', swing({ timedMaxBestReps: 20, timedMaxSec: 45 }), P([tm(26)]))
    expect(better.state.timedMaxBestReps).toBe(26)
    const other = run(
      'two-hand-swing',
      swing({ timedMaxBestReps: 30, timedMaxSec: 45 }),
      P([tm(21, { window: 30 })]),
    )
    expect(other.state.timedMaxSec).toBe(30)
    expect(other.state.timedMaxBestReps).toBe(21)
    expect(other.state.topStreak).toBe(1) // seuil atteint, pas de record à battre à cette fenêtre
    // 2e séance de suite au seuil à la nouvelle fenêtre : hausse (le record de 45 s n'était pas à battre).
    const next = run(
      'two-hand-swing',
      swing({ timedMaxBestReps: 30, timedMaxSec: 45, topStreak: 1 }),
      P([tm(21, { window: 30 })]),
    )
    expect(next.change).toBe('increase')
    expect(next.state.timedMaxBestReps).toBeUndefined()
  })

  it('séries faites plus léger que prévu : ne comptent ni pour le record ni pour la hausse', () => {
    const out = run(
      'two-hand-swing',
      swing({ topStreak: 1 }),
      P([tm(30, { load: 14 }), tm(30, { load: 14 })]),
    )
    expect(out.change).toBe('hold')
    expect(out.state.timedMaxBestReps).toBeUndefined()
  })

  it('3 séances hard → −1 palier et record effacé ; deload → record mis à jour, charge inchangée', () => {
    const down = run(
      'two-hand-swing',
      swing({ recentFeelings: ['hard', 'hard'], timedMaxBestReps: 25, timedMaxSec: 45 }),
      P([tm(20, { feeling: 'hard' })]),
    )
    expect(down.change).toBe('decrease')
    expect(down.state.loadKg).toBe(14)
    expect(down.state.timedMaxBestReps).toBeUndefined()
    const del = run(
      'two-hand-swing',
      swing({ topStreak: 1, timedMaxBestReps: 20, timedMaxSec: 45 }),
      P([tm(28)]),
      { deload: true },
    )
    expect(del.change).toBe('hold')
    expect(del.state.timedMaxBestReps).toBe(28)
    expect(del.state.topStreak).toBe(1)
  })

  it('charge changée par une séance en répétitions → record effacé', () => {
    const out = run(
      'two-hand-swing',
      swing({ timedMaxBestReps: 25, timedMaxSec: 45 }),
      perf({ reps: [12, 20], load: 16 }, [{ reps: 20 }, { reps: 20 }]),
    )
    expect(out.change).toBe('increase')
    expect(out.state.timedMaxBestReps).toBeUndefined()
  })

  it('charge max : jamais de tempo sur un swing en temps fixe ; level_up (≤ profil + 1) après 2 séances', () => {
    const atMax = makeState('two-hand-swing', {
      loadKg: 24,
      topStreak: 1,
      timedMaxBestReps: 22,
      timedMaxSec: 45,
    })
    const inter = run('two-hand-swing', atMax, perf({ load: 24 }, [tm(22), tm(22)]), { profileLevel: 2 })
    expect(inter.suggestion?.kind).toBe('level_up')
    const v = byId(library, must(inter.suggestion?.toExerciseId))
    expect([v.pattern, v.level]).toEqual(['hinge', 3])
    const beginner = run('two-hand-swing', atMax, perf({ load: 24 }, [tm(22), tm(22)]), { profileLevel: 1 })
    expect(beginner.suggestion).toBeUndefined()
  })

  it('swings sans setType (anciennes séances) : double progression immédiate, comme avant', () => {
    const out = run(
      'two-hand-swing',
      swing(),
      perf({ reps: [12, 20], load: 16 }, [{ reps: 20 }, { reps: 20 }]),
    )
    expect(out.change).toBe('increase')
    expect(out.state.loadKg).toBe(18)
    expect(out.state.timedMaxBestReps).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Records

describe('records (F3)', () => {
  const pushSession = (date: string, sets: SetEntry[], id = `s-${date}`): Session =>
    session(date, [{ id: 'b1', kind: 'single', exercises: [se('incline-push-up', sets)] }], { id })
  const done = (actualReps: number, extra: Partial<SetEntry> = {}): SetEntry => ({
    targetReps: [8, 15],
    status: 'done',
    feeling: 'ok',
    actualReps,
    ...extra,
  })

  it('le max d’une AMRAP alimente le record de reps (poids du corps) ; premier passage ≠ record', () => {
    const first = pushSession('2026-10-12', [done(12), done(12), done(16, { setType: 'amrap' })])
    expect(summarizeSession(first, library, []).records).toEqual([])
    const second = pushSession('2026-10-14', [done(15), done(15), done(22, { setType: 'amrap' })])
    expect(summarizeSession(second, library, [first]).records).toEqual([
      { exerciseId: 'incline-push-up', kind: 'reps', value: 22, previous: 16 },
    ])
  })

  const swingSession = (date: string, sets: SetEntry[]): Session =>
    session(date, [{ id: 'b1', kind: 'finisher', exercises: [se('two-hand-swing', sets)] }], {
      id: `w-${date}`,
    })
  const tm = (actualReps: number, window = 45, loadKg = 16): SetEntry => ({
    setType: 'timedMax',
    targetDurationSec: window,
    loadKg,
    status: 'done',
    feeling: 'ok',
    actualReps,
    actualDurationSec: window,
  })
  const reps = (actualReps: number, loadKg = 16): SetEntry => ({
    targetReps: [12, 20],
    loadKg,
    status: 'done',
    feeling: 'ok',
    actualReps,
  })

  it('temps fixe : record à même fenêtre et même charge seulement', () => {
    const a = swingSession('2026-10-12', [tm(20), tm(22)])
    const b = swingSession('2026-10-14', [tm(25), tm(24)])
    const repsOf = (x: Session, h: Session[]) =>
      summarizeSession(x, library, h).records.filter((r) => r.kind === 'reps')
    expect(repsOf(b, [a])).toEqual([
      { exerciseId: 'two-hand-swing', kind: 'reps', value: 25, previous: 22, loadKg: 16, windowSec: 45 },
    ])
    // Autre fenêtre ou autre charge : rien à battre, pas de record de reps (le record de charge reste possible).
    const c = swingSession('2026-10-16', [tm(30, 60)])
    expect(repsOf(c, [a, b])).toEqual([])
    const d = swingSession('2026-10-16', [tm(30, 45, 18)])
    expect(repsOf(d, [a, b])).toEqual([])
    expect(summarizeSession(d, library, [a, b]).records.map((r) => r.kind)).toContain('load')
  })

  it('temps fixe et séries en répétitions ne se comparent pas ; pas de record de durée en temps fixe', () => {
    const normal = swingSession('2026-10-12', [reps(15), reps(15)])
    const timed = swingSession('2026-10-14', [tm(30)])
    expect(summarizeSession(timed, library, [normal]).records.filter((r) => r.kind === 'reps')).toEqual([])
    const normal2 = swingSession('2026-10-16', [reps(16)])
    expect(summarizeSession(normal2, library, [normal, timed]).records).toEqual([
      { exerciseId: 'two-hand-swing', kind: 'reps', value: 16, previous: 15, loadKg: 16 },
    ])
    const longer = swingSession('2026-10-18', [{ ...tm(31), actualDurationSec: 60 }])
    expect(summarizeSession(longer, library, [timed]).records.map((r) => r.kind)).not.toContain('duration')
  })

  it('timedMax sans fenêtre (donnée incohérente) : comptée comme une série normale, jamais windowSec 0', () => {
    const broken = (r: number): SetEntry => ({
      setType: 'timedMax',
      loadKg: 16,
      status: 'done',
      feeling: 'ok',
      actualReps: r,
    })
    const recs = summarizeSession(swingSession('2026-10-16', [broken(18)]), library, [
      swingSession('2026-10-12', [reps(15)]),
    ]).records.filter((r) => r.kind === 'reps')
    expect(recs).toEqual([
      { exerciseId: 'two-hand-swing', kind: 'reps', value: 18, previous: 15, loadKg: 16 },
    ])
  })

  it('temps fixe : tonnage et total de reps comptés comme des répétitions', () => {
    const s = summarizeSession(swingSession('2026-10-12', [tm(20), tm(22)]), library, [])
    expect(s.totalReps).toBe(42)
    expect(s.tonnageKg).toBe(42 * 16)
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Guidage

describe('guidage (F3)', () => {
  const live = (): Session =>
    session(
      DATE,
      [
        {
          id: 'b1',
          kind: 'finisher',
          exercises: [
            se(
              'two-hand-swing',
              [0, 1].map(() => ({ setType: 'timedMax' as const, targetDurationSec: 45, loadKg: 16 })),
            ),
          ],
        },
      ],
      { status: 'in_progress', cursor: { block: 0, exercise: 0, set: 0 } },
    )

  it('série en temps fixe : reps enregistrées, durée saisie ignorée (la fenêtre est la cible)', () => {
    const s = recordSet(
      live(),
      { block: 0, exercise: 0, set: 0 },
      { reps: 24, durationSec: 45, feeling: 'ok' },
    )
    const set = must(exAt(s, 0, 0).sets[0])
    expect(set).toMatchObject({
      setType: 'timedMax',
      targetDurationSec: 45,
      actualReps: 24,
      status: 'done',
    })
    expect(set.actualDurationSec).toBeUndefined()
    // Reps seules : acceptées (la durée est imposée par la fenêtre).
    const only = recordSet(live(), { block: 0, exercise: 0, set: 0 }, { reps: 20, feeling: 'ok' })
    expect(must(exAt(only, 0, 0).sets[0]).actualReps).toBe(20)
  })

  it('annuler ou passer une série AMRAP / temps fixe garde son type', () => {
    const c = { block: 0, exercise: 0, set: 1 }
    const s = recordSet(live(), c, { reps: 24, feeling: 'ok' })
    expect(must(exAt(undoSet(s, c), 0, 0).sets[1]).setType).toBe('timedMax')
    expect(must(exAt(skipSet(live(), c), 0, 0).sets[1]).setType).toBe('timedMax')
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Modèles

describe('modèles (F3)', () => {
  const states = [...bwStates(), makeState('two-hand-swing', { loadKg: 16, lastPerformedOn: '2026-10-10' })]
  const input = makeInput({ durationMin: 45, states, profileLevel: 2 })
  const row = (over: Partial<TemplateBlock>): TemplateBlock => ({
    exerciseId: 'push-up',
    sets: 3,
    restSec: 75,
    ...over,
  })
  const tpl = (blocks: TemplateBlock[], durationMin: SessionTemplate['durationMin'] = 45) => ({
    blocks,
    durationMin,
  })

  it('enregistrer puis relire : setType timedMax (fenêtre) et lastSetAmrap', () => {
    const blocks: SessionBlock[] = [
      {
        id: 'b1',
        kind: 'single',
        exercises: [
          withLastSetAmrap(
            se(
              'push-up',
              [0, 1, 2].map(() => ({ targetReps: [6, 15] as [number, number] })),
            ),
          ),
        ],
      },
      {
        id: 'b2',
        kind: 'finisher',
        exercises: [
          asTimedMax(
            se(
              'two-hand-swing',
              [0, 1].map(() => ({ targetReps: [12, 20] as [number, number], loadKg: 16 })),
            ),
            40,
          ),
        ],
      },
    ]
    const draft = templateFromSession(blocks, 'Max', 45)
    expect(draft.blocks[0]).toMatchObject({ exerciseId: 'push-up', lastSetAmrap: true })
    expect(draft.blocks[0]?.setType).toBeUndefined()
    expect(draft.blocks[1]).toMatchObject({
      exerciseId: 'two-hand-swing',
      setType: 'timedMax',
      durationSec: 40,
      kind: 'finisher',
    })
    expect(draft.blocks[1]?.reps).toBeUndefined()

    const plan = planFromTemplate(draft, input)
    expect(exAt(plan, 0, 0).sets.map(setTypeOf)).toEqual(['reps', 'reps', 'amrap'])
    expect(exAt(plan, 1, 0).sets.every((s) => s.setType === 'timedMax' && s.targetDurationSec === 40)).toBe(
      true,
    )
  })

  it('ancien modèle sans champs F3 : aucune série typée', () => {
    const plan = planFromTemplate(
      tpl([row({}), row({ exerciseId: 'two-hand-swing', group: 1, kind: 'finisher', sets: 2, restSec: 90 })]),
      input,
    )
    expect(
      plan.blocks.flatMap((b) => b.exercises.flatMap((e) => e.sets)).every((s) => s.setType === undefined),
    ).toBe(true)
  })

  it('règles revérifiées : AMRAP refusée sur kettlebell / jamais fait ; temps fixe refusé hors finisher ou sur un porté', () => {
    const plan = planFromTemplate(
      tpl([
        row({ exerciseId: 'goblet-squat', lastSetAmrap: true, group: 0 }),
        row({ exerciseId: 'dead-bug', lastSetAmrap: true, group: 1 }),
        row({ exerciseId: 'two-hand-swing', setType: 'timedMax', durationSec: 45, group: 2 }),
        row({ exerciseId: 'farmer-carry', setType: 'timedMax', durationSec: 45, group: 3, kind: 'finisher' }),
      ]),
      { ...input, states: states.filter((s) => s.exerciseId !== 'dead-bug') },
    )
    expect(amrapCount(plan.blocks)).toBe(0)
    expect(
      plan.blocks.flatMap((b) => b.exercises.flatMap((e) => e.sets)).some((s) => s.setType === 'timedMax'),
    ).toBe(false)
  })

  it('deux lignes AMRAP → une seule AMRAP ; setType amrap lu comme dernière série ; fenêtre hors bornes → défaut', () => {
    const plan = planFromTemplate(
      tpl([
        row({ exerciseId: 'incline-push-up', setType: 'amrap', group: 0 }),
        row({ exerciseId: 'bodyweight-squat', lastSetAmrap: true, group: 1 }),
        row({
          exerciseId: 'two-hand-swing',
          setType: 'timedMax',
          durationSec: 300,
          group: 2,
          kind: 'finisher',
          sets: 2,
        }),
      ]),
      input,
    )
    expect(amrapCount(plan.blocks)).toBe(1)
    expect(exAt(plan, 0, 0).sets.map(setTypeOf)).toEqual(['reps', 'reps', 'amrap'])
    expect(exAt(plan, 2, 0).sets.map((s) => s.targetDurationSec)).toEqual([40, 40]) // défaut 45 min
  })

  it('deload ou AMRAP faite hier : modèle rejoué sans série à l’échec', () => {
    const t = tpl([
      row({ lastSetAmrap: true }),
      row({
        exerciseId: 'two-hand-swing',
        setType: 'timedMax',
        durationSec: 45,
        group: 1,
        kind: 'finisher',
        sets: 2,
      }),
    ])
    const yesterday = session('2026-10-14', [
      {
        id: 'b1',
        kind: 'single',
        exercises: [se('dead-bug', [{ setType: 'amrap', status: 'done', actualReps: 15, feeling: 'ok' }])],
      },
    ])
    const plan = planFromTemplate(t, { ...input, sessions: [yesterday] })
    expect(amrapCount(plan.blocks)).toBe(0)
    expect(exAt(plan, 1, 0).sets.every((s) => s.setType === 'timedMax')).toBe(true)
    const deload = planFromTemplate(t, {
      ...input,
      settings: defaultSettings({ deloadEveryWeeks: 1 }),
      sessions: [session('2026-10-01', [])],
    })
    expect(deload.deload).toBe(true)
    expect(
      deload.blocks.flatMap((b) => b.exercises.flatMap((e) => e.sets)).some((s) => s.setType !== undefined),
    ).toBe(false)
  })

  it('cibles du modèle (Claude) : la fenêtre n’est pas signalée comme durée ignorée', () => {
    const plan = planFromTemplate(
      tpl([
        row({
          exerciseId: 'two-hand-swing',
          setType: 'timedMax',
          durationSec: 30,
          kind: 'finisher',
          sets: 2,
          loadKg: 12,
        }),
      ]),
      input,
      { useTemplateTargets: true },
    )
    expect(exAt(plan, 0, 0).sets).toEqual(
      [0, 1].map(() => ({ setType: 'timedMax', targetDurationSec: 30, loadKg: 12 })),
    )
  })

  it('notes des cibles : fenêtre de temps fixe pas signalée ; durée sur un swing en répétitions toujours signalée', () => {
    const timed = row({
      exerciseId: 'two-hand-swing',
      setType: 'timedMax',
      durationSec: 30,
      kind: 'finisher',
      sets: 2,
    })
    expect(templateTargetNotes(tpl([timed]), input)).toEqual([])
    const plain = row({ exerciseId: 'two-hand-swing', durationSec: 30, sets: 2 })
    expect(templateTargetNotes(tpl([plain]), input)).toEqual([
      'Swing kettlebell deux mains : durée demandée ignorée (exercice en répétitions)',
    ])
  })
})
