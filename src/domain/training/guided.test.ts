import { describe, expect, it } from 'vitest'
import type { SessionPlan } from '../../types/engine'
import type { Session, SessionBlock, SessionCursor, SetEntry } from '../../types/training'
import { SUPERSET_TRANSITION_SEC, estimateMinutes } from './estimate'
import { generateSession } from './generate'
import {
  addExercise,
  currentStep,
  moveBlock,
  sessionEstimateMinutes,
  newBlockId,
  nextStep,
  recordSet,
  removeExercise,
  replaceExercise,
  restAfter,
  sessionFromPlan,
  sessionSteps,
  setAt,
  skipExercise,
  skipSet,
  undoSet,
} from './guided'
import { T0, byId, exAt, makeEquipment, makeInput, makeState, must, seedLibrary } from './testkit'

const lib = seedLibrary()
const eq = makeEquipment()
const NOW = '2026-10-15T18:00:00.000Z'

const reps = (n: number, load?: number): SetEntry[] =>
  Array.from({ length: n }, () => ({ targetReps: [8, 12], ...(load !== undefined ? { loadKg: load } : {}) }))

/** Séance : b1 superset A (squat, 3 séries, repos 90) + B (rowing, 3 séries, repos 60) ; b2 simple C (2 séries, 75). */
function makeSession(over: Partial<Session> = {}): Session {
  const blocks: SessionBlock[] = [
    {
      id: 'b1',
      kind: 'superset',
      exercises: [
        { exerciseId: 'box-goblet-squat', restSec: 90, sets: reps(3, 12) },
        { exerciseId: 'supported-one-arm-row', restSec: 60, sets: reps(3, 12) },
      ],
    },
    { id: 'b2', kind: 'single', exercises: [{ exerciseId: 'incline-push-up', restSec: 75, sets: reps(2) }] },
  ]
  return {
    id: 's1',
    date: '2026-10-15',
    durationMin: 20,
    status: 'in_progress',
    warmup: [],
    blocks,
    deload: false,
    estimatedMin: 20,
    startedAt: T0,
    cursor: { block: 0, exercise: 0, set: 0 },
    updatedAt: T0,
    ...over,
  }
}

const c = (block: number, exercise: number, set: number): SessionCursor => ({ block, exercise, set })
const ok = { reps: 10, feeling: 'ok' as const }

describe('ordre de passage', () => {
  it('superset tour par tour puis bloc simple série après série', () => {
    expect(sessionSteps(makeSession())).toEqual([
      c(0, 0, 0),
      c(0, 1, 0),
      c(0, 0, 1),
      c(0, 1, 1),
      c(0, 0, 2),
      c(0, 1, 2),
      c(1, 0, 0),
      c(1, 0, 1),
    ])
  })

  it('superset : un exercice qui a moins de séries est sauté dans les tours suivants', () => {
    const s = makeSession()
    const blocks = s.blocks.map((b, i) =>
      i === 0 ? { ...b, exercises: [exAt(s, 0, 0), { ...exAt(s, 0, 1), sets: reps(1) }] } : b,
    )
    expect(sessionSteps(blocks).slice(0, 4)).toEqual([c(0, 0, 0), c(0, 1, 0), c(0, 0, 1), c(0, 0, 2)])
  })
})

describe('sessionFromPlan', () => {
  it('séance in_progress, startedAt = now, curseur sur la première série, sans suggestions ; plan non modifié', () => {
    const plan: SessionPlan = generateSession(makeInput({ durationMin: 30 }))
    const before = JSON.stringify(plan)
    const s = sessionFromPlan(plan, { id: 'abc', now: NOW })
    expect(s).toMatchObject({
      id: 'abc',
      status: 'in_progress',
      startedAt: NOW,
      updatedAt: NOW,
      date: plan.date,
      durationMin: 30,
      estimatedMin: plan.estimatedMin,
      warmupMin: plan.warmupMin,
      cursor: c(0, 0, 0),
    })
    expect(sessionEstimateMinutes(s, lib)).toBe(plan.estimatedMin)
    expect(s.suggestions).toBeUndefined()
    expect(s.blocks).toEqual(plan.blocks)
    must(exAt(s, 0, 0).sets[0]).status = 'done'
    expect(JSON.stringify(plan)).toBe(before)
  })

  it('sessionEstimateMinutes : recalculée après un remplacement ; séance sans warmupMin → échauffement 0', () => {
    const plan = generateSession(makeInput({ durationMin: 30 }))
    const s = sessionFromPlan(plan, { id: 'x', now: NOW })
    const r = removeExercise(s.blocks, 0, 0)
    expect(sessionEstimateMinutes({ ...s, blocks: r }, lib)).toBe(estimateMinutes(r, lib, plan.warmupMin))
    const { warmupMin, ...old } = s
    expect(sessionEstimateMinutes(old, lib)).toBe(estimateMinutes(s.blocks, lib, 0))
    expect(warmupMin).toBe(plan.warmupMin)
  })

  it('modèle : templateId reporté', () => {
    const plan = generateSession(makeInput({ durationMin: 20 }))
    expect(sessionFromPlan(plan, { id: 'x', now: NOW, templateId: 't1' }).templateId).toBe('t1')
  })
})

