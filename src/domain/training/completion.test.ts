import { describe, expect, it } from 'vitest'
import type { Session, SessionBlock, SessionSuggestion, SetEntry } from '../../types/training'
import { acceptSuggestion, completeSessionPlan } from './completion'
import { T0, makeEquipment, makeState, must, seedLibrary } from './testkit'

const lib = seedLibrary()
const eq = makeEquipment()
const NOW = '2026-10-15T19:00:00.000Z'

const top = (n: number, loadKg?: number, feeling: SetEntry['feeling'] = 'ok', reps = 12): SetEntry[] =>
  Array.from({ length: n }, () => ({
    targetReps: [8, 12],
    status: 'done' as const,
    actualReps: reps,
    feeling,
    ...(loadKg !== undefined ? { loadKg } : {}),
  }))

function session(blocks: SessionBlock[], over: Partial<Session> = {}): Session {
  return {
    id: 's1',
    date: '2026-10-15',
    durationMin: 30,
    status: 'in_progress',
    warmup: [],
    blocks,
    deload: false,
    estimatedMin: 30,
    startedAt: '2026-10-15T18:00:00.000Z',
    cursor: { block: 0, exercise: 0, set: 0 },
    restEndsAt: '2026-10-15T18:40:00.000Z',
    updatedAt: T0,
    ...over,
  }
}

const single = (id: string, exerciseId: string, sets: SetEntry[]): SessionBlock => ({
  id,
  kind: 'single',
  exercises: [{ exerciseId, restSec: 60, sets }],
})

const base = { library: lib, equipment: eq, profileLevel: 1 as const, now: NOW }

describe('completeSessionPlan', () => {
  it('séance done : endedAt, progressionAppliedAt, sans cursor ni restEndsAt ; séries à faire → skipped', () => {
    const s = session([single('b1', 'incline-push-up', [...top(1), { targetReps: [8, 12] }])])
    const r = completeSessionPlan({ ...base, session: s, states: [] })
    expect(r.session.status).toBe('done')
    expect(r.session.endedAt).toBe(NOW)
    expect(r.session.progressionAppliedAt).toBe(NOW)
    expect(r.session.updatedAt).toBe(NOW)
    expect(r.session.cursor).toBeUndefined()
    expect(r.session.restEndsAt).toBeUndefined()
    expect(r.session.suggestions).toEqual([])
    expect(r.session.blocks[0]?.exercises[0]?.sets.map((x) => x.status)).toEqual(['done', 'skipped'])
  })

  it('séries fusionnées sur tous les blocs : un seul résultat par exercice (une hausse au plus)', () => {
    const s = session([
      single('b1', 'box-goblet-squat', top(2, 12)),
      single('b2', 'incline-push-up', top(1)),
      single('b3', 'box-goblet-squat', top(1, 12)),
    ])
    const r = completeSessionPlan({
      ...base,
      session: s,
      states: [makeState('box-goblet-squat', { loadKg: 12 })],
    })
    expect(r.outcomes).toHaveLength(2)
    const squat = r.states.find((x) => x.exerciseId === 'box-goblet-squat')
    expect(squat?.recentFeelings).toEqual(['ok'])
    expect(squat?.loadKg).toBe(14) // +1 palier (2 kg), pas deux
    expect(squat?.lastPerformedOn).toBe('2026-10-15')
    expect(squat?.updatedAt).toBe(NOW)
    expect(r.states).toEqual(r.outcomes.map((o) => o.state))
  })

  it('une série manquée dans un des blocs bloque la hausse (toutes les séries comptent)', () => {
    const s = session([
      single('b1', 'box-goblet-squat', top(2, 12)),
      single('b2', 'box-goblet-squat', top(1, 12, 'ok', 9)),
    ])
    const r = completeSessionPlan({
      ...base,
      session: s,
      states: [makeState('box-goblet-squat', { loadKg: 12 })],
    })
    expect(r.states[0]?.loadKg).toBe(12)
  })

  it('exercice sans série faite : pas de résultat', () => {
    const s = session([single('b1', 'incline-push-up', [{ status: 'skipped' }]), single('b2', 'plank', [])])
    expect(completeSessionPlan({ ...base, session: s, states: [] }).outcomes).toEqual([])
  })

  it('deload transmis : charge inchangée, pas de suggestion', () => {
    const states = [makeState('box-goblet-squat', { loadKg: 12 })]
    const s = session([single('b1', 'box-goblet-squat', top(2, 12))], { deload: true })
    const r = completeSessionPlan({ ...base, session: s, states })
    expect(r.states[0]?.loadKg).toBe(12)
    expect(r.outcomes[0]?.change).toBe('hold')
  })

  it('profileLevel transmis : variante bornée au profil + 1, sinon tempo', () => {
    const states = [makeState('two-hand-swing', { loadKg: 24, topStreak: 1 })]
    const s = session([single('b1', 'two-hand-swing', top(3, 24, 'ok', 20))])
    const beginner = completeSessionPlan({ ...base, session: s, states })
    expect(beginner.suggestions).toHaveLength(1)
    expect(beginner.suggestions[0]).toMatchObject({
      kind: 'tempo',
      exerciseId: 'two-hand-swing',
      status: 'pending',
    })
    const inter = completeSessionPlan({ ...base, profileLevel: 2, session: s, states })
    expect(inter.suggestions[0]).toMatchObject({
      kind: 'level_up',
      exerciseId: 'two-hand-swing',
      status: 'pending',
    })
    expect(inter.suggestions[0]?.toExerciseId).toBeDefined()
    expect(inter.session.suggestions).toEqual(inter.suggestions)
  })

  it('pas de déblocage implicite : exercice au-dessus du niveau atteint et sans état → aucun état créé', () => {
    const s = session([
      single('b1', 'goblet-squat', top(3, 12)), // niveau 2, profil 1, pas d'état
      single('b2', 'box-goblet-squat', top(3, 12)),
    ])
    const r = completeSessionPlan({ ...base, session: s, states: [] })
    expect(r.states.map((x) => x.exerciseId)).toEqual(['box-goblet-squat'])
    // Avec un état (variante acceptée), il progresse normalement.
    const unlocked = completeSessionPlan({
      ...base,
      session: s,
      states: [makeState('goblet-squat', { loadKg: 12 })],
    })
    expect(unlocked.states.map((x) => x.exerciseId)).toContain('goblet-squat')
  })

  it('premier passage d’un exercice du niveau atteint : état créé (charge minimale puis progression)', () => {
    const s = session([single('b1', 'box-goblet-squat', top(3, 12))])
    const r = completeSessionPlan({ ...base, session: s, states: [] })
    expect(r.states[0]).toMatchObject({ exerciseId: 'box-goblet-squat', loadKg: 14, recentFeelings: ['ok'] })
  })

  it('jamais rejouée : séance déjà appliquée → aucun résultat', () => {
    const s = session([single('b1', 'box-goblet-squat', top(3, 12))], {
      status: 'done',
      progressionAppliedAt: '2026-10-15T18:59:00.000Z',
      endedAt: '2026-10-15T18:59:00.000Z',
      suggestions: [],
    })
    const r = completeSessionPlan({
      ...base,
      session: s,
      states: [makeState('box-goblet-squat', { loadKg: 12 })],
    })
    expect(r.outcomes).toEqual([])
    expect(r.states).toEqual([])
    expect(r.session.progressionAppliedAt).toBe('2026-10-15T18:59:00.000Z')
    expect(r.session.endedAt).toBe('2026-10-15T18:59:00.000Z')
  })

  it('entrée non modifiée', () => {
    const s = session([single('b1', 'box-goblet-squat', [...top(1, 12), { targetReps: [8, 12] }])])
    const before = JSON.stringify(s)
    completeSessionPlan({ ...base, session: s, states: [] })
    expect(JSON.stringify(s)).toBe(before)
  })

  it('pas de level_up vers une variante qui a déjà un état (sinon elle reviendrait à chaque séance)', () => {
    const states = [makeState('two-hand-swing', { loadKg: 24, topStreak: 1 })]
    const s = session([single('b1', 'two-hand-swing', top(3, 24, 'ok', 20))])
    const first = completeSessionPlan({ ...base, profileLevel: 2, session: s, states })
    const target = must(first.suggestions[0]?.toExerciseId)
    const again = completeSessionPlan({
      ...base,
      profileLevel: 2,
      session: s,
      states: [...states, makeState(target, { loadKg: 12 })],
    })
    expect(again.suggestions).toEqual([])
    expect(again.outcomes[0]?.suggestion).toBeUndefined()
    expect(again.session.suggestions).toEqual([])
  })
})

