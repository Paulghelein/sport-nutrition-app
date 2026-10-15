import { describe, expect, it } from 'vitest'
import type { ExerciseState, Feeling, SetEntry } from '../../types/training'
import {
  DURATION_STEP_SEC,
  applySessionResult,
  nextLevelVariant,
  unlockState,
  type SessionResultParams,
} from './progression'
import { byId, makeEquipment, makeState, seedLibrary } from './testkit'

const library = seedLibrary()
const equipment = makeEquipment()
const DATE = '2026-10-15'

interface SetSpec {
  reps?: number
  dur?: number
  feeling?: Feeling
  load?: number
  skipped?: boolean
}

/** Séries prévues [lo, hi] (ou durée visée), réalisées selon `specs`. */
function performed(
  target: { reps?: [number, number]; dur?: number; load?: number },
  specs: SetSpec[],
): { sets: SetEntry[] } {
  return {
    sets: specs.map((s) => ({
      ...(target.reps !== undefined ? { targetReps: target.reps } : {}),
      ...(target.dur !== undefined ? { targetDurationSec: target.dur } : {}),
      ...((s.load ?? target.load) !== undefined ? { loadKg: s.load ?? target.load } : {}),
      ...(s.reps !== undefined ? { actualReps: s.reps } : {}),
      ...(s.dur !== undefined ? { actualDurationSec: s.dur } : {}),
      feeling: s.feeling ?? 'ok',
      status: s.skipped === true ? ('skipped' as const) : ('done' as const),
    })),
  }
}

const top = (n: number, feeling: Feeling = 'ok', reps = 12): SetSpec[] =>
  Array.from({ length: n }, () => ({ reps, feeling }))

function run(
  id: string,
  state: ExerciseState | undefined,
  perf: { sets: SetEntry[] },
  eq = equipment,
  lib = library,
  extra: Partial<SessionResultParams> = {},
) {
  // Profil intermédiaire par défaut : les variantes de niveau 3 restent proposables (voir tests profil débutant).
  return applySessionResult({
    exercise: byId(lib, id),
    state,
    performed: perf,
    equipment: eq,
    library: lib,
    date: DATE,
    profileLevel: 2,
    ...extra,
  })
}

describe('ressenti de séance et historique', () => {
  it('hard si au moins la moitié des séries faites sont hard ; ajouté à recentFeelings', () => {
    const st = makeState('goblet-squat', { loadKg: 16, recentFeelings: ['ok'] })
    const r = run(
      'goblet-squat',
      st,
      performed({ reps: [8, 12], load: 16 }, [{ reps: 10, feeling: 'hard' }, { reps: 10 }]),
    )
    expect(r.state.recentFeelings).toEqual(['ok', 'hard'])
  })

  it('easy si majorité easy, sinon ok ; 10 ressentis au plus', () => {
    const st = makeState('goblet-squat', { loadKg: 16, recentFeelings: Array<Feeling>(10).fill('ok') })
    const r = run(
      'goblet-squat',
      st,
      performed({ reps: [8, 12], load: 16 }, [
        { reps: 9, feeling: 'easy' },
        { reps: 9, feeling: 'easy' },
        { reps: 9 },
      ]),
    )
    expect(r.state.recentFeelings).toHaveLength(10)
    expect(r.state.recentFeelings.at(-1)).toBe('easy')
  })

  it('lastPerformedOn = date ; updatedAt dérivé de la date ou fourni', () => {
    const r = run(
      'goblet-squat',
      makeState('goblet-squat', { loadKg: 16 }),
      performed({ reps: [8, 12], load: 16 }, [{ reps: 9 }]),
    )
    expect(r.state.lastPerformedOn).toBe(DATE)
    expect(r.state.updatedAt).toBe(`${DATE}T00:00:00.000Z`)
    const r2 = applySessionResult({
      exercise: byId(library, 'goblet-squat'),
      state: undefined,
      performed: performed({ reps: [8, 12], load: 12 }, [{ reps: 9 }]),
      equipment,
      library,
      date: DATE,
      profileLevel: 1,
      now: '2026-10-15T18:30:00.000Z',
    })
    expect(r2.state.updatedAt).toBe('2026-10-15T18:30:00.000Z')
  })

  it('aucune série faite → état inchangé, change none', () => {
    const st = makeState('goblet-squat', { loadKg: 16, topStreak: 1 })
    const r = run('goblet-squat', st, performed({ reps: [8, 12], load: 16 }, [{ skipped: true }]))
    expect(r).toEqual({ state: st, change: 'none' })
  })
})