describe('currentStep / nextStep (reprise)', () => {
  it('reprend au curseur enregistré', () => {
    let s = makeSession()
    s = recordSet(s, c(0, 0, 0), ok)
    s = recordSet(s, c(0, 1, 0), ok)
    expect(s.cursor).toEqual(c(0, 0, 1))
    // Fermeture puis réouverture de l'app : la séance relue donne le même pas.
    const reread = JSON.parse(JSON.stringify(s)) as Session
    expect(currentStep(reread)).toEqual({ kind: 'set', cursor: c(0, 0, 1) })
  })

  it('curseur sur une série déjà faite → prochaine à faire ; puis retour au début s’il en reste avant', () => {
    let s = makeSession()
    s = skipSet(s, c(0, 0, 0))
    s = { ...s, blocks: s.blocks, cursor: c(1, 0, 0) }
    s = recordSet(s, c(1, 0, 0), ok)
    s = recordSet(s, c(1, 0, 1), ok)
    // Tout le bloc 2 est fait ; il reste le superset (série 0 de B…).
    expect(currentStep({ ...s, cursor: c(1, 0, 1) })).toEqual({ kind: 'set', cursor: c(0, 1, 0) })
  })

  it('curseur absent ou invalide → première série à faire', () => {
    const s = makeSession({ cursor: c(9, 9, 9) })
    expect(currentStep(s)).toEqual({ kind: 'set', cursor: c(0, 0, 0) })
    const { cursor, ...noCursor } = s
    void cursor
    expect(currentStep(noCursor)).toEqual({ kind: 'set', cursor: c(0, 0, 0) })
  })

  it('tout fait ou passé → finished', () => {
    let s = makeSession()
    for (const cur of sessionSteps(s)) s = skipSet(s, cur)
    expect(currentStep(s)).toEqual({ kind: 'finished' })
    expect(nextStep(s, c(0, 0, 0))).toEqual({ kind: 'finished' })
  })

  it('nextStep : après `from`, sinon depuis le début, sinon `from` s’il est le dernier à faire', () => {
    const s = makeSession()
    expect(nextStep(s, c(0, 0, 0))).toEqual({ kind: 'set', cursor: c(0, 1, 0) })
    expect(nextStep(s, c(1, 0, 1))).toEqual({ kind: 'set', cursor: c(0, 0, 0) })
    let only = makeSession()
    for (const cur of sessionSteps(only).slice(1)) only = skipSet(only, cur)
    expect(nextStep(only, c(0, 0, 0))).toEqual({ kind: 'set', cursor: c(0, 0, 0) })
  })
})

