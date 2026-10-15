import { describe, expect, it } from 'vitest'
import { seedExercises } from '../../content'
import { generateSession, addCandidates } from './generate'
import { applySessionResult, unlockState, LEVEL_UP_STREAK } from './progression'
import {
  TEMPO_3_1_1,
  buildSessionExercise,
  buildTargetSets,
  isBallistic,
  isFinisherExercise,
  isLearningUnloaded,
} from './sets'
import { byId, makeEquipment, makeInput, makeState, seedLibrary } from './testkit'
import type { SetEntry } from '../../types/training'

const lib = seedLibrary()
const eq = makeEquipment(['mat'], { minKg: 12, maxKg: 24, stepKg: 2 })

describe('drapeaux du contenu de départ', () => {
  it('finisher = swings deux mains / une main et les trois portés', () => {
    const ids = seedExercises.filter((e) => e.finisher === true).map((e) => e.id)
    expect(ids.sort()).toEqual(
      ['farmer-carry', 'one-hand-swing', 'rack-carry', 'suitcase-carry', 'two-hand-swing'].sort(),
    )
  })

  it('learnUnloaded = Turkish get-up seulement', () => {
    expect(seedExercises.filter((e) => e.learnUnloaded === true).map((e) => e.id)).toEqual(['turkish-get-up'])
  })

  it('balistique = finisher du schéma hinge', () => {
    expect(isBallistic(byId(lib, 'two-hand-swing'))).toBe(true)
    expect(isBallistic(byId(lib, 'farmer-carry'))).toBe(false)
    expect(isFinisherExercise(byId(lib, 'farmer-carry'))).toBe(true)
    expect(isBallistic(byId(lib, 'kb-deadlift'))).toBe(false)
  })

  it('un exercice perso marqué finisher peut finir une séance de 60 min', () => {
    const custom = {
      ...byId(lib, 'farmer-carry'),
      id: 'my-carry',
      name: 'Mon porté',
      source: 'user' as const,
    }
    const library = [
      ...lib.map((e) => (e.finisher === true ? { ...e, preference: 'hidden' as const } : e)),
      { ...custom, preference: 'liked' as const },
    ]
    const plan = generateSession(makeInput({ durationMin: 60, library }))
    expect(plan.blocks.at(-1)?.kind).toBe('finisher')
    expect(plan.blocks.at(-1)?.exercises[0]?.exerciseId).toBe('my-carry')
  })
})

describe('buildTargetSets', () => {
  it('répétitions : fourchette de l’exercice, charge de l’état arrondie vers le bas à une charge réglable', () => {
    const sets = buildTargetSets(byId(lib, 'goblet-squat'), makeState('goblet-squat', { loadKg: 17 }), eq, 3)
    expect(sets).toHaveLength(3)
    expect(sets[0]).toEqual({ targetReps: byId(lib, 'goblet-squat').repRange, loadKg: 16 })
  })

  it('sans état : plus petite charge réglable ; durée = bas de la fourchette', () => {
    const carry = byId(lib, 'farmer-carry')
    const [s] = buildTargetSets(carry, undefined, eq, 1)
    expect(s).toEqual({ targetDurationSec: carry.durationRange?.[0], loadKg: 12 })
  })

  it('durée de l’état bornée à la fourchette', () => {
    const plank = byId(lib, 'plank')
    const [s] = buildTargetSets(plank, makeState('plank', { targetDurationSec: 999 }), eq, 1)
    expect(s?.targetDurationSec).toBe(plank.durationRange?.[1])
    expect(s?.loadKg).toBeUndefined()
  })

  it('Turkish get-up en apprentissage : aucune charge', () => {
    const tgu = byId(lib, 'turkish-get-up')
    expect(isLearningUnloaded(tgu, undefined)).toBe(true)
    expect(buildTargetSets(tgu, undefined, eq, 2)[0]?.loadKg).toBeUndefined()
    expect(buildTargetSets(tgu, makeState(tgu.id), eq, 2)[0]?.loadKg).toBeUndefined()
    expect(buildTargetSets(tgu, makeState(tgu.id, { loadKg: 12 }), eq, 2)[0]?.loadKg).toBe(12)
  })

  it('nombre de séries invalide → aucune série', () => {
    expect(buildTargetSets(byId(lib, 'plank'), undefined, eq, -1)).toEqual([])
    expect(buildTargetSets(byId(lib, 'plank'), undefined, eq, Number.NaN)).toEqual([])
  })

  it('buildSessionExercise : repos de l’exercice par défaut, tempo accepté en répétitions seulement', () => {
    const row = byId(lib, 'supported-one-arm-row')
    const se = buildSessionExercise(row, makeState(row.id, { loadKg: 24, tempo: true }), eq, 3)
    expect(se.restSec).toBe(row.restSec)
    expect(se.tempo).toBe(TEMPO_3_1_1)
    const plank = byId(lib, 'plank')
    expect(buildSessionExercise(plank, makeState(plank.id, { tempo: true }), eq, 3, 30)).toMatchObject({
      restSec: 30,
    })
    expect(buildSessionExercise(plank, makeState(plank.id, { tempo: true }), eq, 3).tempo).toBeUndefined()
  })
})

