import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppDB, DB_SCHEMA_VERSION, db, openTestDb } from './database'
import { defaultEquipment, defaultNutritionParams, defaultSettings } from './defaults'
import {
  ValidationError,
  addMeasurement,
  completeOnboarding,
  deleteMeasurement,
  deleteWeighIn,
  getEquipment,
  getProfile,
  getSettings,
  listExerciseStates,
  listMeasurements,
  listSessions,
  listWeighIns,
  observe,
  requestPersistentStorage,
  saveEquipment,
  saveExerciseStates,
  saveProfile,
  updateMeasurement,
  updateSettings,
  updateEngineSettings,
  updateWeighIn,
  upsertWeighIn,
} from './repositories'
import {
  checkCoachUrl,
  checkEquipment,
  checkMeasurement,
  checkProfile,
  checkProfileIdentity,
  checkSettings,
  checkWeeklySessions,
  checkWeighIn,
} from './validation'
import { NOW, makeFullTables, makeProfile } from './testFixtures'

const EPOCH = '1970-01-01T00:00:00.000Z'
const LATER = '2026-03-02T09:00:00.000Z'

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('database / defaults', () => {
  it('déclare les 15 tables et la version 1', () => {
    expect(DB_SCHEMA_VERSION).toBe(1)
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      [
        'profile',
        'weighIns',
        'measurements',
        'equipment',
        'exercises',
        'exercisePrefs',
        'exerciseState',
        'sessions',
        'sessionTemplates',
        'foods',
        'recipes',
        'fridge',
        'foodLog',
        'shoppingLists',
        'settings',
      ].sort(),
    )
  })

  it('openTestDb crée une base isolée', async () => {
    const other: AppDB = openTestDb('forge-test-isolated')
    await other.settings.put(defaultSettings(NOW))
    expect(await db.settings.count()).toBe(0)
    other.close()
    await other.delete()
  })

  it('valeurs par défaut', () => {
    expect(defaultNutritionParams).toEqual({
      surplus: 0.12,
      proteinPerKg: 1.8,
      fatShare: 0.27,
      kcalAdjustment: 0,
    })
    expect(defaultEquipment(NOW)).toEqual({
      id: 'me',
      kettlebell: { minKg: 12, maxKg: 24, stepKg: 1 },
      owned: ['mat'],
      updatedAt: NOW,
    })
    expect(defaultSettings(NOW)).toEqual({
      id: 'me',
      onboardingCompleted: false,
      coachUrl: null,
      lastExportAt: null,
      engine: { volumeTargets: {}, deloadEveryWeeks: 6 },
      updatedAt: NOW,
    })
  })
})

describe('profil', () => {
  it('getProfile renvoie undefined puis le profil sauvegardé avec updatedAt mis à jour', async () => {
    expect(await getProfile()).toBeUndefined()
    await saveProfile(makeProfile(), LATER)
    expect(await getProfile()).toEqual(makeProfile({ updatedAt: LATER }))
  })

  it('refuse un profil incohérent', async () => {
    await expect(saveProfile(makeProfile({ weeklySessionsMin: 6 }), NOW)).rejects.toBeInstanceOf(
      ValidationError,
    )
    await expect(saveProfile(makeProfile({ heightCm: 20 }), NOW)).rejects.toThrow(/taille/)
    await expect(saveProfile(makeProfile({ birthDate: '2000-02-31' }), NOW)).rejects.toThrow()
    expect(await getProfile()).toBeUndefined()
  })
})

describe('matériel', () => {
  it('renvoie le défaut sans écrire', async () => {
    expect(await getEquipment()).toEqual(defaultEquipment(EPOCH))
    expect(await getEquipment()).toEqual(await getEquipment())
    expect(await db.equipment.count()).toBe(0)
  })

  it('sauvegarde, dédoublonne owned et retire kettlebell', async () => {
    const eq = { ...defaultEquipment(NOW), owned: ['mat', 'bands', 'mat', 'kettlebell'] as const }
    const saved = await saveEquipment({ ...eq, owned: [...eq.owned] }, LATER)
    expect(saved.owned).toEqual(['mat', 'bands'])
    expect(await getEquipment()).toEqual({ ...defaultEquipment(LATER), owned: ['mat', 'bands'] })
  })

  it('valide la kettlebell', async () => {
    const base = defaultEquipment(NOW)
    const bad = (kb: Partial<typeof base.kettlebell>) =>
      saveEquipment({ ...base, kettlebell: { ...base.kettlebell, ...kb } }, NOW)
    await expect(bad({ minKg: 25 })).rejects.toThrow(/minimum/)
    await expect(bad({ stepKg: 0 })).rejects.toThrow(/pas/)
    await expect(bad({ stepKg: -1 })).rejects.toThrow()
    await expect(bad({ stepKg: 5 })).rejects.toThrow(/multiple/)
    await expect(bad({ minKg: Number.NaN })).rejects.toThrow()
    await expect(bad({ stepKg: 0.5 })).resolves.toBeDefined()
    await expect(bad({ minKg: 10, maxKg: 10, stepKg: 2 })).resolves.toBeDefined()
    await expect(bad({ minKg: 8, maxKg: 24, stepKg: 4 })).resolves.toBeDefined()
    await expect(bad({ minKg: 8, maxKg: 24.4, stepKg: 0.4 })).resolves.toBeDefined()
  })
})