describe('restAfter', () => {
  const s = makeSession()
  it('superset : transition dans le tour, repos du tour (le plus long) après le tour', () => {
    expect(restAfter(s, c(0, 0, 0), lib)).toEqual({ kind: 'transition', seconds: SUPERSET_TRANSITION_SEC })
    expect(restAfter(s, c(0, 1, 0), lib)).toEqual({ kind: 'round', seconds: 90 })
  })

  it('bloc suivant : block ; entre deux séries : set ; dernière série : none', () => {
    expect(restAfter(s, c(0, 1, 2), lib)).toEqual({ kind: 'block', seconds: 90 })
    expect(restAfter(s, c(1, 0, 0), lib)).toEqual({ kind: 'set', seconds: 75 })
    let all = s
    for (const cur of sessionSteps(s).slice(0, -1)) all = recordSet(all, cur, ok)
    expect(restAfter(all, c(1, 0, 1), lib)).toEqual({ kind: 'none', seconds: 0 })
  })

  it('séries passées sautées : la série suivante du tour passée → repos du tour', () => {
    const skipped = skipSet(s, c(0, 1, 0))
    expect(restAfter(skipped, c(0, 0, 0), lib)).toEqual({ kind: 'round', seconds: 90 })
  })

  it('repos du plan ajusté utilisé ; repos invalide → repos de l’exercice', () => {
    const custom = makeSession()
    exAt(custom, 1, 0).restSec = Number.NaN
    expect(restAfter(custom, c(1, 0, 0), lib)).toEqual({
      kind: 'set',
      seconds: byId(lib, 'incline-push-up').restSec,
    })
  })

  it('séries restantes avant seulement → block ; curseur invalide → none', () => {
    const back = skipSet(makeSession(), c(0, 0, 0))
    let s2 = back
    for (const cur of sessionSteps(s2).slice(1)) s2 = recordSet(s2, cur, ok)
    const undone = undoSet(s2, c(0, 0, 0))
    expect(restAfter(undone, c(1, 0, 1), lib).kind).toBe('block')
    expect(restAfter(s, c(5, 0, 0), lib)).toEqual({ kind: 'none', seconds: 0 })
  })
})

describe('saisie', () => {
  it('recordSet : done, reps, ressenti, charge réelle ; curseur avancé ; entrée non modifiée', () => {
    const s = makeSession()
    const before = JSON.stringify(s)
    const r = recordSet(s, c(0, 0, 0), { reps: 11, loadKg: 14, feeling: 'hard' })
    expect(setAt(r, c(0, 0, 0))).toEqual({
      targetReps: [8, 12],
      loadKg: 14,
      status: 'done',
      actualReps: 11,
      feeling: 'hard',
    })
    expect(r.cursor).toEqual(c(0, 1, 0))
    expect(JSON.stringify(s)).toBe(before)
  })

  it('recordSet : durée pour un exercice en durée ; valeurs arrondies et ≥ 0 ; charge invalide ignorée', () => {
    const s = makeSession()
    const r = recordSet(s, c(1, 0, 0), { durationSec: 31.6, loadKg: -3, feeling: 'ok' })
    expect(setAt(r, c(1, 0, 0))).toMatchObject({ actualDurationSec: 32, status: 'done' })
    expect(setAt(r, c(1, 0, 0))?.loadKg).toBeUndefined()
    const neg = recordSet(s, c(1, 0, 0), { reps: -2, feeling: 'ok' })
    expect(setAt(neg, c(1, 0, 0))?.actualReps).toBe(0)
  })

  it('recordSet sur la dernière série : curseur laissé dessus, pas suivant = finished', () => {
    let s = makeSession()
    for (const cur of sessionSteps(s)) s = recordSet(s, cur, ok)
    expect(s.cursor).toEqual(c(1, 0, 1))
    expect(currentStep(s)).toEqual({ kind: 'finished' })
  })

  it('curseur invalide → erreur', () => {
    expect(() => recordSet(makeSession(), c(0, 0, 7), ok)).toThrow(RangeError)
  })

  it('skipSet : skipped, résultat effacé, curseur avancé', () => {
    const r = skipSet(recordSet(makeSession(), c(0, 0, 0), ok), c(0, 0, 0))
    expect(setAt(r, c(0, 0, 0))).toEqual({ targetReps: [8, 12], loadKg: 12, status: 'skipped' })
    expect(r.cursor).toEqual(c(0, 1, 0))
  })

  it('skipExercise : séries restantes passées, séries faites gardées, curseur sur la suite', () => {
    let s = recordSet(makeSession(), c(0, 0, 0), ok)
    s = skipExercise(s, 0, 1)
    const row = exAt(s, 0, 1).sets
    expect(row.map((x) => x.status)).toEqual(['skipped', 'skipped', 'skipped'])
    expect(exAt(s, 0, 0).sets[0]?.status).toBe('done')
    expect(s.cursor).toEqual(c(0, 0, 1))
    expect(sessionSteps(s).filter((cur) => setAt(s, cur)?.status === undefined)).toHaveLength(4)
  })

  it('undoSet : rend la série à faire et y ramène le curseur', () => {
    let s = recordSet(makeSession(), c(0, 0, 0), { reps: 9, feeling: 'easy' })
    s = recordSet(s, c(0, 1, 0), ok)
    s = undoSet(s, c(0, 0, 0))
    expect(setAt(s, c(0, 0, 0))).toEqual({ targetReps: [8, 12], loadKg: 12 })
    expect(s.cursor).toEqual(c(0, 0, 0))
    expect(currentStep(s)).toEqual({ kind: 'set', cursor: c(0, 0, 0) })
  })
})