describe('apprentissage sans charge (learnUnloaded)', () => {
  const tgu = byId(lib, 'turkish-get-up')
  const top = (n: number, feeling: SetEntry['feeling'] = 'ok'): SetEntry[] =>
    Array.from({ length: n }, () => ({ targetReps: tgu.repRange, status: 'done', actualReps: 3, feeling }))

  it('unlockState : loadKg null même pour un exercice kettlebell', () => {
    expect(unlockState(tgu, eq, '2026-10-15').loadKg).toBeNull()
    expect(unlockState(byId(lib, 'goblet-squat'), eq, '2026-10-15').loadKg).toBe(12)
  })

  const run = (state: ReturnType<typeof makeState> | undefined, sets: SetEntry[], deload = false) =>
    applySessionResult({
      exercise: tgu,
      state,
      performed: { sets },
      equipment: eq,
      library: lib,
      date: '2026-10-15',
      profileLevel: 3,
      deload,
    })

  it(`pas de charge avant ${LEVEL_UP_STREAK} séances au haut de la fourchette, puis la plus petite charge`, () => {
    const first = run(undefined, top(2))
    expect(first.state.loadKg).toBeNull()
    expect(first.change).toBe('hold')
    expect(first.state.topStreak).toBe(1)
    expect(first.suggestion).toBeUndefined()
    const second = run(first.state, top(2))
    expect(second.state.loadKg).toBe(12)
    expect(second.change).toBe('increase')
    expect(second.state.topStreak).toBe(0)
  })

  it('haut de fourchette manqué → la série est remise à zéro, toujours sans charge', () => {
    const s1 = run(undefined, top(2))
    const miss = run(s1.state, [{ targetReps: tgu.repRange, status: 'done', actualReps: 1, feeling: 'ok' }])
    expect(miss.state.loadKg).toBeNull()
    expect(miss.state.topStreak).toBe(0)
  })

  it('deux séances hard : pas de passage à la charge', () => {
    const s1 = run(undefined, top(2, 'hard'))
    const s2 = run(s1.state, top(2, 'hard'))
    expect(s2.state.loadKg).toBeNull()
    expect(s2.change).toBe('hold')
  })

  it('deload : pas de passage à la charge', () => {
    const s1 = run(undefined, top(2))
    const s2 = run(s1.state, top(2), true)
    expect(s2.state.loadKg).toBeNull()
  })

  it('jamais de suggestion pendant l’apprentissage (pas de « max atteint » sans charge)', () => {
    let state = run(undefined, top(2)).state
    for (let i = 0; i < 4; i++) {
      const r = run({ ...state, loadKg: null, topStreak: 5 }, top(2, 'hard'))
      expect(r.suggestion).toBeUndefined()
      state = r.state
    }
  })

  it('génération : séries du TGU sans charge (profil avancé, apprentissage)', () => {
    const states = [makeState('turkish-get-up', { loadKg: null })]
    // Bibliothèque réduite : le TGU fait forcément partie de la séance de 20 min (3 exercices).
    const library = lib.filter((e) => [tgu.id, 'goblet-squat', 'supported-one-arm-row'].includes(e.id))
    const plan = generateSession(makeInput({ durationMin: 20, profileLevel: 3, states, library }))
    const se = plan.blocks.flatMap((b) => b.exercises).find((e) => e.exerciseId === tgu.id)
    expect(se).toBeDefined()
    for (const s of se?.sets ?? []) expect(s.loadKg).toBeUndefined()
    const squat = plan.blocks.flatMap((b) => b.exercises).find((e) => e.exerciseId === 'goblet-squat')
    expect(squat?.sets[0]?.loadKg).toBe(12)
  })
})

describe('addCandidates', () => {
  it('niveau ≤ niveau atteint du schéma : un débutant ne peut pas ajouter un niveau 2 ou 3', () => {
    const ids = addCandidates(makeInput()).map((e) => e.id)
    expect(ids).toContain('kb-deadlift')
    expect(ids).not.toContain('two-hand-swing')
    expect(ids).not.toContain('turkish-get-up')
    for (const id of ids) expect(byId(lib, id).level).toBe(1)
  })

  it('un état de niveau 2 débloque le niveau 2 de ce schéma seulement', () => {
    const ids = addCandidates(makeInput({ states: [makeState('two-hand-swing', { loadKg: 16 })] })).map(
      (e) => e.id,
    )
    expect(ids).toContain('two-hand-swing')
    expect(ids).not.toContain('one-hand-swing')
    expect(ids).not.toContain('goblet-squat')
  })

  it('exclut les ids donnés, les masqués et le matériel manquant ; trié par schéma', () => {
    const library = seedLibrary({ 'kb-deadlift': 'hidden' })
    const list = addCandidates(makeInput({ library }), ['plank'])
    const ids = list.map((e) => e.id)
    expect(ids).not.toContain('plank')
    expect(ids).not.toContain('kb-deadlift')
    for (const ex of list)
      for (const need of ex.equipment) if (need !== 'kettlebell') expect(['mat']).toContain(need)
    const order = ['hinge', 'squat', 'lunge', 'push_h', 'push_v', 'pull', 'core', 'carry', 'arms', 'calves']
    const ranks = list.map((e) => order.indexOf(e.pattern))
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks)
  })
})