describe('réglages', () => {
  it('renvoie le défaut sans écrire, puis applique un patch', async () => {
    expect(await getSettings()).toEqual(defaultSettings(EPOCH))
    expect(await db.settings.count()).toBe(0)
    const next = await updateSettings({ coachUrl: 'https://x.test' }, LATER)
    expect(next).toEqual({ ...defaultSettings(LATER), coachUrl: 'https://x.test' })
    await updateSettings({ lastExportAt: LATER }, LATER)
    expect(await getSettings()).toMatchObject({ coachUrl: 'https://x.test', lastExportAt: LATER })
  })

  it('updateEngineSettings fusionne sur la valeur en base et valide', async () => {
    await updateSettings({ coachUrl: 'https://x.test' }, LATER)
    await Promise.all([
      updateEngineSettings((e) => ({ ...e, deloadEveryWeeks: 8 }), LATER),
      updateEngineSettings((e) => ({ ...e, volumeTargets: { ...e.volumeTargets, chest: [6, 10] } }), LATER),
    ])
    expect(await getSettings()).toMatchObject({
      coachUrl: 'https://x.test',
      engine: { deloadEveryWeeks: 8, volumeTargets: { chest: [6, 10] } },
    })
    await expect(
      updateEngineSettings((e) => ({ ...e, volumeTargets: { biceps: [9, 4] } }), LATER),
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(updateEngineSettings((e) => ({ ...e, deloadEveryWeeks: 0 }), LATER)).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect((await getSettings()).engine.deloadEveryWeeks).toBe(8)
  })
})

describe('pesées', () => {
  it('liste triée par date croissante', async () => {
    await upsertWeighIn({ date: '2026-02-03', weightKg: 71 }, NOW)
    await upsertWeighIn({ date: '2026-02-01', weightKg: 70 }, NOW)
    await upsertWeighIn({ date: '2026-02-02', weightKg: 70.5, note: 'n' }, NOW)
    const list = await listWeighIns()
    expect(list.map((w) => w.date)).toEqual(['2026-02-01', '2026-02-02', '2026-02-03'])
    expect(list[1]?.note).toBe('n')
  })

  it('upsert à la même date remplace en gardant l’id', async () => {
    const a = await upsertWeighIn({ date: '2026-02-01', weightKg: 70, note: 'x' }, NOW)
    const b = await upsertWeighIn({ date: '2026-02-01', weightKg: 71 }, LATER)
    expect(b.id).toBe(a.id)
    expect(b.createdAt).toBe(NOW)
    const list = await listWeighIns()
    expect(list).toHaveLength(1)
    expect(list[0]).toEqual({ id: a.id, date: '2026-02-01', weightKg: 71, createdAt: NOW })
  })

  it('valide poids et date', async () => {
    await expect(upsertWeighIn({ date: '2026-02-01', weightKg: 29.9 })).rejects.toThrow(/30 et 250/)
    await expect(upsertWeighIn({ date: '2026-02-01', weightKg: 250.1 })).rejects.toThrow()
    await expect(upsertWeighIn({ date: '2026-02-01', weightKg: Number.NaN })).rejects.toThrow()
    await expect(upsertWeighIn({ date: '2026-02-30', weightKg: 70 })).rejects.toThrow(/Date invalide/)
    await expect(upsertWeighIn({ date: '1/2/2026', weightKg: 70 })).rejects.toThrow(/Date invalide/)
    await expect(upsertWeighIn({ date: '2026-02-01', weightKg: 30 })).resolves.toBeDefined()
    await expect(upsertWeighIn({ date: '2026-02-02', weightKg: 250 })).resolves.toBeDefined()
  })

  it('updateWeighIn modifie, refuse une date déjà prise, efface la note', async () => {
    const a = await upsertWeighIn({ date: '2026-02-01', weightKg: 70, note: 'n' }, NOW)
    await upsertWeighIn({ date: '2026-02-02', weightKg: 71 }, NOW)
    await expect(updateWeighIn(a.id, { date: '2026-02-02' })).rejects.toThrow(
      'Une pesée existe déjà à cette date.',
    )
    const u = await updateWeighIn(a.id, { weightKg: 72, date: '2026-02-05', note: undefined })
    expect(u).toEqual({ id: a.id, date: '2026-02-05', weightKg: 72, createdAt: NOW })
    expect((await listWeighIns()).map((w) => w.date)).toEqual(['2026-02-02', '2026-02-05'])
    await expect(updateWeighIn(a.id, { weightKg: 5 })).rejects.toThrow()
    await expect(updateWeighIn('inconnu', { weightKg: 70 })).rejects.toThrow(/introuvable/)
  })

  it('deleteWeighIn', async () => {
    const a = await upsertWeighIn({ date: '2026-02-01', weightKg: 70 }, NOW)
    await deleteWeighIn(a.id)
    expect(await listWeighIns()).toEqual([])
  })
})

describe('mensurations', () => {
  it('ajout, liste triée, mise à jour, suppression', async () => {
    const b = await addMeasurement({ date: '2026-02-10', armCm: 33 }, NOW)
    await addMeasurement({ date: '2026-02-01', waistCm: 80, note: 'n' }, NOW)
    expect((await listMeasurements()).map((m) => m.date)).toEqual(['2026-02-01', '2026-02-10'])
    const u = await updateMeasurement(b.id, { chestCm: 100, armCm: undefined })
    expect(u).toEqual({ id: b.id, date: '2026-02-10', chestCm: 100, createdAt: NOW })
    await deleteMeasurement(b.id)
    expect(await listMeasurements()).toHaveLength(1)
  })

  it('valide : au moins une valeur, valeurs > 0, date valide', async () => {
    await expect(addMeasurement({ date: '2026-02-01' })).rejects.toThrow(/au moins une/)
    await expect(addMeasurement({ date: '2026-02-01', armCm: 0 })).rejects.toThrow(/supérieurs à 0/)
    await expect(addMeasurement({ date: '2026-02-01', armCm: -3 })).rejects.toThrow()
    await expect(addMeasurement({ date: 'nope', armCm: 30 })).rejects.toThrow(/Date invalide/)
    const m = await addMeasurement({ date: '2026-02-01', armCm: 30 }, NOW)
    await expect(updateMeasurement(m.id, { armCm: undefined })).rejects.toThrow(/au moins une/)
    await expect(updateMeasurement(m.id, { armCm: 0 })).rejects.toThrow()
    await expect(updateMeasurement('inconnu', { armCm: 3 })).rejects.toThrow(/introuvable/)
    expect(await listMeasurements()).toEqual([m])
  })
})

describe('completeOnboarding', () => {
  const input = () => ({
    profile: makeProfile({ updatedAt: '1999-01-01T00:00:00.000Z' }),
    equipment: defaultEquipment(NOW),
    weighIn: { date: '2026-03-01', weightKg: 70 },
  })

  it('écrit tout en une fois', async () => {
    await completeOnboarding(input(), LATER)
    expect((await getProfile())?.updatedAt).toBe(LATER)
    expect(await db.equipment.count()).toBe(1)
    const w = await listWeighIns()
    expect(w).toHaveLength(1)
    expect(w[0]).toMatchObject({ date: '2026-03-01', weightKg: 70, createdAt: LATER })
    expect((await getSettings()).onboardingCompleted).toBe(true)
  })

  it('est atomique : si la dernière écriture échoue, rien n’est écrit', async () => {
    vi.spyOn(db.settings, 'put').mockRejectedValue(new Error('boom'))
    await expect(completeOnboarding(input(), LATER)).rejects.toThrow()
    expect(await db.profile.count()).toBe(0)
    expect(await db.equipment.count()).toBe(0)
    expect(await db.weighIns.count()).toBe(0)
    expect(await db.settings.count()).toBe(0)
  })

  it('n’écrit rien si une donnée est invalide', async () => {
    await expect(
      completeOnboarding({ ...input(), weighIn: { date: '2026-03-01', weightKg: 3 } }),
    ).rejects.toThrow()
    expect(await db.profile.count()).toBe(0)
  })
})

function fail(): never {
  throw new Error('fixture manquante')
}

describe('séances et états', () => {
  const base = makeFullTables().sessions[0] ?? fail()
  const state0 = () => makeFullTables().exerciseState[0] ?? fail()
  const session = (id: string, date: string, startedAt?: string) => {
    const { startedAt: _drop, ...rest } = base
    void _drop
    return { ...rest, id, date, ...(startedAt ? { startedAt } : {}) }
  }

  it('listSessions trie par date, puis startedAt, puis id', async () => {
    await db.sessions.bulkPut([
      session('c', '2026-03-02'),
      session('b', '2026-03-01', '2026-03-01T18:00:00.000Z'),
      session('z', '2026-03-01', '2026-03-01T08:00:00.000Z'),
      session('a', '2026-03-01', '2026-03-01T18:00:00.000Z'),
    ])
    expect((await listSessions()).map((s) => s.id)).toEqual(['z', 'a', 'b', 'c'])
  })

  it('listSessions renvoie [] sans données', async () => {
    expect(await listSessions()).toEqual([])
  })

  it('saveExerciseStates upsert, horodate et conserve les nouveaux champs', async () => {
    const state = state0()
    expect(await listExerciseStates()).toEqual([])
    const written = await saveExerciseStates([state, { ...state, exerciseId: 'plank', loadKg: null }], LATER)
    expect(written.every((s) => s.updatedAt === LATER)).toBe(true)
    await saveExerciseStates([{ ...state, loadKg: 20, topStreak: 0 }], '2026-03-03T09:00:00.000Z')
    const all = await listExerciseStates()
    expect(all).toHaveLength(2)
    const goblet = all.find((s) => s.exerciseId === state.exerciseId)
    expect(goblet).toMatchObject({
      loadKg: 20,
      topStreak: 0,
      tempo: true,
      targetDurationSec: 40,
      updatedAt: '2026-03-03T09:00:00.000Z',
    })
  })

  it('saveExerciseStates valide tout avant d’écrire et refuse un état invalide', async () => {
    const state = state0()
    await expect(
      saveExerciseStates([state, { ...state, exerciseId: 'x', recentFeelings: ['nope' as never] }]),
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(saveExerciseStates([{ ...state, topStreak: -1 }])).rejects.toBeInstanceOf(ValidationError)
    await expect(saveExerciseStates([{ ...state, targetDurationSec: 0 }])).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect(await db.exerciseState.count()).toBe(0)
  })

  it('saveExerciseStates propage un échec d’écriture', async () => {
    vi.spyOn(db.exerciseState, 'bulkPut').mockRejectedValue(new Error('boom'))
    await expect(saveExerciseStates([state0()])).rejects.toThrow()
  })
})

describe('observe', () => {
  it('émet à l’abonnement puis à chaque changement, et se désabonne', async () => {
    const seen: number[] = []
    const stop = observe(
      async () => (await listWeighIns()).length,
      (n) => seen.push(n),
    )
    await vi.waitFor(() => expect(seen).toEqual([0]))
    await upsertWeighIn({ date: '2026-02-01', weightKg: 70 }, NOW)
    await vi.waitFor(() => expect(seen.at(-1)).toBe(1))
    stop()
    await upsertWeighIn({ date: '2026-02-02', weightKg: 70 }, NOW)
    await new Promise((r) => setTimeout(r, 50))
    expect(seen.at(-1)).toBe(1)
  })

  it('transmet les erreurs à onError', async () => {
    const onError = vi.fn()
    const stop = observe(
      () => Promise.reject(new Error('x')),
      () => undefined,
      onError,
    )
    await vi.waitFor(() => expect(onError).toHaveBeenCalled())
    stop()
  })
})

describe('requestPersistentStorage', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'storage')
  afterEach(() => {
    if (original) Object.defineProperty(navigator, 'storage', original)
    else Reflect.deleteProperty(navigator, 'storage')
  })
  const setStorage = (value: unknown) =>
    Object.defineProperty(navigator, 'storage', { value, configurable: true })

  it('renvoie false si l’API est absente', async () => {
    setStorage(undefined)
    expect(await requestPersistentStorage()).toBe(false)
    setStorage({})
    expect(await requestPersistentStorage()).toBe(false)
  })
  it('renvoie le résultat de persist()', async () => {
    setStorage({ persist: () => Promise.resolve(true) })
    expect(await requestPersistentStorage()).toBe(true)
    setStorage({ persist: () => Promise.resolve(false) })
    expect(await requestPersistentStorage()).toBe(false)
  })
  it('ne plante jamais', async () => {
    setStorage({ persist: () => Promise.reject(new Error('non')) })
    expect(await requestPersistentStorage()).toBe(false)
  })
})