describe('replaceExercise', () => {
  const ctx = { state: undefined, equipment: eq, deload: false }

  it('avant la première série : sur place, cibles et charge du remplaçant, même nombre de séries', () => {
    const s = makeSession()
    const dl = byId(lib, 'kb-deadlift')
    const r = replaceExercise(s.blocks, 0, 0, dl, { ...ctx, state: makeState(dl.id, { loadKg: 17.5 }) })
    const se = exAt(r, 0, 0)
    expect(se.exerciseId).toBe('kb-deadlift')
    expect(se.replacedFrom).toBe('box-goblet-squat')
    expect(se.restSec).toBe(dl.restSec)
    expect(se.sets).toEqual(Array.from({ length: 3 }, () => ({ targetReps: dl.repRange, loadKg: 17 })))
    expect(must(r[0]).exercises).toHaveLength(2)
  })

  it('remplacements successifs avant départ : replacedFrom garde l’exercice proposé à l’origine', () => {
    const s = makeSession()
    const r1 = replaceExercise(s.blocks, 0, 0, byId(lib, 'kb-deadlift'), ctx)
    const r2 = replaceExercise(r1, 0, 0, byId(lib, 'bodyweight-squat'), ctx)
    expect(must(r2[0]).exercises[0]).toMatchObject({
      exerciseId: 'bodyweight-squat',
      replacedFrom: 'box-goblet-squat',
    })
    expect(exAt(r2, 0, 0).sets[0]?.loadKg).toBeUndefined()
  })

  it('à mi-exercice (bloc simple) : restantes passées, remplaçant inséré juste après avec ces séries', () => {
    let s = makeSession({ cursor: c(1, 0, 0) })
    s = recordSet(s, c(1, 0, 0), ok)
    const r = replaceExercise(s, 1, 0, byId(lib, 'dead-bug'), ctx)
    const [old, neu] = must(r.blocks[1]).exercises
    expect(must(old).sets.map((x) => x.status)).toEqual(['done', 'skipped'])
    expect(neu).toMatchObject({ exerciseId: 'dead-bug', replacedFrom: 'incline-push-up' })
    expect(must(neu).sets).toHaveLength(1)
    expect(r.cursor).toEqual(c(1, 1, 0))
    expect(restAfter(r, c(1, 0, 0), lib).kind).toBe('set')
  })

  it('à mi-exercice dans un superset : le remplaçant reprend les tours restants', () => {
    let s = makeSession()
    s = recordSet(s, c(0, 0, 0), ok)
    s = recordSet(s, c(0, 1, 0), ok) // curseur → A2
    const r = replaceExercise(s, 0, 1, byId(lib, 'incline-push-up'), ctx)
    expect(must(r.blocks[0]).exercises.map((e) => e.exerciseId)).toEqual([
      'box-goblet-squat',
      'supported-one-arm-row',
      'incline-push-up',
    ])
    const pending = sessionSteps(r).filter((cur) => setAt(r, cur)?.status === undefined)
    // A2, C1, A3, C2, puis le bloc 2.
    expect(pending.slice(0, 4)).toEqual([c(0, 0, 1), c(0, 2, 0), c(0, 0, 2), c(0, 2, 1)])
    expect(r.cursor).toEqual(c(0, 0, 1))
    expect(restAfter(r, c(0, 0, 1), lib).kind).toBe('transition')
    expect(restAfter(r, c(0, 2, 0), lib).kind).toBe('round')
  })

  it('exercice terminé ou remplaçant identique : inchangé', () => {
    let s = makeSession({ cursor: c(1, 0, 0) })
    s = recordSet(recordSet(s, c(1, 0, 0), ok), c(1, 0, 1), ok)
    expect(replaceExercise(s.blocks, 1, 0, byId(lib, 'dead-bug'), ctx)).toEqual(s.blocks)
    expect(replaceExercise(s.blocks, 0, 0, byId(lib, 'box-goblet-squat'), ctx)).toEqual(s.blocks)
  })

  it('séries passées sans série faite : sur place avec les séries restantes', () => {
    const s = skipSet(makeSession(), c(0, 0, 0))
    const r = replaceExercise(s, 0, 0, byId(lib, 'kb-deadlift'), ctx)
    expect(exAt(r, 0, 0).sets).toHaveLength(2)
    expect(exAt(r, 0, 0).sets.every((x) => x.status === undefined)).toBe(true)
  })
})

