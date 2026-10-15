import { describe, expect, it } from 'vitest'
import type { EngineInput, SessionPlan } from '../../types/engine'
import type { Exercise, LibraryExercise, Session } from '../../types/training'
import { addDays } from '../shared/dates'
import { estimateMinutes, estimateSeconds } from './estimate'
import { SESSION_FORMATS, generateSession, lightSetsLine, replacementCandidates } from './generate'
import { patternLevels } from './levels'
import { isAvailable } from './library'
import { isAdjustable } from './loads'
import {
  DURATIONS,
  T0,
  byId,
  doneSession,
  makeEquipment,
  makeInput,
  makeState,
  planExerciseIds,
  seedLibrary,
} from './testkit'

const FULL = makeEquipment(['mat', 'pullup_bar', 'bench', 'table', 'bands'])
const dates = (n: number): string[] => Array.from({ length: n }, (_, i) => addDays('2026-10-15', i))

function exercisesOf(plan: SessionPlan, library: readonly Exercise[]): LibraryExercise[] {
  return planExerciseIds(plan).map((id) => byId(library, id))
}

/** Un panel varié d'entrées : dates, matériel, états débloqués, historique. */
function inputs(): EngineInput[] {
  const out: EngineInput[] = []
  const unlocked = [
    makeState('goblet-squat', { loadKg: 16 }),
    makeState('two-hand-swing', { loadKg: 16 }),
    makeState('push-up'),
    makeState('one-arm-row', { loadKg: 14 }),
    makeState('hollow-hold', { targetDurationSec: 25 }),
    makeState('hammer-curl', { loadKg: 12 }),
  ]
  const history = [
    doneSession('2026-10-13', [
      ['goblet-squat', 3],
      ['push-up', 3],
    ]),
  ]
  for (const durationMin of DURATIONS) {
    for (const date of dates(6)) {
      for (const equipment of [makeEquipment(), FULL]) {
        out.push(makeInput({ durationMin, date, equipment }))
        out.push(
          makeInput({ durationMin, date, equipment, states: unlocked, sessions: history, profileLevel: 1 }),
        )
      }
    }
  }
  return out
}

describe('formats (SPEC §3.2 étape 5)', () => {
  it('20 min : 3 exercices × 3 séries en supersets (superset + bloc simple, ou circuit de 3 si le temps l’exige)', () => {
    const shapes = new Set<string>()
    for (const input of inputs().filter((i) => i.durationMin === 20)) {
      const plan = generateSession(input)
      expect(planExerciseIds(plan)).toHaveLength(3)
      expect(plan.blocks.flatMap((b) => b.exercises).every((e) => e.sets.length === 3)).toBe(true)
      const shape = plan.blocks
        .map((b) => `${b.kind}:${b.exercises.length}`)
        .sort()
        .join(',')
      expect(['single:1,superset:2', 'superset:3']).toContain(shape)
      shapes.add(shape)
    }
    // Forme préférée : superset + bloc simple ; le circuit reste l'exception.
    expect(shapes.has('single:1,superset:2')).toBe(true)
  })

  it('30 min : 4 exercices × 3 séries en 2 supersets sans groupe primaire commun', () => {
    for (const input of inputs().filter((i) => i.durationMin === 30)) {
      const plan = generateSession(input)
      expect(planExerciseIds(plan)).toHaveLength(4)
      expect(plan.blocks.flatMap((b) => b.exercises).every((e) => e.sets.length === 3)).toBe(true)
      for (const b of plan.blocks.filter((x) => x.kind === 'superset')) {
        const [a, c] = b.exercises.map((e) => byId(input.library, e.exerciseId))
        expect(a?.muscles.primary.some((g) => c?.muscles.primary.includes(g))).toBe(false)
        // Même repos (après le tour) pour les deux exercices.
        expect(b.exercises[0]?.restSec).toBe(b.exercises[1]?.restSec)
      }
    }
  })

  it('30 min matériel par défaut : supersets agoniste / antagoniste (poussée avec tirage)', () => {
    const plan = generateSession(makeInput({ durationMin: 30 }))
    expect(plan.blocks.every((b) => b.kind === 'superset')).toBe(true)
    const library = seedLibrary()
    const pairs = plan.blocks.map((b) => b.exercises.map((e) => byId(library, e.exerciseId).pattern))
    expect(pairs.some((p) => p.includes('pull') && (p.includes('push_h') || p.includes('push_v')))).toBe(true)
  })

  it('45 min : 5–6 exercices × 3–4 séries, blocs simples', () => {
    for (const input of inputs().filter((i) => i.durationMin === 45)) {
      const plan = generateSession(input)
      const n = planExerciseIds(plan).length
      expect(n).toBeGreaterThanOrEqual(5)
      expect(n).toBeLessThanOrEqual(6)
      for (const b of plan.blocks) {
        expect(b.kind).toBe('single')
        for (const e of b.exercises) expect([3, 4]).toContain(e.sets.length)
      }
    }
  })

  it('60 min : 6–7 exercices × 3–4 séries + un finisher (portés ou swings)', () => {
    for (const input of inputs().filter((i) => i.durationMin === 60)) {
      const plan = generateSession(input)
      const main = plan.blocks.filter((b) => b.kind !== 'finisher').flatMap((b) => b.exercises)
      expect(main.length).toBeGreaterThanOrEqual(6)
      expect(main.length).toBeLessThanOrEqual(7)
      const fin = plan.blocks.filter((b) => b.kind === 'finisher')
      expect(fin).toHaveLength(1)
      expect(plan.blocks.at(-1)?.kind).toBe('finisher')
      const fx = byId(input.library, fin[0]?.exercises[0]?.exerciseId ?? '')
      expect(fx.finisher).toBe(true)
      expect(['carry', 'hinge']).toContain(fx.pattern)
    }
  })

  it('ids de blocs b1, b2, …', () => {
    const plan = generateSession(makeInput({ durationMin: 60 }))
    expect(plan.blocks.map((b) => b.id)).toEqual(plan.blocks.map((_, i) => `b${i + 1}`))
  })
})