describe('acceptSuggestion', () => {
  const params = { library: lib, states: [], equipment: eq, date: '2026-10-15', now: NOW }
  const levelUp = (to: string): SessionSuggestion => ({
    kind: 'level_up',
    exerciseId: 'x',
    toExerciseId: to,
    message: '',
    status: 'pending',
  })

  it('level_up : état initial de la variante (charge minimale)', () => {
    expect(acceptSuggestion(levelUp('goblet-squat'), params)).toEqual({
      exerciseId: 'goblet-squat',
      loadKg: 12,
      recentFeelings: [],
      topStreak: 0,
      updatedAt: NOW,
    })
  })

  it('level_up vers le Turkish get-up : apprentissage sans charge', () => {
    expect(acceptSuggestion(levelUp('turkish-get-up'), params)?.loadKg).toBeNull()
  })

  it('level_up : undefined si un état existe déjà, si la variante a disparu, ou si déjà traitée', () => {
    expect(
      acceptSuggestion(levelUp('goblet-squat'), {
        ...params,
        states: [makeState('goblet-squat', { loadKg: 16 })],
      }),
    ).toBeUndefined()
    expect(acceptSuggestion(levelUp('inconnu'), params)).toBeUndefined()
    expect(acceptSuggestion({ ...levelUp('goblet-squat'), status: 'dismissed' }, params)).toBeUndefined()
  })

  it('tempo : état existant avec tempo ; undefined sans état', () => {
    const t: SessionSuggestion = {
      kind: 'tempo',
      exerciseId: 'kettlebell-curl',
      message: '',
      status: 'pending',
    }
    const st = makeState('kettlebell-curl', { loadKg: 24 })
    expect(acceptSuggestion(t, { ...params, states: [st] })).toEqual({ ...st, tempo: true, updatedAt: NOW })
    expect(acceptSuggestion(t, params)).toBeUndefined()
  })

  it('level_up : variante supprimée, masquée ou sans le matériel → undefined', () => {
    const hidden = seedLibrary({ 'goblet-squat': 'hidden' })
    expect(acceptSuggestion(levelUp('goblet-squat'), { ...params, library: hidden })).toBeUndefined()
    const deleted = lib.map((e) => (e.id === 'goblet-squat' ? { ...e, deleted: true } : e))
    expect(acceptSuggestion(levelUp('goblet-squat'), { ...params, library: deleted })).toBeUndefined()
    expect(acceptSuggestion(levelUp('australian-row'), params)).toBeUndefined()
    const withGear = { ...params, equipment: makeEquipment(['mat', 'pullup_bar', 'table']) }
    expect(acceptSuggestion(levelUp('australian-row'), withGear)?.exerciseId).toBe('australian-row')
  })
})