describe('édition avant départ', () => {
  const ctx = { state: undefined, equipment: eq, deload: false }
  const plan = generateSession(makeInput({ durationMin: 60 }))

  it('removeExercise : superset réduit → bloc simple, bloc vide supprimé ; durée recalculée plus courte', () => {
    const s = makeSession()
    const r = removeExercise(s.blocks, 0, 1)
    expect(r[0]).toMatchObject({ id: 'b1', kind: 'single' })
    expect(must(r[0]).exercises).toHaveLength(1)
    const r2 = removeExercise(r, 1, 0)
    expect(r2.map((b) => b.id)).toEqual(['b1'])
    expect(estimateMinutes(r2, lib, 3)).toBeLessThan(estimateMinutes(s.blocks, lib, 3))
  })

  it('addExercise : nouveau bloc simple avant le finisher, id unique, 3 séries (2 en deload)', () => {
    expect(plan.blocks.at(-1)?.kind).toBe('finisher')
    const r = addExercise(plan.blocks, byId(lib, 'calf-raise'), ctx)
    expect(r).toHaveLength(plan.blocks.length + 1)
    expect(r.at(-1)?.kind).toBe('finisher')
    const added = must(r.at(-2))
    expect(added.kind).toBe('single')
    expect(must(added.exercises[0]).sets).toHaveLength(3)
    expect(new Set(r.map((b) => b.id)).size).toBe(r.length)
    const d = addExercise(plan.blocks, byId(lib, 'calf-raise'), { ...ctx, deload: true })
    expect(must(must(d.at(-2)).exercises[0]).sets).toHaveLength(2)
    const n = addExercise(plan.blocks, byId(lib, 'calf-raise'), ctx, 4)
    expect(must(must(n.at(-2)).exercises[0]).sets).toHaveLength(4)
    expect(estimateMinutes(r, lib, plan.warmupMin)).toBeGreaterThan(
      estimateMinutes(plan.blocks, lib, plan.warmupMin),
    )
  })

  it('addExercise sans finisher : à la fin ; ids uniques même après retrait et ajout', () => {
    const s = makeSession()
    const removed = removeExercise(s.blocks, 0, 0) // b1 (single), b2
    const r = addExercise(addExercise(removed, byId(lib, 'plank'), ctx), byId(lib, 'calf-raise'), ctx)
    expect(r.map((b) => b.id)).toEqual(['b1', 'b2', 'b3', 'b4'])
    expect(newBlockId([{ id: 'b2', kind: 'single', exercises: [] }])).toBe('b3')
  })

  it('moveBlock : déplace, borne la destination, erreur si source invalide', () => {
    const blocks = plan.blocks
    const ids = blocks.map((b) => b.id)
    expect(moveBlock(blocks, 0, 2).map((b) => b.id)).toEqual([ids[1], ids[2], ids[0], ...ids.slice(3)])
    expect(moveBlock(blocks, 2, -5).map((b) => b.id)[0]).toBe(ids[2])
    expect(() => moveBlock(blocks, 99, 0)).toThrow(RangeError)
  })

  it('moveBlock : le finisher reste en dernier', () => {
    const blocks = plan.blocks
    const ids = blocks.map((b) => b.id)
    const last = blocks.length - 1
    expect(blocks[last]?.kind).toBe('finisher')
    // Un bloc visé après le finisher est placé juste avant lui.
    expect(moveBlock(blocks, 0, 99).map((b) => b.id)).toEqual([...ids.slice(1, last), ids[0], ids[last]])
    expect(
      moveBlock(blocks, 0, last)
        .map((b) => b.id)
        .at(-1),
    ).toBe(ids[last])
    // Le finisher ne quitte pas la dernière place.
    expect(() => moveBlock(blocks, last, 0)).toThrow(RangeError)
    expect(moveBlock(blocks, last, last).map((b) => b.id)).toEqual(ids)
    // Sans finisher : fin de liste autorisée.
    const s = makeSession()
    expect(moveBlock(s.blocks, 0, 99).map((b) => b.id)).toEqual(['b2', 'b1'])
  })
})