describe('durée estimée', () => {
  it('tient dans ± 10 % de la durée choisie (20, 30, 45, 60)', () => {
    for (const input of inputs()) {
      const plan = generateSession(input)
      const sec = estimateSeconds(plan.blocks, input.library, plan.warmupMin)
      expect(sec / 60, `${input.durationMin} min le ${input.date}`).toBeGreaterThanOrEqual(
        input.durationMin * 0.9,
      )
      expect(sec / 60, `${input.durationMin} min le ${input.date}`).toBeLessThanOrEqual(
        input.durationMin * 1.1,
      )
    }
  })

  it('estimatedMin = estimateMinutes(blocs, bibliothèque, échauffement)', () => {
    for (const d of DURATIONS) {
      const input = makeInput({ durationMin: d })
      const plan = generateSession(input)
      expect(plan.estimatedMin).toBe(estimateMinutes(plan.blocks, input.library, plan.warmupMin))
    }
  })

  it('échauffement de 3 à 6 min selon la durée, mobilité puis séries légères du premier mouvement', () => {
    for (const d of DURATIONS) {
      const plan = generateSession(makeInput({ durationMin: d }))
      const [lo, hi] = SESSION_FORMATS[d].warmup
      expect(plan.warmupMin).toBeGreaterThanOrEqual(Math.max(3, lo))
      expect(plan.warmupMin).toBeLessThanOrEqual(Math.min(6, hi))
      expect(plan.warmup.length).toBeGreaterThanOrEqual(3)
      const first = byId(seedLibrary(), plan.blocks[0]?.exercises[0]?.exerciseId ?? '')
      expect(plan.warmup.at(-1)).toContain(first.name)
      for (const line of plan.warmup) expect(line).toMatch(/\.$/)
    }
  })
})

