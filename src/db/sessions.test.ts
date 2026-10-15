/* eslint-disable @typescript-eslint/no-non-null-assertion -- indices de fixtures de test connus */
import { beforeEach, describe, expect, it } from 'vitest'
import type { ExerciseState, Session, SessionCompletion, SessionSuggestion } from '../types'
import { db } from './database'
import { ValidationError } from './repositories'
import {
  abandonSession,
  completeSession,
  createTemplate,
  deleteSession,
  deleteTemplate,
  getActiveSession,
  getSession,
  listTemplates,
  resolveSuggestion,
  saveSessionProgress,
  startSession,
  updateDoneSession,
  updateTemplate,
} from './sessions'
import { checkSessionRow, checkTemplate } from './validation'

const T0 = '2026-03-01T08:00:00.000Z'
const T1 = '2026-03-01T08:10:00.000Z'
const T2 = '2026-03-01T08:50:00.000Z'

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's-new',
    date: '2026-03-01',
    durationMin: 30,
    status: 'planned',
    warmup: [],
    blocks: [
      {
        id: 'b1',
        kind: 'single',
        exercises: [
          {
            exerciseId: 'goblet-squat',
            restSec: 90,
            sets: [
              { targetReps: [8, 12], loadKg: 16 },
              { targetReps: [8, 12], loadKg: 16 },
            ],
          },
        ],
      },
    ],
    deload: false,
    estimatedMin: 30,
    updatedAt: T0,
    ...overrides,
  }
}

function makeState(exerciseId: string, loadKg: number | null = 18): ExerciseState {
  return { exerciseId, loadKg, recentFeelings: ['ok'], updatedAt: T2 }
}

function completion(
  session: Session,
  states: ExerciseState[] = [makeState('goblet-squat')],
): SessionCompletion {
  return { session, outcomes: [], states, suggestions: [] }
}

const rejects = (p: Promise<unknown>, re?: RegExp) =>
  re ? expect(p).rejects.toThrow(re) : expect(p).rejects.toBeInstanceOf(ValidationError)

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('startSession / getActiveSession', () => {
  it('écrit la séance en cours avec startedAt', async () => {
    const row = await startSession(makeSession(), T0)
    expect(row.status).toBe('in_progress')
    expect(row.startedAt).toBe(T0)
    expect(await getSession('s-new')).toEqual(row)
    expect(await getActiveSession()).toEqual(row)
    expect(await getSession('absent')).toBeUndefined()
  })

  it('refuse si une séance est déjà en cours, sans rien écrire', async () => {
    await startSession(makeSession(), T0)
    await rejects(startSession(makeSession({ id: 's-2' }), T1), /déjà en cours/)
    expect(await db.sessions.count()).toBe(1)
  })

  it('autorise une nouvelle séance après abandon', async () => {
    await startSession(makeSession(), T0)
    await abandonSession('s-new', T1)
    await startSession(makeSession({ id: 's-2' }), T2)
    expect((await getActiveSession())?.id).toBe('s-2')
  })

  it('refuse une séance invalide et un id déjà utilisé', async () => {
    await rejects(startSession(makeSession({ estimatedMin: -1 }), T0))
    await rejects(startSession({ ...makeSession(), durationMin: 33 as never }, T0))
    await db.sessions.put(makeSession({ status: 'done' }))
    await rejects(startSession(makeSession(), T0), /existe déjà/)
  })

  it('getActiveSession renvoie la plus récente', async () => {
    await db.sessions.bulkPut([
      makeSession({ id: 'a', status: 'in_progress', startedAt: T0 }),
      makeSession({ id: 'b', status: 'in_progress', startedAt: T1 }),
      makeSession({ id: 'c', status: 'done', startedAt: T2 }),
    ])
    expect((await getActiveSession())?.id).toBe('b')
  })
})

describe('saveSessionProgress', () => {
  it('enregistre l’avancement et met à jour updatedAt', async () => {
    const started = await startSession(makeSession(), T0)
    const progressed: Session = {
      ...started,
      cursor: { block: 0, exercise: 0, set: 1 },
      restEndsAt: T2,
      blocks: [
        {
          id: 'b1',
          kind: 'single',
          exercises: [
            {
              exerciseId: 'goblet-squat',
              restSec: 90,
              sets: [{ loadKg: 16, actualReps: 10, feeling: 'ok', status: 'done' }, { loadKg: 16 }],
            },
          ],
        },
      ],
    }
    const saved = await saveSessionProgress(progressed, T1)
    expect(saved.updatedAt).toBe(T1)
    expect(saved.startedAt).toBe(T0)
    expect(await getSession('s-new')).toEqual(saved)
    expect(saved.restEndsAt).toBe(T2)
  })

  it('refuse si la séance n’est plus en cours ou n’existe pas', async () => {
    await rejects(saveSessionProgress(makeSession(), T1), /plus en cours/)
    await db.sessions.put(makeSession({ status: 'done' }))
    await rejects(saveSessionProgress(makeSession(), T1), /plus en cours/)
    expect((await getSession('s-new'))?.status).toBe('done')
  })
})

