import { describe, expect, it } from 'vitest'
import type { Session, SessionBlock, SetEntry } from '../../types/training'
import { summarizeSession } from '../training/summary'
import { T0, seedLibrary } from '../training/testkit'
import { recordsInRange, strengthByExercise, timedMaxHistory } from './strength'

const lib = seedLibrary()
const byId = new Map(lib.map((e) => [e.id, e]))

const reps = (actualReps: number, loadKg?: number): SetEntry => ({
  status: 'done',
  actualReps,
  feeling: 'ok',
  ...(loadKg !== undefined ? { loadKg } : {}),
})
const hold = (actualDurationSec: number, loadKg?: number): SetEntry => ({
  status: 'done',
  actualDurationSec,
  feeling: 'ok',
  ...(loadKg !== undefined ? { loadKg } : {}),
})
const skipped: SetEntry = { status: 'skipped', loadKg: 40 }

const block = (id: string, exerciseId: string, sets: SetEntry[]): SessionBlock => ({
  id,
  kind: 'single',
  exercises: [{ exerciseId, restSec: 60, sets }],
})

function session(id: string, date: string, blocks: SessionBlock[], over: Partial<Session> = {}): Session {
  return {
    id,
    date,
    durationMin: 30,
    status: 'done',
    warmup: [],
    blocks,
    deload: false,
    estimatedMin: 30,
    updatedAt: T0,
    ...over,
  }
}

const find = (list: ReturnType<typeof strengthByExercise>, id: string) => {
  const x = list.find((e) => e.exerciseId === id)
  if (x === undefined) throw new Error(`absent : ${id}`)
  return x
}