describe('topStreak (haut de fourchette sur toutes les séries prévues)', () => {
  const st = makeState('goblet-squat', { loadKg: 24, topStreak: 1 })
  it('+1 quand toutes les séries atteignent le haut', () => {
    expect(run('goblet-squat', st, performed({ reps: [8, 12], load: 24 }, top(3))).state.topStreak).toBe(2)
  })
  it('remis à 0 si une série est sous le haut', () => {
    expect(
      run('goblet-squat', st, performed({ reps: [8, 12], load: 24 }, [...top(2), { reps: 11 }])).state
        .topStreak,
    ).toBe(0)
  })
  it('remis à 0 si une série prévue a été passée', () => {
    expect(
      run('goblet-squat', st, performed({ reps: [8, 12], load: 24 }, [...top(2), { skipped: true }])).state
        .topStreak,
    ).toBe(0)
  })
  it('une série faite plus légère que prévu ne compte pas', () => {
    const r = run(
      'goblet-squat',
      st,
      performed({ reps: [8, 12], load: 24 }, [...top(2), { reps: 12, load: 20 }]),
    )
    expect(r.state.topStreak).toBe(0)
  })
  it('reps réelles absentes → pas de haut (prudent)', () => {
    expect(run('goblet-squat', st, performed({ reps: [8, 12], load: 24 }, [{}, {}])).state.topStreak).toBe(0)
  })
})

describe('kettlebell en répétitions', () => {
  it('haut atteint → + palier (2 kg hinge/squat/lunge, 1 kg push/pull/arms)', () => {
    const r = run(
      'goblet-squat',
      makeState('goblet-squat', { loadKg: 16 }),
      performed({ reps: [8, 12], load: 16 }, top(3)),
    )
    expect(r.change).toBe('increase')
    expect(r.state.loadKg).toBe(18)
    expect(r.state.topStreak).toBe(0)
    const curl = run(
      'kettlebell-curl',
      makeState('kettlebell-curl', { loadKg: 12 }),
      performed({ reps: [10, 15], load: 12 }, top(3, 'ok', 15)),
    )
    expect(curl.state.loadKg).toBe(13)
  })

  it('arrondi à une charge réglable : au moins un pas, jamais plus d’un palier', () => {
    const kb2 = makeEquipment(['mat'], { minKg: 12, maxKg: 24, stepKg: 2 })
    const curl = run(
      'kettlebell-curl',
      makeState('kettlebell-curl', { loadKg: 12 }),
      performed({ reps: [10, 15], load: 12 }, top(3, 'ok', 15)),
      kb2,
    )
    expect(curl.state.loadKg).toBe(14)
    const kb3 = makeEquipment(['mat'], { minKg: 12, maxKg: 24, stepKg: 3 })
    const squat = run(
      'goblet-squat',
      makeState('goblet-squat', { loadKg: 15 }),
      performed({ reps: [8, 12], load: 15 }, top(3)),
      kb3,
    )
    expect(squat.state.loadKg).toBe(18)
  })

  it('plafonné au max', () => {
    const r = run(
      'goblet-squat',
      makeState('goblet-squat', { loadKg: 23 }),
      performed({ reps: [8, 12], load: 23 }, top(3)),
    )
    expect(r.state.loadKg).toBe(24)
    const atMax = run(
      'goblet-squat',
      makeState('goblet-squat', { loadKg: 24 }),
      performed({ reps: [8, 12], load: 24 }, top(3)),
    )
    expect(atMax.change).toBe('hold')
    expect(atMax.state.loadKg).toBe(24)
  })

  it('haut non atteint → charge inchangée', () => {
    const r = run(
      'goblet-squat',
      makeState('goblet-squat', { loadKg: 16 }),
      performed({ reps: [8, 12], load: 16 }, [{ reps: 10 }]),
    )
    expect(r.change).toBe('hold')
    expect(r.state.loadKg).toBe(16)
  })

  it('deux séances hard consécutives → charge inchangée même au haut', () => {
    const st = makeState('goblet-squat', { loadKg: 16, recentFeelings: ['ok', 'hard'] })
    const r = run('goblet-squat', st, performed({ reps: [8, 12], load: 16 }, top(3, 'hard')))
    expect(r.change).toBe('hold')
    expect(r.state.loadKg).toBe(16)
    expect(r.state.topStreak).toBe(1)
  })

  it('une seule séance hard au haut → hausse (règle SPEC : deux hard pour bloquer)', () => {
    const st = makeState('goblet-squat', { loadKg: 16, recentFeelings: ['ok'] })
    expect(run('goblet-squat', st, performed({ reps: [8, 12], load: 16 }, top(3, 'hard'))).change).toBe(
      'increase',
    )
  })

  it('trois séances hard consécutives → −1 palier, puis pas de nouvelle baisse avant 3 autres', () => {
    const st = makeState('goblet-squat', { loadKg: 16, recentFeelings: ['ok', 'hard', 'hard'] })
    const r1 = run('goblet-squat', st, performed({ reps: [8, 12], load: 16 }, [{ reps: 8, feeling: 'hard' }]))
    expect(r1.change).toBe('decrease')
    expect(r1.state.loadKg).toBe(14)
    const r2 = run(
      'goblet-squat',
      r1.state,
      performed({ reps: [8, 12], load: 14 }, [{ reps: 8, feeling: 'hard' }]),
    )
    expect(r2.change).toBe('hold')
    expect(r2.state.loadKg).toBe(14)
    const r3 = run(
      'goblet-squat',
      r2.state,
      performed({ reps: [8, 12], load: 14 }, [{ reps: 8, feeling: 'hard' }]),
    )
    const r4 = run(
      'goblet-squat',
      r3.state,
      performed({ reps: [8, 12], load: 14 }, [{ reps: 8, feeling: 'hard' }]),
    )
    expect(r3.change).toBe('hold')
    expect(r4.change).toBe('decrease')
    expect(r4.state.loadKg).toBe(12)
  })

  it('plancher au min', () => {
    const st = makeState('goblet-squat', { loadKg: 12, recentFeelings: ['hard', 'hard'] })
    const r = run('goblet-squat', st, performed({ reps: [8, 12], load: 12 }, [{ reps: 8, feeling: 'hard' }]))
    expect(r.change).toBe('hold')
    expect(r.state.loadKg).toBe(12)
  })

  it('état absent : départ à la plus petite charge réglable', () => {
    const r = run('goblet-squat', undefined, performed({ reps: [8, 12], load: 12 }, [{ reps: 9 }]))
    expect(r.state.loadKg).toBe(12)
    expect(r.state.exerciseId).toBe('goblet-squat')
  })
})