describe('abandonSession', () => {
  it('passe en abandoned, pose endedAt, retire restEndsAt', async () => {
    const s = await startSession(makeSession(), T0)
    await saveSessionProgress({ ...s, restEndsAt: T2 }, T1)
    const done = await abandonSession('s-new', T2)
    expect(done.status).toBe('abandoned')
    expect(done.endedAt).toBe(T2)
    expect(done.restEndsAt).toBeUndefined()
    expect(await getActiveSession()).toBeUndefined()
  })

  it('refuse si la séance n’est pas en cours', async () => {
    await rejects(abandonSession('absent', T1))
    await db.sessions.put(makeSession({ status: 'done' }))
    await rejects(abandonSession('s-new', T1))
  })
})

describe('completeSession (garde-fou de progression)', () => {
  it('écrit séance done + états en une transaction', async () => {
    const s = await startSession(makeSession(), T0)
    const suggestions: SessionSuggestion[] = [
      { kind: 'tempo', exerciseId: 'goblet-squat', message: 'Tempo', status: 'pending' },
    ]
    const done = await completeSession(
      { session: { ...s, restEndsAt: T1 }, outcomes: [], states: [makeState('goblet-squat')], suggestions },
      T2,
    )
    expect(done.status).toBe('done')
    expect(done.endedAt).toBe(T2)
    expect(done.progressionAppliedAt).toBe(T2)
    expect(done.suggestions).toEqual(suggestions)
    expect(done.restEndsAt).toBeUndefined()
    expect(await getSession('s-new')).toEqual(done)
    expect((await db.exerciseState.get('goblet-squat'))?.loadKg).toBe(18)
  })

  it('refuse le 2e appel sans rien écrire', async () => {
    const s = await startSession(makeSession(), T0)
    await completeSession(completion(s), T1)
    const after = await getSession('s-new')
    await rejects(
      completeSession(completion(s, [makeState('goblet-squat', 20), makeState('other')]), T2),
      /déjà terminée/,
    )
    expect(await getSession('s-new')).toEqual(after)
    expect((await db.exerciseState.get('goblet-squat'))?.loadKg).toBe(18)
    expect(await db.exerciseState.get('other')).toBeUndefined()
  })

  it('refuse si la séance n’est pas en cours (abandonnée, absente) ou a progressionAppliedAt', async () => {
    await rejects(completeSession(completion(makeSession()), T1), /déjà terminée/)
    await db.sessions.put(makeSession({ status: 'in_progress', progressionAppliedAt: T0 }))
    await rejects(completeSession(completion(makeSession()), T1), /déjà terminée/)
    expect(await db.exerciseState.count()).toBe(0)
  })

  it('refuse un état invalide sans rien écrire', async () => {
    const s = await startSession(makeSession(), T0)
    await rejects(
      completeSession(completion(s, [{ ...makeState('x'), recentFeelings: ['bof' as never] }]), T1),
    )
    expect((await getSession('s-new'))?.status).toBe('in_progress')
  })
})

