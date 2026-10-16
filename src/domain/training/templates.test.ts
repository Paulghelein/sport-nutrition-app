import { describe, expect, it } from 'vitest'
import type { SessionTemplate } from '../../types/training'
import { addDays } from '../shared/dates'
import { estimateMinutes } from './estimate'
import { generateSession } from './generate'
import { restAfter, sessionFromPlan, sessionSteps, skipExercise } from './guided'
import {
  planFromTemplate,
  setsBeforeDeload,
  templateFromSession,
  templateIssues,
  templateTargetNotes,
} from './templates'
import { T0, doneSession, exAt, makeEquipment, makeInput, makeState, must, seedLibrary } from './testkit'

const lib = seedLibrary()

function template(over: Partial<SessionTemplate> = {}): SessionTemplate {
  return {
    id: 't1',
    name: 'Haut du corps',
    durationMin: 30,
    blocks: [
      { exerciseId: 'box-goblet-squat', sets: 3, reps: [8, 12], loadKg: 12, restSec: 90 },
      { exerciseId: 'farmer-carry', sets: 2, durationSec: 30, loadKg: 12, restSec: 60 },
      { exerciseId: 'incline-push-up', sets: 4, reps: [8, 15], restSec: 60 },
    ],
    createdAt: T0,
    updatedAt: T0,
    ...over,
  }
}

describe('templateFromSession', () => {
  it('un bloc de modèle par exercice : séries, cibles, charge, repos ; nom nettoyé', () => {
    const plan = generateSession(makeInput({ durationMin: 30 }))
    const t = templateFromSession(plan.blocks, '  Ma séance ', 30)
    expect(t.name).toBe('Ma séance')
    expect(t.durationMin).toBe(30)
    const flat = plan.blocks.flatMap((b) => b.exercises)
    expect(t.blocks.map((b) => b.exerciseId)).toEqual(flat.map((e) => e.exerciseId))
    for (const [i, se] of flat.entries()) {
      const tb = must(t.blocks[i])
      expect(tb.sets).toBe(se.sets.length)
      expect(tb.restSec).toBe(se.restSec)
      expect(tb.reps).toEqual(se.sets[0]?.targetReps)
      expect(tb.durationSec).toEqual(se.sets[0]?.targetDurationSec)
      expect(tb.loadKg).toEqual(se.sets[0]?.loadKg)
    }
    const groups = plan.blocks.flatMap((b, i) => b.exercises.map(() => ({ group: i, kind: b.kind })))
    expect(t.blocks.map((b) => ({ group: b.group, kind: b.kind }))).toEqual(groups)
  })

  it('depuis une séance : séries passées omises, exercice entièrement passé retiré', () => {
    const plan = generateSession(makeInput({ durationMin: 30 }))
    const s = skipExercise(sessionFromPlan(plan, { id: 's', now: T0 }), 0, 0)
    const t = templateFromSession(s, 'x', 30)
    expect(t.blocks).toHaveLength(plan.blocks.flatMap((b) => b.exercises).length - 1)
  })

  it('remplacement en cours d’exercice : l’ancien est omis, le remplaçant reçoit le total prévu (en chaîne aussi)', () => {
    const blocks = [
      {
        id: 'b1',
        kind: 'single' as const,
        exercises: [
          {
            exerciseId: 'incline-push-up',
            restSec: 60,
            sets: [
              { targetReps: [8, 15] as [number, number], status: 'done' as const, actualReps: 10 },
              { targetReps: [8, 15] as [number, number], status: 'skipped' as const },
              { targetReps: [8, 15] as [number, number], status: 'skipped' as const },
              { targetReps: [8, 15] as [number, number], status: 'skipped' as const },
            ],
          },
          {
            exerciseId: 'dead-bug',
            restSec: 60,
            replacedFrom: 'incline-push-up',
            sets: [
              { targetReps: [8, 12] as [number, number], status: 'done' as const, actualReps: 8 },
              { targetReps: [8, 12] as [number, number], status: 'skipped' as const },
              { targetReps: [8, 12] as [number, number], status: 'skipped' as const },
            ],
          },
          {
            exerciseId: 'plank',
            restSec: 45,
            replacedFrom: 'dead-bug',
            sets: [{ targetDurationSec: 20 }, { targetDurationSec: 20 }],
          },
        ],
      },
      {
        id: 'b2',
        kind: 'single' as const,
        exercises: [
          { exerciseId: 'calf-raise', restSec: 60, sets: [{ targetReps: [12, 20] as [number, number] }] },
        ],
      },
    ]
    const t = templateFromSession(blocks, 'x', 30)
    expect(t.blocks.map((b) => [b.exerciseId, b.sets])).toEqual([
      ['plank', 4],
      ['calf-raise', 1],
    ])
    expect(t.blocks[0]).toMatchObject({ durationSec: 20, restSec: 45, group: 0 })
  })

  it('deload : nombre de séries d’avant le deload (2 → 3), finisher inchangé', () => {
    const start = '2026-10-12'
    const sessions = [0, 1, 2].map((d) => doneSession(addDays(start, d), [['incline-push-up', 3, 'hard']]))
    const input = makeInput({ date: addDays(start, 3), durationMin: 60, sessions })
    const plan = generateSession(input)
    expect(plan.deload).toBe(true)
    const s = sessionFromPlan(plan, { id: 's', now: T0 })
    const t = templateFromSession(s, 'x', 60)
    for (const tb of t.blocks) expect(tb.sets).toBe(tb.kind === 'finisher' ? 2 : 3)
    // Depuis des blocs : indicateur explicite.
    expect(templateFromSession(plan.blocks, 'x', 60, { deload: true }).blocks).toEqual(t.blocks)
    expect(templateFromSession(plan.blocks, 'x', 60).blocks.find((b) => b.kind !== 'finisher')?.sets).toBe(2)
    // Rejoué pendant le deload : de nouveau réduit.
    expect(
      planFromTemplate(t, input).blocks.every((b) => b.exercises.every((e) => e.sets.length === 2)),
    ).toBe(true)
  })

  it('setsBeforeDeload', () => {
    expect([1, 2, 3].map((n) => setsBeforeDeload(n, 'single'))).toEqual([1, 3, 5])
    expect(setsBeforeDeload(2, 'finisher')).toBe(2)
  })
})