describe('strengthByExercise', () => {
  it('un point par séance done, séries fusionnées sur plusieurs blocs, séries passées ignorées', () => {
    const s1 = session('s1', '2026-10-01', [
      block('b1', 'box-goblet-squat', [reps(10, 12), reps(8, 14), skipped]),
      block('b2', 'box-goblet-squat', [reps(9, 14)]),
    ])
    const out = strengthByExercise([s1], byId)
    expect(out).toHaveLength(1)
    expect(out[0]?.points).toEqual([
      { date: '2026-10-01', sessionId: 's1', topLoadKg: 14, bestReps: 9, tonnageKg: 120 + 112 + 126 },
    ])
  })

  it('séances abandoned / in_progress ignorées ; exercice sans série faite absent', () => {
    const sessions = [
      session('a', '2026-10-01', [block('b1', 'box-goblet-squat', [reps(10, 12)])], { status: 'abandoned' }),
      session('p', '2026-10-02', [block('b1', 'box-goblet-squat', [reps(10, 12)])], {
        status: 'in_progress',
      }),
      session('d', '2026-10-03', [block('b1', 'incline-push-up', [{ status: 'skipped' }])]),
    ]
    expect(strengthByExercise(sessions, byId)).toEqual([])
  })

  it('tonnage unilatéral × 2, cohérent avec le récapitulatif', () => {
    const s = session('s1', '2026-10-01', [block('b1', 'one-arm-row', [reps(10, 12), reps(10, 12)])])
    const point = strengthByExercise([s], byId)[0]?.points[0]
    expect(point?.tonnageKg).toBe(480)
    expect(point?.tonnageKg).toBe(summarizeSession(s, lib, []).tonnageKg)
    // Exercice absent de l'index : bilatéral (même règle que le récapitulatif pour un exercice inconnu).
    expect(strengthByExercise([s], new Map())[0]?.points[0]?.tonnageKg).toBe(240)
  })

  it('exercices en durée : bestDurationSec, tonnage nul, records de durée (gainage et porté chargé)', () => {
    const sessions = [
      session('s1', '2026-10-01', [
        block('b1', 'plank', [hold(30), hold(35)]),
        block('b2', 'suitcase-carry', [hold(40, 12), hold(30, 12)]),
      ]),
      session('s2', '2026-10-03', [
        block('b1', 'plank', [hold(40), hold(40)]),
        block('b2', 'suitcase-carry', [hold(30, 16)]),
      ]),
    ]
    const out = strengthByExercise(sessions, byId)
    const plank = find(out, 'plank')
    expect(plank.points.map((p) => p.bestDurationSec)).toEqual([35, 40])
    expect(plank.points.every((p) => p.tonnageKg === 0 && p.topLoadKg === undefined)).toBe(true)
    expect(plank.records).toEqual({ duration: { value: 40, date: '2026-10-03' } })
    const carry = find(out, 'suitcase-carry')
    expect(carry.records).toEqual({
      load: { value: 16, date: '2026-10-03' },
      duration: { value: 40, date: '2026-10-01', loadKg: 12 },
    })
  })

  it('records : charge, reps à la charge la plus lourde, tonnage ; égalité = date la plus ancienne', () => {
    const sessions = [
      session('s3', '2026-10-05', [block('b1', 'box-goblet-squat', [reps(8, 16), reps(8, 16)])]),
      session('s1', '2026-10-01', [block('b1', 'box-goblet-squat', [reps(12, 12), reps(12, 12)])]),
      session('s2', '2026-10-03', [block('b1', 'box-goblet-squat', [reps(8, 16), reps(6, 14)])]),
      session('s4', '2026-10-07', [block('b1', 'box-goblet-squat', [reps(15, 12)])]),
    ]
    const ex = strengthByExercise(sessions, byId)[0]
    expect(ex?.points.map((p) => p.sessionId)).toEqual(['s1', 's2', 's3', 's4'])
    expect(ex?.lastPerformedOn).toBe('2026-10-07')
    expect(ex?.records).toEqual({
      load: { value: 16, date: '2026-10-03' },
      reps: { value: 8, date: '2026-10-03', loadKg: 16 }, // 15 reps à 12 kg ne comptent pas
      tonnage: { value: 288, date: '2026-10-01' }, // 288 égalé le 5 → reste le 1er
    })
  })

  it('poids du corps : reps max sans charge, pas de record de charge ni de tonnage', () => {
    const sessions = [
      session('s1', '2026-10-01', [block('b1', 'incline-push-up', [reps(10), reps(12)])]),
      session('s2', '2026-10-02', [block('b1', 'incline-push-up', [reps(12)])]),
    ]
    expect(strengthByExercise(sessions, byId)[0]?.records).toEqual({
      reps: { value: 12, date: '2026-10-01' },
    })
  })

  it('apprentissage sans charge puis charge : les reps sans charge sont écartées du record de reps', () => {
    const sessions = [
      session('s1', '2026-10-01', [block('b1', 'turkish-get-up', [reps(5), reps(5)])]),
      session('s2', '2026-10-03', [block('b1', 'turkish-get-up', [reps(2, 8)])]),
    ]
    const ex = strengthByExercise(sessions, byId)[0]
    expect(ex?.points.map((p) => [p.topLoadKg, p.bestReps])).toEqual([
      [undefined, 5],
      [8, 2],
    ])
    expect(ex?.records.reps).toEqual({ value: 2, date: '2026-10-03', loadKg: 8 })
  })

  it('même jour : ordre par startedAt ; tri par dernière date décroissante puis id', () => {
    const sessions = [
      session('late', '2026-10-01', [block('b1', 'plank', [hold(50)])], {
        startedAt: '2026-10-01T18:00:00Z',
      }),
      session('early', '2026-10-01', [block('b1', 'plank', [hold(50)])], {
        startedAt: '2026-10-01T07:00:00Z',
      }),
      session('x', '2026-10-02', [
        block('b1', 'incline-push-up', [reps(10)]),
        block('b2', 'dead-bug', [reps(8)]),
      ]),
    ]
    const out = strengthByExercise(sessions, byId)
    expect(out.map((e) => e.exerciseId)).toEqual(['dead-bug', 'incline-push-up', 'plank'])
    expect(find(out, 'plank').points.map((p) => p.sessionId)).toEqual(['early', 'late'])
  })
})