describe('règles métier (repositories)', () => {
  it('profil : âge, taille, séances', async () => {
    await expect(saveProfile(makeProfile({ birthDate: '2016-05-17' }), NOW)).rejects.toThrow(/âge/)
    await expect(saveProfile(makeProfile({ birthDate: '1900-01-01' }), NOW)).rejects.toThrow(/âge/)
    await expect(saveProfile(makeProfile({ heightCm: 0 }), NOW)).rejects.toThrow(/taille/)
    await expect(saveProfile(makeProfile({ weeklySessionsTarget: 8 }), NOW)).rejects.toThrow(/séances/)
    await expect(saveProfile(makeProfile({ weeklySessionsMin: 2.5 }), NOW)).rejects.toThrow(/séances/)
    await expect(saveProfile(makeProfile({ weeklySessionsMin: 0 }), NOW)).rejects.toThrow(/séances/)
  })

  it('pesée future refusée (saisie, mise à jour, onboarding)', async () => {
    await expect(upsertWeighIn({ date: '2026-03-02', weightKg: 70 }, NOW)).rejects.toThrow(/futur/)
    await expect(upsertWeighIn({ date: '2026-03-01', weightKg: 70 }, NOW)).resolves.toBeDefined()
    const a = await upsertWeighIn({ date: '2026-02-01', weightKg: 70 }, NOW)
    await expect(updateWeighIn(a.id, { date: '2026-04-01' }, NOW)).rejects.toThrow(/futur/)
    await expect(
      completeOnboarding(
        {
          profile: makeProfile(),
          equipment: defaultEquipment(NOW),
          weighIn: { date: '2027-01-01', weightKg: 70 },
        },
        NOW,
      ),
    ).rejects.toThrow(/futur/)
  })

  it('coachUrl : null ou https uniquement', async () => {
    await expect(updateSettings({ coachUrl: 'javascript:alert(1)' }, NOW)).rejects.toThrow(/https/)
    await expect(updateSettings({ coachUrl: 'http://x.test' }, NOW)).rejects.toThrow(/https/)
    await expect(updateSettings({ coachUrl: 'pas une url' }, NOW)).rejects.toThrow(/https/)
    await expect(updateSettings({ coachUrl: 'https://claude.ai/project/1' }, NOW)).resolves.toBeDefined()
    await expect(updateSettings({ coachUrl: null }, NOW)).resolves.toBeDefined()
  })
})