describe('planFromTemplate', () => {
  it('cibles et charges depuis les états actuels, séries et repos du modèle', () => {
    const states = [
      makeState('box-goblet-squat', { loadKg: 18 }),
      makeState('farmer-carry', { loadKg: 16, targetDurationSec: 45 }),
    ]
    const plan = planFromTemplate(template(), makeInput({ states }))
    expect(plan.durationMin).toBe(30)
    expect(plan.blocks.map((b) => b.id)).toEqual(['b1', 'b2', 'b3'])
    const [squat, carry, push] = plan.blocks.map((b) => must(b.exercises[0]))
    expect(must(squat).sets).toHaveLength(3)
    expect(must(squat).sets[0]).toEqual({ targetReps: [8, 12], loadKg: 18 })
    expect(must(squat).restSec).toBe(90)
    expect(must(carry).sets[0]).toEqual({ targetDurationSec: 45, loadKg: 16 })
    expect(must(push).sets).toHaveLength(4)
    expect(must(push).sets[0]?.loadKg).toBeUndefined()
    expect(plan.warmup.length).toBeGreaterThan(0)
    expect(plan.estimatedMin).toBe(estimateMinutes(plan.blocks, lib, plan.warmupMin))
    expect(plan.deload).toBe(false)
  })

  it('exercices disparus, masqués, sans matériel ou au-dessus du niveau : ignorés et signalés', () => {
    const t = template({
      blocks: [
        { exerciseId: 'disparu', sets: 3, restSec: 60 },
        { exerciseId: 'negative-pull-up', sets: 3, restSec: 120 },
        { exerciseId: 'kb-deadlift', sets: 3, restSec: 90 },
        { exerciseId: 'goblet-squat', sets: 3, restSec: 90 },
        { exerciseId: 'incline-push-up', sets: 3, restSec: 60 },
      ],
    })
    const input = makeInput({ library: seedLibrary({ 'kb-deadlift': 'hidden' }) })
    expect(templateIssues(t, input)).toEqual([
      { exerciseId: 'disparu', reason: 'missing' },
      { exerciseId: 'negative-pull-up', reason: 'equipment' },
      { exerciseId: 'kb-deadlift', reason: 'hidden' },
      { exerciseId: 'goblet-squat', reason: 'level' },
    ])
    const plan = planFromTemplate(t, input)
    expect(plan.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId))).toEqual(['incline-push-up'])
    // Niveau débloqué par un état : retenu.
    const unlocked = makeInput({ states: [makeState('goblet-squat', { loadKg: 12 })] })
    expect(templateIssues(t, unlocked).map((i) => i.exerciseId)).not.toContain('goblet-squat')
  })

  it('deload appliqué comme pour une séance générée (séries réduites, charge inchangée)', () => {
    const start = '2026-10-12'
    const sessions = [0, 1, 2].map((d) => doneSession(addDays(start, d), [['incline-push-up', 3, 'hard']]))
    const input = makeInput({
      date: addDays(start, 3),
      sessions,
      states: [makeState('box-goblet-squat', { loadKg: 18 })],
    })
    const plan = planFromTemplate(template(), input)
    expect(plan.deload).toBe(true)
    expect(plan.deloadReason).toBe('fatigue')
    expect(plan.blocks.map((b) => must(b.exercises[0]).sets.length)).toEqual([2, 2, 2])
    expect(exAt(plan, 0, 0).sets[0]?.loadKg).toBe(18)
  })

  it('aller-retour 20 / 30 min en supersets et 60 min avec finisher : même structure, durée comparable', () => {
    for (const durationMin of [20, 30, 60] as const) {
      const input = makeInput({ durationMin })
      const plan = generateSession(input)
      const again = planFromTemplate(templateFromSession(plan.blocks, 'x', durationMin), input)
      expect(again.blocks).toEqual(plan.blocks)
      expect(Math.abs(again.estimatedMin - plan.estimatedMin)).toBeLessThanOrEqual(1)
      expect(again.estimatedMin).toBeGreaterThanOrEqual(durationMin * 0.9)
      expect(again.estimatedMin).toBeLessThanOrEqual(durationMin * 1.1)
    }
    expect(generateSession(makeInput({ durationMin: 20 })).blocks.some((b) => b.kind === 'superset')).toBe(
      true,
    )
  })

  it('groupes : superset privé d’un exercice écarté → bloc simple ; lignes sans group → blocs simples', () => {
    const input = makeInput()
    const plan = planFromTemplate(
      template({
        blocks: [
          { group: 0, kind: 'superset', exerciseId: 'box-goblet-squat', sets: 3, restSec: 60 },
          { group: 0, kind: 'superset', exerciseId: 'disparu', sets: 3, restSec: 60 },
          { group: 1, kind: 'superset', exerciseId: 'incline-push-up', sets: 3, restSec: 60 },
          { group: 1, kind: 'superset', exerciseId: 'supported-one-arm-row', sets: 3, restSec: 60 },
          { exerciseId: 'plank', sets: 2, restSec: 60 },
          { exerciseId: 'dead-bug', sets: 2, restSec: 60 },
          { group: 4, kind: 'finisher', exerciseId: 'farmer-carry', sets: 2, restSec: 60 },
        ],
      }),
      input,
    )
    expect(plan.blocks.map((b) => [b.kind, b.exercises.map((e) => e.exerciseId)])).toEqual([
      ['single', ['box-goblet-squat']],
      ['superset', ['incline-push-up', 'supported-one-arm-row']],
      ['single', ['plank']],
      ['single', ['dead-bug']],
      ['finisher', ['farmer-carry']],
    ])
    expect(plan.blocks.map((b) => b.id)).toEqual(['b1', 'b2', 'b3', 'b4', 'b5'])
  })

  it('aller-retour : séance → modèle → séance identique (mêmes états)', () => {
    const input = makeInput({ durationMin: 45 })
    const plan = generateSession(input)
    const t = templateFromSession(plan.blocks, 'x', 45)
    const again = planFromTemplate({ ...t }, input)
    expect(again.blocks.flatMap((b) => b.exercises)).toEqual(plan.blocks.flatMap((b) => b.exercises))
  })
})