describe('recordsInRange', () => {
  const sq = 'box-goblet-squat'
  const history = [
    session('s1', '2026-09-28', [block('b1', sq, [reps(10, 12), reps(10, 12)])]),
    session('s2', '2026-10-05', [block('b1', sq, [reps(10, 14), reps(8, 14)])]), // lundi
    session('s3', '2026-10-08', [block('b1', sq, [reps(10, 16), reps(11, 14)])]),
    session('s4', '2026-10-13', [block('b1', sq, [reps(12, 16)])]),
    session('ab', '2026-10-09', [block('b1', sq, [reps(20, 24)])], { status: 'abandoned' }),
  ]

  it('records de la semaine comparés à tout ce qui précède, fusionnés par exercice / type / charge', () => {
    const r = recordsInRange(history, '2026-10-05', '2026-10-11', byId)
    expect(r).toEqual([
      { exerciseId: sq, kind: 'load', value: 16, previous: 12 },
      { exerciseId: sq, kind: 'tonnage', value: 314, previous: 240 },
      { exerciseId: sq, kind: 'reps', value: 11, previous: 10, loadKg: 14 },
    ])
  })

  it('identique au récapitulatif pour une période d’une séance', () => {
    const r = recordsInRange(history, '2026-10-13', '2026-10-13', byId)
    expect(r).toEqual(summarizeSession(history[3] as Session, lib, history).records)
    expect(r).toEqual([{ exerciseId: sq, kind: 'reps', value: 12, previous: 10, loadKg: 16 }])
  })

  it('premier passage : pas de record ; égaler n’est pas battre ; abandoned ignorée', () => {
    expect(recordsInRange(history, '2026-09-01', '2026-09-30', byId)).toEqual([])
    const tie = [...history, session('s5', '2026-10-15', [block('b1', sq, [reps(12, 16)])])]
    expect(recordsInRange(tie, '2026-10-15', '2026-10-15', byId)).toEqual([])
    expect(recordsInRange(history, '2026-10-09', '2026-10-09', byId)).toEqual([])
  })

  it('unilatéral : tonnage × 2 avec la bibliothèque', () => {
    const rows = [
      session('u1', '2026-10-01', [block('b1', 'one-arm-row', [reps(10, 12)])]),
      session('u2', '2026-10-02', [block('b1', 'one-arm-row', [reps(12, 12)])]),
    ]
    const r = recordsInRange(rows, '2026-10-02', '2026-10-02', byId)
    expect(r.find((x) => x.kind === 'tonnage')).toEqual({
      exerciseId: 'one-arm-row',
      kind: 'tonnage',
      value: 288,
      previous: 240,
    })
  })
})

describe('strengthByExercise : unilatéral et cas limites', () => {
  it('records de charge et de reps d’un exercice unilatéral ; tonnage × 2', () => {
    const rows = [
      session('u1', '2026-10-01', [block('b1', 'one-arm-row', [reps(10, 12), reps(8, 14)])]),
      session('u2', '2026-10-03', [block('b1', 'one-arm-row', [reps(9, 14)])]),
    ]
    const ex = strengthByExercise(rows, byId)[0]
    expect(ex?.records.load).toEqual({ value: 14, date: '2026-10-01' })
    expect(ex?.records.reps).toEqual({ value: 9, date: '2026-10-03', loadKg: 14 })
    expect(ex?.records.tonnage).toEqual({ value: 2 * (120 + 112), date: '2026-10-01' })
  })

  it('séries à 0 rep / 0 s : pas de record', () => {
    const ex = strengthByExercise(
      [
        session('z', '2026-10-01', [
          block('b1', 'incline-push-up', [reps(0)]),
          block('b2', 'plank', [hold(0)]),
        ]),
      ],
      byId,
    )
    expect(find(ex, 'incline-push-up').records).toEqual({})
    expect(find(ex, 'plank').records).toEqual({})
  })

  it('séances sans startedAt / endedAt : triées par date puis id', () => {
    const rows = [
      session('b', '2026-10-01', [block('b1', 'plank', [hold(30)])]),
      session('a', '2026-10-01', [block('b1', 'plank', [hold(30)])]),
    ]
    expect(find(strengthByExercise(rows, byId), 'plank').points.map((p) => p.sessionId)).toEqual(['a', 'b'])
  })

  it('recordsInRange : période vide ou inversée', () => {
    expect(recordsInRange([], '2026-10-01', '2026-10-07', byId)).toEqual([])
    const rows = [
      session('s1', '2026-10-01', [block('b1', 'box-goblet-squat', [reps(10, 12)])]),
      session('s2', '2026-10-05', [block('b1', 'box-goblet-squat', [reps(12, 16)])]),
    ]
    expect(recordsInRange(rows, '2026-10-07', '2026-10-01', byId)).toEqual([])
  })
})