describe('candidats', () => {
  it('matériel possédé uniquement ; non masqués ; niveau ≤ niveau atteint du schéma', () => {
    for (const input of inputs()) {
      const plan = generateSession(input)
      const levels = patternLevels(input.library, input.states, input.profileLevel)
      for (const ex of exercisesOf(plan, input.library)) {
        expect(isAvailable(ex, input.equipment)).toBe(true)
        expect(ex.preference).not.toBe('hidden')
        expect(ex.level).toBeLessThanOrEqual(levels[ex.pattern])
      }
    }
  })

  it('sans barre : aucune traction ; avec barre : tractions négatives possibles', () => {
    const ids = dates(7).flatMap((date) =>
      planExerciseIds(generateSession(makeInput({ date, durationMin: 45 }))),
    )
    expect(ids).not.toContain('negative-pull-up')
    expect(ids).not.toContain('pull-up')
    const withBar = dates(7).flatMap((date) =>
      planExerciseIds(
        generateSession(
          makeInput({ date, durationMin: 45, equipment: makeEquipment(['mat', 'pullup_bar']) }),
        ),
      ),
    )
    expect(withBar).toContain('negative-pull-up')
    expect(withBar).not.toContain('pull-up') // niveau 3
  })

  it('préfère le niveau atteint au niveau inférieur dans un schéma', () => {
    const states = [makeState('goblet-squat', { loadKg: 16 })]
    const library = seedLibrary()
    let seen = 0
    for (const date of dates(10)) {
      const exs = exercisesOf(generateSession(makeInput({ date, durationMin: 45, states })), library)
      for (const ex of exs.filter((e) => e.pattern === 'squat')) {
        expect(ex.id).toBe('goblet-squat')
        seen++
      }
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('hidden : jamais proposé', () => {
    const library = seedLibrary({ 'incline-push-up': 'hidden', 'bodyweight-squat': 'hidden' })
    for (const input of inputs()) {
      const ids = planExerciseIds(generateSession({ ...input, library }))
      expect(ids).not.toContain('incline-push-up')
      expect(ids).not.toContain('bodyweight-squat')
    }
  })

  it('liked × 1,5 : un exercice aimé passe devant son concurrent', () => {
    // Par défaut le squat au poids du corps est choisi (niveau 1, même score de groupes).
    const base = planExerciseIds(generateSession(makeInput({ durationMin: 20 })))
    expect(base).toContain('bodyweight-squat')
    const liked = planExerciseIds(
      generateSession(makeInput({ durationMin: 20, library: seedLibrary({ 'box-goblet-squat': 'liked' }) })),
    )
    expect(liked).toContain('box-goblet-squat')
    expect(liked).not.toContain('bodyweight-squat')
  })

  it('disliked × 0,3 : évité quand une alternative existe', () => {
    const library = seedLibrary({ 'bodyweight-squat': 'disliked' })
    for (const date of dates(5)) {
      const ids = planExerciseIds(generateSession(makeInput({ date, durationMin: 20, library })))
      expect(ids).not.toContain('bodyweight-squat')
    }
  })

  it('disliked conservé s’il est le seul à couvrir un groupe en déficit', () => {
    // Sans barre ni table, seul le rowing avec appui (niveau 1) travaille le dos en primaire.
    const library = seedLibrary({ 'supported-one-arm-row': 'disliked' })
    for (const d of DURATIONS) {
      expect(planExerciseIds(generateSession(makeInput({ durationMin: d, library })))).toContain(
        'supported-one-arm-row',
      )
    }
  })
})

describe('séries et charges', () => {
  it('reps visées = repRange ; durée = état ou bas de fourchette ; poids du corps sans charge', () => {
    const states = [makeState('farmer-carry', { loadKg: 15, targetDurationSec: 40 })]
    const input = makeInput({ durationMin: 60, states })
    const plan = generateSession(input)
    for (const b of plan.blocks) {
      for (const e of b.exercises) {
        const ex = byId(input.library, e.exerciseId)
        for (const s of e.sets) {
          if (ex.repRange) expect(s.targetReps).toEqual(ex.repRange)
          if (ex.durationRange) {
            const st = states.find((x) => x.exerciseId === ex.id)
            expect(s.targetDurationSec).toBe(st?.targetDurationSec ?? ex.durationRange[0])
          }
          if (ex.loadType !== 'kettlebell') expect(s.loadKg).toBeUndefined()
        }
      }
    }
    const carry = plan.blocks.flatMap((b) => b.exercises).find((e) => e.exerciseId === 'farmer-carry')
    expect(carry?.sets[0]?.loadKg).toBe(15)
  })

  it('charge = état sinon minimum de la kettlebell, toujours réglable', () => {
    const kb = { minKg: 8, maxKg: 32, stepKg: 4 }
    const equipment = makeEquipment(['mat'], kb)
    const states = [
      makeState('supported-one-arm-row', { loadKg: 15 }),
      makeState('kb-deadlift', { loadKg: 40 }),
    ]
    for (const d of DURATIONS) {
      const plan = generateSession(makeInput({ durationMin: d, equipment, states }))
      for (const e of plan.blocks.flatMap((b) => b.exercises)) {
        for (const s of e.sets) if (s.loadKg !== undefined) expect(isAdjustable(s.loadKg, kb)).toBe(true)
        if (e.exerciseId === 'supported-one-arm-row') expect(e.sets[0]?.loadKg).toBe(12)
        if (e.exerciseId === 'kb-deadlift') expect(e.sets[0]?.loadKg).toBe(32)
        if (e.exerciseId === 'half-kneeling-press') expect(e.sets[0]?.loadKg).toBe(8)
      }
    }
  })
})

describe('tempo', () => {
  it('tempo 3-1-1 sur un exercice en répétitions dont l’état a tempo: true, jamais sur une durée', () => {
    const states = [
      makeState('supported-one-arm-row', { loadKg: 24, tempo: true }),
      makeState('farmer-carry', { loadKg: 24, targetDurationSec: 60, tempo: true }),
    ]
    const plan = generateSession(makeInput({ durationMin: 60, states }))
    const all = plan.blocks.flatMap((b) => b.exercises)
    const row = all.find((e) => e.exerciseId === 'supported-one-arm-row')
    expect(row?.tempo).toBe('3-1-1')
    const carry = all.find((e) => e.exerciseId === 'farmer-carry')
    expect(carry).toBeDefined()
    expect(carry?.tempo).toBeUndefined()
    for (const e of all.filter((x) => x.exerciseId !== 'supported-one-arm-row'))
      expect(e.tempo).toBeUndefined()
  })
})

describe('deload', () => {
  it('actif → deload: true, séries divisées par deux (au moins 2), charge inchangée', () => {
    const states = [makeState('supported-one-arm-row', { loadKg: 16 })]
    const normal = generateSession(makeInput({ durationMin: 45, states }))
    const sessions: Session[] = [{ ...doneSession('2026-10-13', [['plank', 2]]), deload: true }]
    const plan = generateSession(makeInput({ durationMin: 45, states, sessions }))
    expect(plan.deload).toBe(true)
    expect(normal.deload).toBe(false)
    for (const e of plan.blocks.flatMap((b) => b.exercises)) expect(e.sets.length).toBe(2)
    const row = plan.blocks.flatMap((b) => b.exercises).find((e) => e.exerciseId === 'supported-one-arm-row')
    expect(row?.sets[0]?.loadKg).toBe(16)
    expect(plan.estimatedMin).toBeLessThan(normal.estimatedMin)
  })
})

describe('fatigue, variété, focus', () => {
  it('un groupe chargé lourdement hier est mis en retrait aujourd’hui', () => {
    const sessions = [
      doneSession('2026-10-14', [
        ['box-goblet-squat', 4],
        ['reverse-lunge-bw', 4],
      ]),
    ]
    for (const d of DURATIONS) {
      const plan = generateSession(makeInput({ durationMin: d, sessions }))
      const exs = exercisesOf(plan, seedLibrary())
      const hit = exs.filter((ex) => ex.muscles.primary.some((g) => g === 'quads' || g === 'glutes'))
      expect(hit, `${d} min`).toHaveLength(0)
      expect(plan.focus).not.toContain('quads')
    }
  })

  it('léger malus pour un exercice de la dernière séance', () => {
    // Deux exercices identiques (sauf l'id) : celui fait à la dernière séance cède la place.
    const library = seedLibrary()
    const twin: LibraryExercise = {
      ...byId(library, 'bodyweight-squat'),
      id: 'zz-squat-clone',
      name: 'Squat clone',
      source: 'user',
    }
    const lib = [...library, twin]
    const first = planExerciseIds(generateSession(makeInput({ durationMin: 20, library: lib })))
    const chosen = first.includes('bodyweight-squat') ? 'bodyweight-squat' : 'zz-squat-clone'
    const other = chosen === 'bodyweight-squat' ? 'zz-squat-clone' : 'bodyweight-squat'
    // Séance hors des 7 jours : elle ne change pas le volume, seulement « la dernière séance ».
    const sessions = [doneSession('2026-10-01', [[chosen, 1]])]
    const next = planExerciseIds(generateSession(makeInput({ durationMin: 20, library: lib, sessions })))
    expect(next).toContain(other)
    expect(next).not.toContain(chosen)
  })

  it('pas deux fois le même schéma pour ≤ 30 min', () => {
    for (const input of inputs().filter((i) => i.durationMin <= 30)) {
      const patterns = exercisesOf(generateSession(input), input.library).map((e) => e.pattern)
      expect(new Set(patterns).size).toBe(patterns.length)
    }
  })

  it('polyarticulaires d’abord', () => {
    for (const input of inputs().filter((i) => i.durationMin >= 45)) {
      const exs = exercisesOf(generateSession(input), input.library).filter((e) => e.pattern !== 'carry')
      const firstAccessory = exs.findIndex((e) => !e.compound)
      if (firstAccessory >= 0) {
        expect(exs.slice(firstAccessory).every((e) => !e.compound || e.pattern === 'core')).toBe(true)
      }
    }
  })

  it('focus = groupes en déficit couverts, du plus au moins prioritaire', () => {
    const plan = generateSession(makeInput({ durationMin: 30 }))
    expect(plan.focus[0]).toBe('back') // cible 10–14 sans barre : plus gros déficit
    const covered = new Set(exercisesOf(plan, seedLibrary()).flatMap((e) => e.muscles.primary))
    for (const g of plan.focus) expect(covered.has(g)).toBe(true)
  })
})

describe('déterminisme', () => {
  it('même entrée → même sortie, quel que soit l’ordre de la bibliothèque', () => {
    for (const input of inputs().slice(0, 24)) {
      const a = generateSession(input)
      const b = generateSession({
        ...input,
        library: [...input.library].reverse(),
        states: [...input.states].reverse(),
      })
      expect(b).toEqual(a)
      expect(generateSession(input)).toEqual(a)
    }
  })

  it('ne lit ni l’horloge ni Math.random', () => {
    const rnd = Math.random
    const now = Date.now
    Math.random = () => {
      throw new Error('Math.random interdit')
    }
    Date.now = () => {
      throw new Error('Date.now interdit')
    }
    try {
      for (const d of DURATIONS) generateSession(makeInput({ durationMin: d }))
    } finally {
      Math.random = rnd
      Date.now = now
    }
  })
})

describe('replacementCandidates', () => {
  it('même schéma, niveau ≤ atteint, disponible, non masqué, différent', () => {
    const library = seedLibrary({ 'kb-floor-press': 'hidden' })
    const states = [makeState('push-up')]
    const ids = replacementCandidates('push-up', makeInput({ library, states })).map((e) => e.id)
    expect(ids).toContain('incline-push-up')
    expect(ids).not.toContain('push-up')
    expect(ids).not.toContain('kb-floor-press') // masqué
    expect(ids).not.toContain('decline-push-up') // niveau 3 et banc
    expect(ids).not.toContain('archer-push-up') // niveau 3
  })

  it('triés par pertinence : liked d’abord, puis niveau atteint', () => {
    const states = [makeState('goblet-squat', { loadKg: 16 })]
    const library = seedLibrary({ 'bodyweight-squat': 'liked' })
    const ids = replacementCandidates('goblet-squat', makeInput({ library, states })).map((e) => e.id)
    expect(ids[0]).toBe('bodyweight-squat')
    expect(ids).toContain('box-goblet-squat')
  })

  it('excludeIds : ids déjà dans le plan exclus', () => {
    const states = [makeState('goblet-squat', { loadKg: 16 })]
    const ids = replacementCandidates('goblet-squat', makeInput({ states }), ['box-goblet-squat']).map(
      (e) => e.id,
    )
    expect(ids).not.toContain('box-goblet-squat')
    expect(ids).toContain('bodyweight-squat')
  })

  it('exercice inconnu → liste vide', () => {
    expect(replacementCandidates('inconnu', makeInput())).toEqual([])
  })

  it('les exercices de l’utilisateur sont candidats', () => {
    const custom: LibraryExercise = {
      ...byId(seedLibrary(), 'bodyweight-squat'),
      id: 'user-1',
      name: 'Squat sumo',
      source: 'user',
      updatedAt: T0,
    }
    const ids = replacementCandidates(
      'bodyweight-squat',
      makeInput({ library: [...seedLibrary(), custom] }),
    ).map((e) => e.id)
    expect(ids).toContain('user-1')
  })
})

describe('corrections de revue (génération)', () => {
  it('« dernière séance » indépendante de l’ordre de sessions (départage startedAt puis id)', () => {
    const a: Session = {
      ...doneSession('2026-10-12', [['bodyweight-squat', 1]]),
      id: 'a',
      startedAt: '2026-10-12T08:00:00.000Z',
    }
    const b: Session = {
      ...doneSession('2026-10-12', [['box-goblet-squat', 1]]),
      id: 'b',
      startedAt: '2026-10-12T18:00:00.000Z',
    }
    const c: Session = { ...doneSession('2026-10-12', [['reverse-lunge-bw', 1]]), id: 'c' }
    for (const d of DURATIONS) {
      const p1 = generateSession(makeInput({ durationMin: d, sessions: [a, b, c] }))
      expect(generateSession(makeInput({ durationMin: d, sessions: [c, b, a] }))).toEqual(p1)
      expect(generateSession(makeInput({ durationMin: d, sessions: [b, c, a] }))).toEqual(p1)
    }
  })

  it('20 / 30 min : jamais moins de 3 séries hors deload', () => {
    for (const input of inputs().filter((i) => i.durationMin <= 30)) {
      for (const e of generateSession(input).blocks.flatMap((b) => b.exercises))
        expect(e.sets.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('échauffement d’un swing : pas de « série sans charge », texte balistique', () => {
    const swing = byId(seedLibrary(), 'two-hand-swing')
    const kb = { minKg: 12, maxKg: 24, stepKg: 1 }
    const line = lightSetsLine(
      swing,
      { exerciseId: swing.id, restSec: 90, sets: [{ targetReps: [12, 20], loadKg: 16 }] },
      kb,
    )
    expect(line).not.toContain('sans charge')
    expect(line).toContain('swings')
    expect(line).toContain('12 kg')
  })

  it('tempo pris en compte dans l’estimation (5 s par répétition), durée toujours dans ± 10 %', () => {
    const states = [makeState('supported-one-arm-row', { loadKg: 24, tempo: true })]
    const input = makeInput({ durationMin: 30, states })
    const plan = generateSession(input)
    expect(
      plan.blocks.flatMap((b) => b.exercises).find((e) => e.exerciseId === 'supported-one-arm-row')?.tempo,
    ).toBe('3-1-1')
    const sec = estimateSeconds(plan.blocks, input.library, plan.warmupMin)
    expect(sec / 60).toBeGreaterThanOrEqual(27)
    expect(sec / 60).toBeLessThanOrEqual(33)
  })

  it('bibliothèque vide ou tout masqué : blocs vides, pas d’exception, estimatedMin = warmupMin', () => {
    const allHidden = seedLibrary(Object.fromEntries(seedLibrary().map((e) => [e.id, 'hidden' as const])))
    for (const library of [[], allHidden]) {
      for (const d of DURATIONS) {
        const plan = generateSession(makeInput({ durationMin: d, library }))
        expect(plan.blocks).toEqual([])
        expect(plan.estimatedMin).toBe(plan.warmupMin)
        expect(plan.focus).toEqual([])
      }
    }
  })

  it('deloadReason : raison du deloadStatus quand actif, absente sinon', () => {
    const hard = (date: string): Session => doneSession(date, [['plank', 3, 'hard']])
    const fatigue = generateSession(
      makeInput({ sessions: [hard('2026-10-12'), hard('2026-10-13'), hard('2026-10-14')] }),
    )
    expect(fatigue.deload).toBe(true)
    expect(fatigue.deloadReason).toBe('fatigue')
    const scheduled = generateSession(makeInput({ sessions: [doneSession('2026-09-01', [['plank', 2]])] }))
    expect(scheduled.deloadReason).toBe('scheduled')
    const none = generateSession(makeInput())
    expect(none.deload).toBe(false)
    expect(none).not.toHaveProperty('deloadReason')
  })
})