describe('updateDoneSession', () => {
  async function doneSession() {
    const s = await startSession(makeSession(), T0)
    return completeSession(completion(s, []), T1)
  }

  it('corrige séries et notes sans toucher exerciseState', async () => {
    const done = await doneSession()
    await db.exerciseState.put(makeState('goblet-squat', 20))
    const blocks = structuredClone(done.blocks)
    blocks[0]!.exercises[0]!.sets[0] = { loadKg: 16, actualReps: 9, status: 'done' }
    const next = await updateDoneSession({ ...done, blocks, notes: 'corrigé' }, T2)
    expect(next.notes).toBe('corrigé')
    expect(next.updatedAt).toBe(T2)
    expect((await getSession('s-new'))?.blocks[0]?.exercises[0]?.sets[0]?.actualReps).toBe(9)
    expect((await db.exerciseState.get('goblet-squat'))?.loadKg).toBe(20)
  })

  it('reprend status, progressionAppliedAt et suggestions depuis la base', async () => {
    const done = await doneSession()
    const next = await updateDoneSession(
      {
        ...done,
        status: 'in_progress',
        progressionAppliedAt: T2,
        suggestions: [{ kind: 'tempo', exerciseId: 'x', message: 'm', status: 'pending' }],
        notes: 'n',
      },
      T2,
    )
    expect(next.status).toBe('done')
    expect(next.progressionAppliedAt).toBe(done.progressionAppliedAt)
    expect(next.suggestions).toEqual(done.suggestions)
    expect((await getSession('s-new'))?.notes).toBe('n')
  })

  it('refuse une séance non terminée ou absente', async () => {
    await rejects(updateDoneSession(makeSession(), T2), /terminée/)
    await db.sessions.put(makeSession({ status: 'in_progress' }))
    await rejects(updateDoneSession(makeSession({ status: 'in_progress' }), T2), /terminée/)
  })
})

describe('deleteSession', () => {
  it('supprime la séance (sans toucher les états)', async () => {
    await db.sessions.put(makeSession({ status: 'done' }))
    await db.exerciseState.put(makeState('goblet-squat'))
    await deleteSession('s-new')
    expect(await getSession('s-new')).toBeUndefined()
    expect(await db.exerciseState.count()).toBe(1)
    await deleteSession('s-new')
  })
})

describe('resolveSuggestion', () => {
  const suggestions: SessionSuggestion[] = [
    {
      kind: 'level_up',
      exerciseId: 'goblet-squat',
      toExerciseId: 'front-squat',
      message: 'Monter',
      status: 'pending',
    },
    { kind: 'tempo', exerciseId: 'goblet-squat', message: 'Tempo', status: 'pending' },
  ]
  beforeEach(async () => {
    await db.sessions.put(makeSession({ status: 'done', suggestions }))
  })

  it('refuse et laisse l’état tel quel', async () => {
    const s = await resolveSuggestion('s-new', 0, 'dismissed', undefined, T1)
    expect(s.suggestions?.[0]?.status).toBe('dismissed')
    expect(s.suggestions?.[1]?.status).toBe('pending')
    expect(s.updatedAt).toBe(T1)
    expect(await db.exerciseState.count()).toBe(0)
  })

  it('accepte un level_up : crée l’état cible', async () => {
    await resolveSuggestion('s-new', 0, 'accepted', () => makeState('front-squat', null), T1)
    expect((await db.exerciseState.get('front-squat'))?.loadKg).toBeNull()
    expect((await getSession('s-new'))?.suggestions?.[0]?.status).toBe('accepted')
  })

  it('level_up : garde l’état existant de l’exercice cible', async () => {
    await db.exerciseState.put(makeState('front-squat', 24))
    await resolveSuggestion('s-new', 0, 'accepted', () => makeState('front-squat', 12), T1)
    expect((await db.exerciseState.get('front-squat'))?.loadKg).toBe(24)
    expect((await getSession('s-new'))?.suggestions?.[0]?.status).toBe('accepted')
  })

  it('tempo : écrit l’état fourni', async () => {
    await db.exerciseState.put(makeState('goblet-squat', 24))
    await resolveSuggestion(
      's-new',
      1,
      'accepted',
      (cur) => ({ ...(cur ?? makeState('goblet-squat', 24)), tempo: true }),
      T1,
    )
    const st = await db.exerciseState.get('goblet-squat')
    expect(st?.loadKg).toBe(24)
    expect(st?.tempo).toBe(true)
    expect(st?.updatedAt).toBe(T1)
  })

  it('level_up : makeState n’est pas appelée si la cible a un état', async () => {
    await db.exerciseState.put(makeState('front-squat', 24))
    let called = false
    await resolveSuggestion(
      's-new',
      0,
      'accepted',
      () => {
        called = true
        return makeState('front-squat', 1)
      },
      T1,
    )
    expect(called).toBe(false)
  })

  it('makeState reçoit l’état courant de la base (tempo)', async () => {
    await db.exerciseState.put(makeState('goblet-squat', 30))
    let seen: number | null | undefined
    await resolveSuggestion(
      's-new',
      1,
      'accepted',
      (cur) => {
        seen = cur?.loadKg
        return undefined
      },
      T1,
    )
    expect(seen).toBe(30)
    expect((await db.exerciseState.get('goblet-squat'))?.tempo).toBeUndefined()
  })

  it('refuse une séance non terminée', async () => {
    await db.sessions.put(makeSession({ status: 'in_progress', suggestions }))
    await rejects(resolveSuggestion('s-new', 0, 'dismissed', undefined, T1), /terminée/)
  })

  it('refuse : suggestion déjà traitée, index inconnu, séance absente, état avec refus', async () => {
    await resolveSuggestion('s-new', 0, 'dismissed', undefined, T1)
    await rejects(
      resolveSuggestion('s-new', 0, 'accepted', () => makeState('front-squat'), T2),
      /déjà traitée/,
    )
    await rejects(resolveSuggestion('s-new', 5, 'dismissed', undefined, T2), /introuvable/)
    await rejects(resolveSuggestion('absent', 0, 'dismissed', undefined, T2), /introuvable/)
    await rejects(resolveSuggestion('s-new', 1, 'dismissed', () => makeState('x'), T2))
    expect(await db.exerciseState.count()).toBe(0)
  })
})