describe('planFromTemplate avec useTemplateTargets (séance proposée par Claude)', () => {
  const states = [
    makeState('box-goblet-squat', { loadKg: 16 }),
    makeState('farmer-carry', { loadKg: 16, targetDurationSec: 45 }),
  ]
  const claude = (blocks: SessionTemplate['blocks']): SessionTemplate => template({ blocks })
  const opts = { useTemplateTargets: true }

  it('défaut (false) : comportement inchangé, cibles du modèle ignorées', () => {
    const t = claude([{ exerciseId: 'box-goblet-squat', sets: 3, reps: [5, 6], loadKg: 12, restSec: 90 }])
    const input = makeInput({ states })
    expect(planFromTemplate(t, input)).toEqual(planFromTemplate(t, input, {}))
    expect(planFromTemplate(t, input, { useTemplateTargets: false })).toEqual(planFromTemplate(t, input))
    expect(exAt(planFromTemplate(t, input), 0, 0).sets[0]).toEqual({ targetReps: [8, 12], loadKg: 16 })
  })

  it('reps et durée compatibles utilisés comme cibles, sur toutes les séries', () => {
    const t = claude([
      { exerciseId: 'box-goblet-squat', sets: 3, reps: [6, 8], restSec: 90 },
      { exerciseId: 'farmer-carry', sets: 2, durationSec: 30, restSec: 60 },
      { exerciseId: 'plank', sets: 2, durationSec: 25, restSec: 60 },
    ])
    const plan = planFromTemplate(t, makeInput({ states }), opts)
    expect(exAt(plan, 0, 0).sets).toEqual(
      Array.from({ length: 3 }, () => ({ targetReps: [6, 8], loadKg: 16 })),
    )
    expect(exAt(plan, 1, 0).sets).toEqual([
      { targetDurationSec: 30, loadKg: 16 },
      { targetDurationSec: 30, loadKg: 16 },
    ])
    expect(exAt(plan, 2, 0).sets[0]).toEqual({ targetDurationSec: 25 })
    expect(plan.estimatedMin).toBe(estimateMinutes(plan.blocks, lib, plan.warmupMin))
    expect(templateTargetNotes(t, makeInput({ states }))).toEqual([])
  })

  it('cibles incompatibles ou invalides : ignorées (cible du moteur) et signalées', () => {
    const t = claude([
      { exerciseId: 'plank', sets: 2, reps: [8, 12], restSec: 60 },
      { exerciseId: 'box-goblet-squat', sets: 3, durationSec: 40, restSec: 90 },
      { exerciseId: 'incline-push-up', sets: 3, reps: [12, 8], restSec: 60 },
      { exerciseId: 'farmer-carry', sets: 2, durationSec: 600, restSec: 60 },
    ])
    const input = makeInput({ states })
    const plan = planFromTemplate(t, input, opts)
    expect(exAt(plan, 0, 0).sets[0]).toEqual({ targetDurationSec: 20 })
    expect(exAt(plan, 1, 0).sets[0]).toEqual({ targetReps: [8, 12], loadKg: 16 })
    expect(exAt(plan, 2, 0).sets[0]).toEqual({ targetReps: [8, 15] })
    // Durée plafonnée au haut de la fourchette de l'exercice (faute de frappe).
    expect(exAt(plan, 3, 0).sets[0]).toEqual({ targetDurationSec: 60, loadKg: 16 })
    expect(templateTargetNotes(t, input)).toEqual([
      'Planche : répétitions demandées ignorées (exercice en durée)',
      'Goblet squat sur boîte : durée demandée ignorée (exercice en répétitions)',
      'Pompes inclinées : répétitions demandées invalides, fourchette habituelle retenue',
      'Farmer carry : 600 s demandées, 60 s retenues (maximum de l’exercice)',
    ])
  })

  it('reps : haut plafonné au haut de la fourchette de l’exercice, bas ramené dessous ; signalé', () => {
    const input = makeInput({ states })
    const t = claude([
      { exerciseId: 'box-goblet-squat', sets: 3, reps: [10, 20], restSec: 90 },
      { exerciseId: 'incline-push-up', sets: 3, reps: [20, 25], restSec: 60 },
    ])
    const plan = planFromTemplate(t, input, opts)
    expect(exAt(plan, 0, 0).sets[0]?.targetReps).toEqual([10, 12])
    expect(exAt(plan, 1, 0).sets[0]?.targetReps).toEqual([15, 15])
    expect(templateTargetNotes(t, input)).toEqual([
      'Goblet squat sur boîte : 10-20 répétitions demandées, 10-12 retenues (maximum de l’exercice)',
      'Pompes inclinées : 20-25 répétitions demandées, 15-15 retenues (maximum de l’exercice)',
    ])
  })

  it('charge : Claude peut baisser, jamais dépasser la progression', () => {
    const input = makeInput({ states })
    const lower = planFromTemplate(
      claude([{ exerciseId: 'box-goblet-squat', sets: 3, reps: [8, 12], loadKg: 12, restSec: 90 }]),
      input,
      opts,
    )
    expect(exAt(lower, 0, 0).sets.map((s) => s.loadKg)).toEqual([12, 12, 12])
    const higher = claude([
      { exerciseId: 'box-goblet-squat', sets: 3, reps: [8, 12], loadKg: 20, restSec: 90 },
    ])
    expect(exAt(planFromTemplate(higher, input, opts), 0, 0).sets[0]?.loadKg).toBe(16)
    expect(templateTargetNotes(higher, input)).toEqual([
      'Goblet squat sur boîte : 20 kg demandé, 16 kg retenu (ta progression)',
    ])
    // Sans état : plafond = plus petite charge réglable.
    const fresh = makeInput()
    expect(exAt(planFromTemplate(higher, fresh, opts), 0, 0).sets[0]?.loadKg).toBe(12)
  })

  it('charge arrondie vers le bas au pas réel et ramenée dans la plage de la kettlebell', () => {
    const equipment = makeEquipment(['mat'], { minKg: 12, maxKg: 24, stepKg: 2 })
    const input = makeInput({ states: [makeState('box-goblet-squat', { loadKg: 18 })], equipment })
    const odd = claude([{ exerciseId: 'box-goblet-squat', sets: 3, loadKg: 15, restSec: 90 }])
    expect(exAt(planFromTemplate(odd, input, opts), 0, 0).sets[0]?.loadKg).toBe(14)
    const tiny = claude([{ exerciseId: 'box-goblet-squat', sets: 3, loadKg: 8, restSec: 90 }])
    expect(exAt(planFromTemplate(tiny, input, opts), 0, 0).sets[0]?.loadKg).toBe(12)
    expect(templateTargetNotes(odd, input)).toEqual([
      'Goblet squat sur boîte : 15 kg demandé, 14 kg retenu (charge réglable)',
    ])
    expect(templateTargetNotes(tiny, input)).toEqual([
      'Goblet squat sur boîte : 8 kg demandé, 12 kg retenu (minimum de ta kettlebell)',
    ])
    // Pas décimal : 12,5 kg affiché à la française.
    const half = makeEquipment(['mat'], { minKg: 12, maxKg: 24, stepKg: 0.5 })
    const inHalf = makeInput({ states: [makeState('box-goblet-squat', { loadKg: 12.5 })], equipment: half })
    const t = claude([{ exerciseId: 'box-goblet-squat', sets: 3, loadKg: 14, restSec: 90 }])
    expect(templateTargetNotes(t, inHalf)).toEqual([
      'Goblet squat sur boîte : 14 kg demandé, 12,5 kg retenu (ta progression)',
    ])
  })

  it('charge invalide ou sur un exercice sans kettlebell : ignorée', () => {
    const input = makeInput({ states })
    const t = claude([
      { exerciseId: 'box-goblet-squat', sets: 3, loadKg: Number.NaN, restSec: 90 },
      { exerciseId: 'box-goblet-squat', sets: 3, loadKg: 0, restSec: 90 },
      { exerciseId: 'incline-push-up', sets: 3, loadKg: 10, restSec: 60 },
    ])
    const plan = planFromTemplate(t, input, opts)
    expect(exAt(plan, 0, 0).sets[0]?.loadKg).toBe(16)
    expect(exAt(plan, 1, 0).sets[0]?.loadKg).toBe(16)
    expect(exAt(plan, 2, 0).sets[0]?.loadKg).toBeUndefined()
    expect(templateTargetNotes(t, input)).toEqual([
      'Pompes inclinées : charge demandée ignorée (exercice sans kettlebell)',
    ])
  })

  it('exercice en apprentissage sans charge (TGU) : aucune charge', () => {
    const input = makeInput({ profileLevel: 3, states: [makeState('turkish-get-up', { loadKg: null })] })
    const t = claude([{ exerciseId: 'turkish-get-up', sets: 3, reps: [1, 2], loadKg: 8, restSec: 90 }])
    const plan = planFromTemplate(t, input, opts)
    expect(exAt(plan, 0, 0).sets[0]).toEqual({ targetReps: [1, 2] })
    expect(templateTargetNotes(t, input)).toEqual([
      'Turkish get-up : charge demandée ignorée (apprentissage sans charge)',
    ])
  })

  it('deload : séries réduites comme d’habitude, cibles et charge du modèle conservées', () => {
    const start = '2026-10-12'
    const sessions = [0, 1, 2].map((d) => doneSession(addDays(start, d), [['incline-push-up', 3, 'hard']]))
    const input = makeInput({ date: addDays(start, 3), sessions, states })
    const t = claude([{ exerciseId: 'box-goblet-squat', sets: 4, reps: [6, 8], loadKg: 14, restSec: 90 }])
    const plan = planFromTemplate(t, input, opts)
    expect(plan.deload).toBe(true)
    expect(exAt(plan, 0, 0).sets).toEqual([
      { targetReps: [6, 8], loadKg: 14 },
      { targetReps: [6, 8], loadKg: 14 },
    ])
  })

  it('séries, repos, tempo et exercices écartés : comme sans l’option', () => {
    const input = makeInput({ states: [...states, makeState('incline-push-up', { tempo: true })] })
    const t = claude([
      { exerciseId: 'disparu', sets: 3, reps: [5, 5], restSec: 60 },
      { exerciseId: 'incline-push-up', sets: 2, reps: [6, 10], restSec: 75 },
    ])
    const plan = planFromTemplate(t, input, opts)
    const push = exAt(plan, 0, 0)
    expect(push.sets).toHaveLength(2)
    expect(push.restSec).toBe(75)
    expect(push.tempo).toBe('3-1-1')
    expect(push.sets[0]).toEqual({ targetReps: [6, 10] })
    expect(templateTargetNotes(t, input)).toEqual([])
  })

  it('superset de 3 exercices (circuit) : conservé et parcouru tour par tour en mode guidé', () => {
    const t = claude([
      { group: 0, kind: 'superset', exerciseId: 'box-goblet-squat', sets: 2, reps: [8, 10], restSec: 90 },
      { group: 0, kind: 'superset', exerciseId: 'incline-push-up', sets: 2, reps: [8, 10], restSec: 60 },
      { group: 0, kind: 'superset', exerciseId: 'dead-bug', sets: 2, restSec: 60 },
    ])
    const plan = planFromTemplate(t, makeInput({ states }), opts)
    expect(plan.blocks).toHaveLength(1)
    expect(plan.blocks[0]?.kind).toBe('superset')
    expect(plan.blocks[0]?.exercises).toHaveLength(3)
    const session = sessionFromPlan(plan, { id: 's', now: T0 })
    expect(sessionSteps(session).map((c) => [c.exercise, c.set])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [2, 1],
    ])
    expect(restAfter(session, { block: 0, exercise: 1, set: 0 }, lib).kind).toBe('transition')
    expect(restAfter(session, { block: 0, exercise: 2, set: 0 }, lib)).toEqual({ kind: 'round', seconds: 90 })
  })
})