describe('F3 : séries en temps fixe et AMRAP', () => {
  const sw = 'two-hand-swing'
  const timed = (actualReps: number, window = 45, loadKg = 16): SetEntry => ({
    setType: 'timedMax',
    targetDurationSec: window,
    status: 'done',
    actualReps,
    actualDurationSec: window,
    feeling: 'ok',
    loadKg,
  })

  it('strengthByExercise : reps et durée en temps fixe exclues ; charge et tonnage comptés', () => {
    const rows = [
      session('n1', '2026-10-01', [block('b1', sw, [reps(15, 16)])]),
      session('t1', '2026-10-03', [block('b1', sw, [timed(30)])]),
    ]
    const out = find(strengthByExercise(rows, byId), sw)
    expect(out.points[1]).toEqual({ date: '2026-10-03', sessionId: 't1', topLoadKg: 16, tonnageKg: 480 })
    expect(out.records.reps).toEqual({ value: 15, date: '2026-10-01', loadKg: 16 })
    expect(out.records.duration).toBeUndefined()
    expect(out.records.tonnage).toEqual({ value: 480, date: '2026-10-03' })
  })

  it('AMRAP : compte comme une série normale (reps max)', () => {
    const rows = [
      session('a1', '2026-10-01', [
        block('b1', 'incline-push-up', [reps(12), { ...reps(19), setType: 'amrap' }]),
      ]),
    ]
    expect(find(strengthByExercise(rows, byId), 'incline-push-up').records.reps).toEqual({
      value: 19,
      date: '2026-10-01',
    })
  })

  it('recordsInRange : record temps fixe avec windowSec, jamais fusionné avec le record de reps normal', () => {
    const rows = [
      session('n1', '2026-10-01', [block('b1', sw, [reps(15, 16)])]),
      session('t1', '2026-10-02', [block('b1', sw, [timed(22)])]),
      session('n2', '2026-10-06', [block('b1', sw, [reps(16, 16)])]),
      session('t2', '2026-10-07', [block('b1', sw, [timed(25)])]),
      session('t3', '2026-10-08', [block('b1', sw, [timed(27)])]),
    ]
    const r = recordsInRange(rows, '2026-10-05', '2026-10-11', byId).filter((x) => x.kind === 'reps')
    expect(r).toEqual([
      { exerciseId: sw, kind: 'reps', value: 16, previous: 15, loadKg: 16 },
      { exerciseId: sw, kind: 'reps', value: 27, previous: 22, loadKg: 16, windowSec: 45 },
    ])
  })
})