describe('modèles de séance', () => {
  const input = {
    name: ' Jambes ',
    durationMin: 30 as const,
    blocks: [
      { exerciseId: 'goblet-squat', sets: 3, reps: [8, 12] as [number, number], loadKg: 16, restSec: 90 },
    ],
  }

  it('crée, liste (triée par nom), met à jour et supprime', async () => {
    const a = await createTemplate(input, T0)
    expect(a.name).toBe('Jambes')
    expect(a.createdAt).toBe(T0)
    const b = await createTemplate({ ...input, name: 'Abdos' }, T0)
    expect((await listTemplates()).map((t) => t.name)).toEqual(['Abdos', 'Jambes'])
    const up = await updateTemplate(a.id, { ...input, name: 'Bas du corps' }, T1)
    expect(up.createdAt).toBe(T0)
    expect(up.updatedAt).toBe(T1)
    expect((await listTemplates()).map((t) => t.name)).toEqual(['Abdos', 'Bas du corps'])
    await deleteTemplate(b.id)
    expect(await listTemplates()).toHaveLength(1)
  })

  it('valide nom, blocs, séries', async () => {
    await rejects(createTemplate({ ...input, name: '  ' }, T0), /nom/)
    await rejects(createTemplate({ ...input, name: 'x'.repeat(61) }, T0), /60/)
    await rejects(createTemplate({ ...input, blocks: [] }, T0), /au moins/)
    await rejects(createTemplate({ ...input, blocks: [{ ...input.blocks[0]!, sets: 0 }] }, T0), /séries/)
    await rejects(createTemplate({ ...input, blocks: [{ ...input.blocks[0]!, sets: 11 }] }, T0), /séries/)
    await rejects(createTemplate({ ...input, blocks: [{ ...input.blocks[0]!, sets: 2.5 }] }, T0), /séries/)
    await rejects(updateTemplate('absent', input, T1), /introuvable/)
    expect(await db.sessionTemplates.count()).toBe(0)
  })

  it('checkTemplate : bornes de repos, répétitions, durée, charge', () => {
    const b = input.blocks[0]!
    expect(checkTemplate(input)).toBeNull()
    expect(checkTemplate({ ...input, blocks: [{ ...b, restSec: 700 }] })).toMatch(/repos/)
    expect(checkTemplate({ ...input, blocks: [{ ...b, reps: [12, 8] }] })).toMatch(/répétitions/)
    expect(checkTemplate({ ...input, blocks: [{ ...b, durationSec: 1 }] })).toMatch(/durée/)
    expect(checkTemplate({ ...input, blocks: [{ ...b, loadKg: -1 }] })).toMatch(/charge/)
  })
})

describe('checkSessionRow', () => {
  it('accepte une séance valide, refuse valeurs négatives et curseur invalide', () => {
    expect(checkSessionRow(makeSession())).toBeNull()
    expect(checkSessionRow(makeSession({ estimatedMin: -3 }))).toMatch(/estimée/)
    const bad = makeSession()
    bad.blocks[0]!.exercises[0]!.sets[0] = { actualReps: -1 }
    expect(checkSessionRow(bad)).toMatch(/série/)
    const rest = makeSession()
    rest.blocks[0]!.exercises[0]!.restSec = -5
    expect(checkSessionRow(rest)).toMatch(/repos/)
    expect(checkSessionRow(makeSession({ cursor: { block: 0, exercise: 0, set: -1 } }))).toMatch(/position/)
    expect(checkSessionRow(makeSession({ date: '2026-13-01' }))).toMatch(/Date/)
  })
})