describe('durée : portés (double progression) et gainage', () => {
  it(`porté : + ${DURATION_STEP_SEC} s tant que la durée max n’est pas atteinte`, () => {
    const st = makeState('farmer-carry', { loadKg: 16, targetDurationSec: 30 })
    const r = run('farmer-carry', st, performed({ dur: 30, load: 16 }, [{ dur: 30 }, { dur: 31 }]))
    expect(r.change).toBe('increase')
    expect(r.state.targetDurationSec).toBe(35)
    expect(r.state.loadKg).toBe(16)
  })

  it('porté : à la durée max → + palier de charge et retour à la durée min', () => {
    const st = makeState('farmer-carry', { loadKg: 16, targetDurationSec: 60 })
    const r = run('farmer-carry', st, performed({ dur: 60, load: 16 }, [{ dur: 60 }, { dur: 60 }]))
    expect(r.state.loadKg).toBe(17)
    expect(r.state.targetDurationSec).toBe(30)
  })

  it('porté : durée non tenue → inchangé', () => {
    const st = makeState('farmer-carry', { loadKg: 16, targetDurationSec: 40 })
    const r = run('farmer-carry', st, performed({ dur: 40, load: 16 }, [{ dur: 40 }, { dur: 25 }]))
    expect(r.change).toBe('hold')
    expect(r.state.targetDurationSec).toBe(40)
  })

  it('gainage : durée seulement, plafonnée au max', () => {
    const r = run(
      'plank',
      makeState('plank', { targetDurationSec: 20 }),
      performed({ dur: 20 }, [{ dur: 20 }, { dur: 22 }]),
    )
    expect(r.state.targetDurationSec).toBe(25)
    expect(r.state.loadKg).toBeNull()
    const r2 = run(
      'plank',
      makeState('plank', { targetDurationSec: 45 }),
      performed({ dur: 45 }, [{ dur: 45 }]),
    )
    expect(r2.change).toBe('hold')
    expect(r2.state.targetDurationSec).toBe(45)
  })

  it('gainage : 3 séances hard → − un pas de durée', () => {
    const st = makeState('plank', { targetDurationSec: 30, recentFeelings: ['hard', 'hard'] })
    const r = run('plank', st, performed({ dur: 30 }, [{ dur: 30, feeling: 'hard' }]))
    expect(r.change).toBe('decrease')
    expect(r.state.targetDurationSec).toBe(25)
  })
})