describe('timedMaxHistory (F3 : records en temps fixe de l’historique)', () => {
  const sw = 'two-hand-swing'
  const timed = (actualReps: number, window: number, over: Partial<SetEntry> = {}): SetEntry => ({
    setType: 'timedMax',
    targetDurationSec: window,
    status: 'done',
    actualReps,
    actualDurationSec: window,
    feeling: 'ok',
    ...over,
  })
  const one = (id: string, date: string, sets: SetEntry[], over: Partial<Session> = {}): Session =>
    session(id, date, [block('b1', sw, sets)], over)

  it('poids du corps : pas de loadKg dans le record', () => {
    const out = timedMaxHistory([one('s1', '2026-10-01', [timed(30, 45)])], sw)
    expect(out).toEqual([{ windowSec: 45, reps: 30, date: '2026-10-01' }])
    expect(out[0]).not.toHaveProperty('loadKg')
  })

  it('loadKg 0 distinct du poids du corps (même règle que le récapitulatif)', () => {
    const rows = [one('s1', '2026-10-01', [timed(30, 45), timed(25, 45, { loadKg: 0 })])]
    expect(timedMaxHistory(rows, sw)).toEqual([
      { windowSec: 45, reps: 30, date: '2026-10-01' },
      { windowSec: 45, loadKg: 0, reps: 25, date: '2026-10-01' },
    ])
  })

  it('deux fenêtres et deux charges séparées ; tri fenêtre puis charge', () => {
    const rows = [
      one('s2', '2026-10-03', [timed(40, 60, { loadKg: 16 }), timed(28, 45, { loadKg: 16 })]),
      one('s1', '2026-10-01', [timed(30, 45, { loadKg: 12 }), timed(20, 45, { loadKg: 16 })]),
    ]
    expect(timedMaxHistory(rows, sw)).toEqual([
      { windowSec: 45, loadKg: 12, reps: 30, date: '2026-10-01' },
      { windowSec: 45, loadKg: 16, reps: 28, date: '2026-10-03' },
      { windowSec: 60, loadKg: 16, reps: 40, date: '2026-10-03' },
    ])
  })

  it('égalité : la séance la plus ancienne reste, quel que soit l’ordre du tableau', () => {
    const rows = [
      one('late', '2026-10-05', [timed(30, 45, { loadKg: 16 })]),
      one('pm', '2026-10-02', [timed(30, 45, { loadKg: 16 })], { startedAt: '2026-10-02T18:00:00.000Z' }),
      one('am', '2026-10-02', [timed(30, 45, { loadKg: 16 })], { startedAt: '2026-10-02T08:00:00.000Z' }),
    ]
    expect(timedMaxHistory(rows, sw)).toEqual([{ windowSec: 45, loadKg: 16, reps: 30, date: '2026-10-02' }])
    // Battu strictement : la date suit.
    const beaten = [...rows, one('best', '2026-10-06', [timed(31, 45, { loadKg: 16 })])]
    expect(timedMaxHistory(beaten, sw)).toEqual([{ windowSec: 45, loadKg: 16, reps: 31, date: '2026-10-06' }])
  })

  it('séances non done ignorées', () => {
    const rows = [
      one('a', '2026-10-01', [timed(50, 45)], { status: 'abandoned' }),
      one('p', '2026-10-02', [timed(50, 45)], { status: 'in_progress' }),
      one('d', '2026-10-03', [timed(30, 45)]),
    ]
    expect(timedMaxHistory(rows, sw)).toEqual([{ windowSec: 45, reps: 30, date: '2026-10-03' }])
  })

  it('série skipped ignorée', () => {
    const rows = [one('s1', '2026-10-01', [timed(50, 45, { status: 'skipped' }), timed(30, 45)])]
    expect(timedMaxHistory(rows, sw)).toEqual([{ windowSec: 45, reps: 30, date: '2026-10-01' }])
  })

  it('timedMax sans fenêtre (ou fenêtre invalide) = série normale, ignorée ici ; séries normales ignorées', () => {
    const noWindow: SetEntry = { setType: 'timedMax', status: 'done', actualReps: 40, feeling: 'ok' }
    const rows = [
      one('s1', '2026-10-01', [noWindow, timed(40, 0), reps(50, 16), { ...reps(60), setType: 'amrap' }]),
    ]
    expect(timedMaxHistory(rows, sw)).toEqual([])
  })

  it('0 rep (ou reps absentes) : pas de record', () => {
    const rows = [one('s1', '2026-10-01', [timed(0, 45), timed(0, 60, { actualReps: undefined })])]
    expect(timedMaxHistory(rows, sw)).toEqual([])
  })

  it('autre exercice ignoré ; séries fusionnées sur plusieurs blocs', () => {
    const rows = [
      session('s1', '2026-10-01', [
        block('b1', sw, [timed(20, 45)]),
        block('b2', 'box-goblet-squat', [timed(99, 45)]),
        block('b3', sw, [timed(25, 45)]),
      ]),
    ]
    expect(timedMaxHistory(rows, sw)).toEqual([{ windowSec: 45, reps: 25, date: '2026-10-01' }])
    expect(timedMaxHistory([], sw)).toEqual([])
  })
})