describe('validateurs purs', () => {
  const today = '2026-03-01'
  it('checkProfileIdentity', () => {
    expect(checkProfileIdentity({ birthDate: '2000-01-01', heightCm: 180 }, today)).toBeNull()
    expect(checkProfileIdentity({ birthDate: '2016-03-02', heightCm: 180 }, today)).toMatch(/âge/)
    expect(checkProfileIdentity({ birthDate: '2012-03-01', heightCm: 180 }, today)).toBeNull()
    expect(checkProfileIdentity({ birthDate: '2000-01-01', heightCm: 99 }, today)).toMatch(/taille/)
    expect(checkProfileIdentity({ birthDate: 'zzz', heightCm: 180 }, today)).toMatch(/naissance/)
  })
  it('checkWeeklySessions / checkProfile', () => {
    expect(checkWeeklySessions({ weeklySessionsTarget: 7, weeklySessionsMin: 7 })).toBeNull()
    expect(checkWeeklySessions({ weeklySessionsTarget: 3, weeklySessionsMin: 4 })).not.toBeNull()
    expect(checkProfile(makeProfile(), today)).toBeNull()
  })
  it('checkEquipment', () => {
    expect(checkEquipment(defaultEquipment(NOW))).toBeNull()
    expect(checkEquipment({ kettlebell: { minKg: 12, maxKg: 24, stepKg: 0 } })).toMatch(/pas/)
  })
  it('checkWeighIn', () => {
    expect(checkWeighIn({ date: today, weightKg: 70 }, today)).toBeNull()
    expect(checkWeighIn({ date: '2026-03-02', weightKg: 70 }, today)).toMatch(/futur/)
    expect(checkWeighIn({ date: today, weightKg: -5 }, today)).toMatch(/30 et 250/)
  })
  it('checkMeasurement / checkCoachUrl / checkSettings', () => {
    expect(checkMeasurement({ date: today, armCm: 30 })).toBeNull()
    expect(checkMeasurement({ date: today })).not.toBeNull()
    expect(checkCoachUrl(null)).toBeNull()
    expect(checkSettings({ coachUrl: 'ftp://x' })).not.toBeNull()
  })
})