describe('suggestions (jamais appliquées automatiquement)', () => {
  it('charge max + haut atteint 2 fois → level_up vers une variante niveau + 1', () => {
    const st = makeState('goblet-squat', { loadKg: 24, topStreak: 1 })
    const r = run('goblet-squat', st, performed({ reps: [8, 12], load: 24 }, top(3)))
    expect(r.suggestion?.kind).toBe('level_up')
    expect(['goblet-squat-tempo', 'front-squat-kb']).toContain(r.suggestion?.toExerciseId)
    expect(r.suggestion?.message).toMatch(/Goblet|goblet/)
    // Rien n'est appliqué : même exercice, même charge.
    expect(r.state.exerciseId).toBe('goblet-squat')
    expect(r.state.loadKg).toBe(24)
  })

  it('pas de suggestion avant 2 séances au max', () => {
    const st = makeState('goblet-squat', { loadKg: 24, topStreak: 0 })
    expect(run('goblet-squat', st, performed({ reps: [8, 12], load: 24 }, top(3))).suggestion).toBeUndefined()
  })

  it('préfère une variante liked ; ignore hidden et indisponibles', () => {
    const lib = seedLibrary({ 'front-squat-kb': 'liked' })
    expect(nextLevelVariant(byId(lib, 'goblet-squat'), lib, equipment, 2)?.id).toBe('front-squat-kb')
    const lib2 = seedLibrary({ 'front-squat-kb': 'hidden', 'goblet-squat-tempo': 'hidden' })
    expect(nextLevelVariant(byId(lib2, 'goblet-squat'), lib2, equipment, 2)).toBeUndefined()
  })

  it('sans variante disponible → tempo 3-1-1 ; déjà en tempo → rien', () => {
    // Fente arrière goblet → split squat bulgare (niveau 3) exige un banc.
    const st = makeState('reverse-lunge-goblet', { loadKg: 24, topStreak: 1 })
    const r = run('reverse-lunge-goblet', st, performed({ reps: [8, 12], load: 24 }, top(3)))
    expect(r.suggestion?.kind).toBe('tempo')
    expect(r.suggestion?.message).toContain('3-1-1')
    const withBench = run(
      'reverse-lunge-goblet',
      st,
      performed({ reps: [8, 12], load: 24 }, top(3)),
      makeEquipment(['mat', 'bench']),
    )
    expect(withBench.suggestion?.toExerciseId).toBe('bulgarian-split-squat')
    const tempo = run(
      'reverse-lunge-goblet',
      { ...st, tempo: true },
      performed({ reps: [8, 12], load: 24 }, top(3)),
    )
    expect(tempo.suggestion).toBeUndefined()
  })

  it('poids du corps : haut de fourchette 2 fois → level_up, aucun changement de charge', () => {
    const st = makeState('incline-push-up', { topStreak: 1 })
    const r = run('incline-push-up', st, performed({ reps: [8, 15] }, top(3, 'ok', 15)))
    expect(r.change).toBe('none')
    expect(r.state.loadKg).toBeNull()
    expect(r.suggestion?.kind).toBe('level_up')
    expect(['push-up', 'kb-floor-press']).toContain(r.suggestion?.toExerciseId)
  })

  it('gainage à la durée max 2 fois → level_up', () => {
    const st = makeState('plank', { targetDurationSec: 45, topStreak: 1 })
    const r = run('plank', st, performed({ dur: 45 }, [{ dur: 45 }, { dur: 45 }]))
    expect(r.suggestion?.kind).toBe('level_up')
    expect(['hollow-hold', 'side-plank']).toContain(r.suggestion?.toExerciseId)
  })

  it('pas de suggestion lors d’une baisse', () => {
    const st = makeState('goblet-squat', { loadKg: 24, topStreak: 3, recentFeelings: ['hard', 'hard'] })
    const r = run('goblet-squat', st, performed({ reps: [8, 12], load: 24 }, top(3, 'hard')))
    expect(r.change).toBe('decrease')
    expect(r.suggestion).toBeUndefined()
  })
})

describe('unlockState', () => {
  it('kettlebell : plus petite charge réglable ; durée visée au bas de la fourchette', () => {
    const s = unlockState(byId(library, 'farmer-carry'), equipment, DATE)
    expect(s).toMatchObject({
      exerciseId: 'farmer-carry',
      loadKg: 12,
      targetDurationSec: 30,
      recentFeelings: [],
      topStreak: 0,
    })
    expect(s.lastPerformedOn).toBeUndefined()
  })
  it('poids du corps : pas de charge', () => {
    expect(unlockState(byId(library, 'push-up'), equipment, DATE).loadKg).toBeNull()
    expect(unlockState(byId(library, 'push-up'), equipment, DATE).targetDurationSec).toBeUndefined()
  })
})

describe('corrections de revue', () => {
  it('profil débutant : hollow hold au max deux fois → jamais le Turkish get-up (niveau 3)', () => {
    const st = makeState('hollow-hold', { targetDurationSec: 40, topStreak: 1 })
    const r = run('hollow-hold', st, performed({ dur: 40 }, [{ dur: 40 }, { dur: 40 }]), equipment, library, {
      profileLevel: 1,
    })
    expect(r.suggestion?.toExerciseId).not.toBe('turkish-get-up')
    expect(r.suggestion).toBeUndefined() // pas de tempo pour une tenue
    expect(nextLevelVariant(byId(library, 'hollow-hold'), library, equipment, 1)).toBeUndefined()
  })

  it('profil débutant : goblet squat au max → tempo plutôt qu’une variante de niveau 3', () => {
    const st = makeState('goblet-squat', { loadKg: 24, topStreak: 1 })
    const r = run('goblet-squat', st, performed({ reps: [8, 12], load: 24 }, top(3)), equipment, library, {
      profileLevel: 1,
    })
    expect(r.suggestion?.kind).toBe('tempo')
    // Le niveau 2 reste accessible à un débutant.
    expect(nextLevelVariant(byId(library, 'plank'), library, equipment, 1)?.level).toBe(2)
  })

  it('Turkish get-up proposé à un profil intermédiaire : « apprends-le d’abord sans charge »', () => {
    const lib = seedLibrary({ 'turkish-get-up': 'liked' })
    const st = makeState('hollow-hold', { targetDurationSec: 40, topStreak: 1 })
    const r = run('hollow-hold', st, performed({ dur: 40 }, [{ dur: 40 }]), equipment, lib, {
      profileLevel: 2,
    })
    expect(r.suggestion?.toExerciseId).toBe('turkish-get-up')
    expect(r.suggestion?.message).toContain('sans charge')
  })

  it('deload : charge et durée inchangées, topStreak conservé, ressenti enregistré, pas de suggestion', () => {
    const st = makeState('goblet-squat', { loadKg: 16, topStreak: 1, recentFeelings: ['ok'] })
    const r = run(
      'goblet-squat',
      st,
      performed({ reps: [8, 12], load: 16 }, top(2, 'easy')),
      equipment,
      library,
      {
        deload: true,
      },
    )
    expect(r.change).toBe('hold')
    expect(r.state.loadKg).toBe(16)
    expect(r.state.topStreak).toBe(1)
    expect(r.state.recentFeelings).toEqual(['ok', 'easy'])
    const atMax = run(
      'goblet-squat',
      makeState('goblet-squat', { loadKg: 24, topStreak: 5 }),
      performed({ reps: [8, 12], load: 24 }, top(2)),
      equipment,
      library,
      { deload: true },
    )
    expect(atMax.suggestion).toBeUndefined()
    const hard = run(
      'goblet-squat',
      makeState('goblet-squat', { loadKg: 16, recentFeelings: ['hard', 'hard'] }),
      performed({ reps: [8, 12], load: 16 }, [{ reps: 8, feeling: 'hard' }]),
      equipment,
      library,
      { deload: true },
    )
    expect(hard.state.loadKg).toBe(16)
    const plank = run(
      'plank',
      makeState('plank', { targetDurationSec: 30 }),
      performed({ dur: 30 }, [{ dur: 30 }]),
      equipment,
      library,
      {
        deload: true,
      },
    )
    expect(plank.state.targetDurationSec).toBe(30)
  })

  it('pas de suggestion si les deux dernières séances sont hard', () => {
    const st = makeState('goblet-squat', { loadKg: 24, topStreak: 1, recentFeelings: ['hard'] })
    const r = run('goblet-squat', st, performed({ reps: [8, 12], load: 24 }, top(3, 'hard')))
    expect(r.state.topStreak).toBe(2)
    expect(r.suggestion).toBeUndefined()
  })

  it('porté déjà au minimum de la kettlebell après 3 hard → durée réduite', () => {
    const st = makeState('farmer-carry', {
      loadKg: 12,
      targetDurationSec: 45,
      recentFeelings: ['hard', 'hard'],
    })
    const r = run('farmer-carry', st, performed({ dur: 45, load: 12 }, [{ dur: 30, feeling: 'hard' }]))
    expect(r.change).toBe('decrease')
    expect(r.state.loadKg).toBe(12)
    expect(r.state.targetDurationSec).toBe(40)
  })
})
