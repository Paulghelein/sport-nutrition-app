import { beforeEach, describe, expect, it } from 'vitest'
import type { Exercise, ExerciseInput, LibraryExercise } from '../types'
import { TABLE_NAMES } from '../types'
import { exportBackup, importBackup, parseBackup } from './backup'
import { db } from './database'
import {
  ValidationError,
  createExercise,
  deleteExercise,
  listExercisePrefs,
  listExerciseRows,
  observe,
  restoreExercise,
  setExercisePreference,
  updateExercise,
} from './repositories'
import { NOW, makeFullTables } from './testFixtures'
import {
  MAX_PROGRESSION_CRITERIA_LENGTH,
  MAX_SETUP_LENGTH,
  MAX_TECHNIQUE_LINES,
  MAX_TECHNIQUE_LINE_LENGTH,
  checkExercise,
} from './validation'

const LATER = '2026-03-02T09:00:00.000Z'

function makeInput(overrides: Partial<ExerciseInput> = {}): ExerciseInput {
  return {
    name: 'Pompe lestée',
    pattern: 'push_h',
    level: 1,
    muscles: { primary: ['chest'], secondary: ['triceps'] },
    equipment: [],
    loadType: 'bodyweight',
    repRange: [8, 15],
    restSec: 60,
    compound: true,
    unilateral: false,
    loadStepKg: 1,
    progressionCriteria: '3 × 15',
    technique: { setup: '', steps: ['Descendre'], cues: ['Gainer'], mistakes: ['Cambrer'] },
    ...overrides,
  }
}

function makeSeed(): Exercise {
  return {
    ...makeInput({ name: 'Squat gobelet', loadType: 'kettlebell', equipment: ['kettlebell'] }),
    id: 'goblet-squat',
    illustration: 'goblet-squat',
    source: 'seed',
    updatedAt: NOW,
  }
}

function asLibrary(e: Exercise, overridden = false): LibraryExercise {
  return { ...e, overridden, preference: 'liked' }
}

async function one(id: string): Promise<Exercise> {
  const row = await db.exercises.get(id)
  if (!row) throw new Error('ligne absente')
  return row
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('checkExercise', () => {
  const bad = (o: Partial<ExerciseInput>) => checkExercise(makeInput(o))

  it('accepte un exercice valide (setup vide, sans vidéo)', () => {
    expect(checkExercise(makeInput())).toBeNull()
  })
  it('nom : non vide après trim, 80 caractères max', () => {
    expect(bad({ name: '   ' })).toContain('nom')
    expect(bad({ name: 'a'.repeat(81) })).toContain('80')
    expect(bad({ name: 'a'.repeat(80) })).toBeNull()
  })
  it('muscles : un principal minimum, pas de chevauchement', () => {
    expect(bad({ muscles: { primary: [], secondary: [] } })).toContain('principal')
    expect(bad({ muscles: { primary: ['chest'], secondary: ['chest'] } })).toContain('secondaire')
  })
  it('répétitions : entiers 1–100, min ≤ max, requis hors chronométré', () => {
    expect(bad({ repRange: [0, 5] })).toContain('répétitions')
    expect(bad({ repRange: [5, 101] })).toContain('répétitions')
    expect(bad({ repRange: [10, 5] })).toContain('répétitions')
    expect(bad({ repRange: [5.5, 8] })).toContain('répétitions')
    expect(bad({ repRange: [1, 100] })).toBeNull()
    const without = makeInput()
    delete without.repRange
    expect(checkExercise(without)).toContain('répétitions')
  })
  it('chronométré : durée 5–600 requise, pas de répétitions', () => {
    const timed = { loadType: 'timed' as const }
    const base = makeInput(timed)
    delete base.repRange
    expect(checkExercise({ ...base, durationRange: [20, 60] })).toBeNull()
    expect(checkExercise(base)).toContain('durée')
    expect(checkExercise({ ...base, durationRange: [4, 60] })).toContain('durée')
    expect(checkExercise({ ...base, durationRange: [20, 601] })).toContain('durée')
    expect(checkExercise({ ...base, durationRange: [60, 20] })).toContain('durée')
    expect(checkExercise({ ...base, durationRange: [20, 60], repRange: [5, 8] })).toContain('répétitions')
  })
  it('kettlebell : cible en reps ou en durée (portés), jamais les deux ni aucune', () => {
    const kb = { loadType: 'kettlebell' as const, equipment: ['kettlebell' as const] }
    expect(bad(kb)).toBeNull()
    const carry = makeInput(kb)
    delete carry.repRange
    expect(checkExercise({ ...carry, durationRange: [20, 60] })).toBeNull()
    expect(checkExercise({ ...carry, durationRange: [2, 60] })).toContain('durée')
    expect(checkExercise({ ...carry, durationRange: [20, 60], repRange: [8, 12] })).toContain(
      'une seule cible',
    )
    expect(checkExercise(carry)).toContain('Indique une cible')
  })
  it('deux cibles ou aucune cible refusées pour les autres types', () => {
    expect(bad({ durationRange: [20, 40] })).toContain('une seule cible')
    const none = makeInput()
    delete none.repRange
    expect(checkExercise(none)).toContain('répétitions')
    expect(checkExercise({ ...none, loadType: 'timed' })).toContain('durée')
    expect(
      checkExercise({ ...none, loadType: 'timed', durationRange: [20, 40], repRange: [5, 8] }),
    ).toContain('une seule cible')
    expect(checkExercise({ ...none, durationRange: [20, 40] })).toContain('répétitions')
  })
  it('bornes de texte : setup/progression 500, lignes 300, 12 lignes par liste', () => {
    const t = makeInput().technique
    expect(bad({ technique: { ...t, setup: 'x'.repeat(MAX_SETUP_LENGTH) } })).toBeNull()
    expect(bad({ technique: { ...t, setup: 'x'.repeat(MAX_SETUP_LENGTH + 1) } })).toContain('mise en place')
    expect(bad({ progressionCriteria: 'x'.repeat(MAX_PROGRESSION_CRITERIA_LENGTH) })).toBeNull()
    expect(bad({ progressionCriteria: 'x'.repeat(MAX_PROGRESSION_CRITERIA_LENGTH + 1) })).toContain(
      'progression',
    )
    const line = 'x'.repeat(MAX_TECHNIQUE_LINE_LENGTH)
    expect(bad({ technique: { ...t, steps: [line] } })).toBeNull()
    expect(bad({ technique: { ...t, cues: [line + 'x'] } })).toContain('300')
    const twelve = Array.from({ length: MAX_TECHNIQUE_LINES }, () => 'ok')
    expect(bad({ technique: { ...t, mistakes: twelve } })).toBeNull()
    expect(bad({ technique: { ...t, mistakes: [...twelve, 'ok'] } })).toContain('12 lignes')
  })
  it('repos : entier 0–600', () => {
    expect(bad({ restSec: -1 })).toContain('repos')
    expect(bad({ restSec: 601 })).toContain('repos')
    expect(bad({ restSec: 1.5 })).toContain('repos')
    expect(bad({ restSec: 0 })).toBeNull()
  })
  it('matériel : kettlebell requise pour la charge kettlebell, pas de doublon', () => {
    expect(bad({ loadType: 'kettlebell', equipment: [] })).toContain('kettlebell')
    expect(bad({ loadType: 'kettlebell', equipment: ['kettlebell'] })).toBeNull()
    expect(bad({ equipment: ['pullup_bar', 'pullup_bar'] })).toContain('doublon')
  })
  it('vidéo : https uniquement', () => {
    expect(bad({ videoUrl: 'https://example.com/v' })).toBeNull()
    expect(bad({ videoUrl: 'http://example.com' })).toContain('https')
    expect(bad({ videoUrl: 'javascript:alert(1)' })).toContain('https')
    expect(bad({ videoUrl: 'pas une url' })).toContain('https')
  })
  it('technique : pas de ligne vide dans étapes, conseils, erreurs', () => {
    const t = makeInput().technique
    expect(bad({ technique: { ...t, steps: ['ok', ' '] } })).toContain('vide')
    expect(bad({ technique: { ...t, cues: [''] } })).toContain('vide')
    expect(bad({ technique: { ...t, mistakes: [''] } })).toContain('vide')
  })
})

describe('createExercise', () => {
  it('crée une ligne user avec id UUID, chaînes trimées, vidéo vide retirée', async () => {
    const e = await createExercise(
      makeInput({
        name: '  Pompe  ',
        videoUrl: '  ',
        technique: { setup: ' x ', steps: [' a '], cues: [], mistakes: [] },
      }),
      NOW,
    )
    expect(e.source).toBe('user')
    expect(e.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(e.name).toBe('Pompe')
    expect(e.technique).toEqual({ setup: 'x', steps: ['a'], cues: [], mistakes: [] })
    expect('videoUrl' in e).toBe(false)
    expect(e.updatedAt).toBe(NOW)
    expect(await one(e.id)).toEqual(e)
  })
  it('lève ValidationError si invalide et n’écrit rien', async () => {
    await expect(createExercise(makeInput({ name: '' }), NOW)).rejects.toBeInstanceOf(ValidationError)
    expect(await db.exercises.count()).toBe(0)
  })
})

describe('updateExercise', () => {
  it('exercice user : met à jour la ligne existante', async () => {
    const e = await createExercise(makeInput(), NOW)
    const u = await updateExercise(e, makeInput({ name: 'Pompe 2' }), LATER)
    expect(u).toMatchObject({ id: e.id, source: 'user', name: 'Pompe 2', updatedAt: LATER })
    expect(await db.exercises.count()).toBe(1)
  })
  it('exercice user absent : erreur', async () => {
    const ghost: Exercise = { ...makeSeed(), id: 'ghost', source: 'user' }
    await expect(updateExercise(ghost, makeInput(), NOW)).rejects.toBeInstanceOf(ValidationError)
  })
  it('exercice de départ : écrit une surcharge sans champs LibraryExercise, la remplace ensuite', async () => {
    const seed = asLibrary(makeSeed())
    const u = await updateExercise(seed, makeInput({ name: 'Mon squat' }), NOW)
    expect(u).toMatchObject({ id: 'goblet-squat', source: 'seed', name: 'Mon squat' })
    expect('overridden' in u || 'preference' in u || 'deleted' in u).toBe(false)
    const stored = await one('goblet-squat')
    expect(Object.keys(stored)).not.toContain('overridden')
    await updateExercise(asLibrary(stored, true), makeInput({ name: 'Encore' }), LATER)
    expect(await db.exercises.count()).toBe(1)
    expect((await one('goblet-squat')).name).toBe('Encore')
  })
  it('surcharge d’un exercice supprimé : retire deleted', async () => {
    await deleteExercise(makeSeed(), NOW)
    await updateExercise(makeSeed(), makeInput(), LATER)
    expect((await one('goblet-squat')).deleted).toBeUndefined()
  })
  it('invalide : ValidationError', async () => {
    await expect(updateExercise(makeSeed(), makeInput({ restSec: 999 }), NOW)).rejects.toBeInstanceOf(
      ValidationError,
    )
  })
})

describe('deleteExercise', () => {
  it('user : suppression logique, préférence et état conservés', async () => {
    const e = await createExercise(makeInput(), NOW)
    await setExercisePreference(e.id, 'liked', NOW)
    await db.exerciseState.put({ exerciseId: e.id, loadKg: null, recentFeelings: [], updatedAt: NOW })
    await db.exerciseState.put({ exerciseId: 'autre', loadKg: null, recentFeelings: [], updatedAt: NOW })
    await deleteExercise(e, LATER)
    expect(await one(e.id)).toMatchObject({ source: 'user', name: e.name, deleted: true, updatedAt: LATER })
    expect(await db.exercisePrefs.count()).toBe(1)
    expect(await db.exerciseState.count()).toBe(2)
  })
  it('user supprimé : updateExercise échoue, restoreExercise ne le ramène pas', async () => {
    const e = await createExercise(makeInput(), NOW)
    await deleteExercise(e, LATER)
    await expect(updateExercise(e, makeInput({ name: 'Autre' }), LATER)).rejects.toThrow()
    await restoreExercise(e.id)
    expect((await one(e.id)).deleted).toBe(true)
  })
  it('seed : écrit une surcharge deleted sans champs LibraryExercise', async () => {
    await deleteExercise(asLibrary(makeSeed()), LATER)
    const row = await one('goblet-squat')
    expect(row).toMatchObject({ source: 'seed', deleted: true, name: 'Squat gobelet', updatedAt: LATER })
    expect('overridden' in row || 'preference' in row).toBe(false)
  })
})

describe('restoreExercise', () => {
  it('supprime la surcharge seed (modification ou suppression)', async () => {
    await updateExercise(makeSeed(), makeInput({ name: 'X' }), NOW)
    await restoreExercise('goblet-squat')
    expect(await db.exercises.count()).toBe(0)
    await deleteExercise(makeSeed(), NOW)
    await restoreExercise('goblet-squat')
    expect(await db.exercises.count()).toBe(0)
  })
  it('ne touche pas une ligne user ni un id inconnu', async () => {
    const e = await createExercise(makeInput(), NOW)
    await restoreExercise(e.id)
    await restoreExercise('inconnu')
    expect(await db.exercises.count()).toBe(1)
  })
})

describe('setExercisePreference / listes', () => {
  it('upsert, conserve reason, neutral supprime', async () => {
    await db.exercisePrefs.put({ exerciseId: 'a', preference: 'disliked', reason: 'genou', updatedAt: NOW })
    await setExercisePreference('a', 'hidden', LATER)
    expect(await listExercisePrefs()).toEqual([
      { exerciseId: 'a', preference: 'hidden', reason: 'genou', updatedAt: LATER },
    ])
    await setExercisePreference('b', 'liked', LATER)
    expect(await listExercisePrefs()).toHaveLength(2)
    await setExercisePreference('a', 'neutral', LATER)
    await setExercisePreference('zzz', 'neutral', LATER)
    expect((await listExercisePrefs()).map((p) => p.exerciseId)).toEqual(['b'])
  })
  it('listExerciseRows renvoie toutes les lignes et est observable', async () => {
    const seen: number[] = []
    const stop = observe(listExerciseRows, (rows) => seen.push(rows.length))
    await createExercise(makeInput(), NOW)
    await createExercise(makeInput({ name: 'B' }), NOW)
    await new Promise((r) => setTimeout(r, 50))
    stop()
    expect(await listExerciseRows()).toHaveLength(2)
    expect(seen.at(-1)).toBe(2)
  })
})

describe('sauvegarde avec exercices', () => {
  it('aller-retour : exercice user, surcharge et suppression se réimportent à l’identique', async () => {
    const user = await createExercise(makeInput({ videoUrl: 'https://example.com/v' }), NOW)
    await setExercisePreference(user.id, 'liked', NOW)
    await updateExercise(makeSeed(), makeInput({ name: 'Squat perso' }), NOW)
    const gone: Exercise = { ...makeSeed(), id: 'kb-swing', name: 'Swing' }
    await deleteExercise(asLibrary(gone), NOW)

    const before = await exportBackup(NOW)
    expect(before.tables.exercises).toHaveLength(3)
    const parsed = parseBackup(JSON.stringify(before), '2026-03-01')
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'))

    await Promise.all(db.tables.map((t) => t.clear()))
    await importBackup(parsed.backup, 'replace', NOW)
    const after = await exportBackup(NOW)
    for (const n of TABLE_NAMES) {
      const plain = (rows: readonly object[]): unknown[] => rows.map((r) => JSON.parse(JSON.stringify(r)))
      expect(plain(after.tables[n])).toHaveLength(before.tables[n].length)
      expect(plain(after.tables[n])).toEqual(expect.arrayContaining(plain(before.tables[n])))
    }
  })
  it('refuse à l’import un exercice qui enfreint les règles, accepte une suppression', () => {
    const t = makeFullTables()
    const ex = t.exercises[0]
    if (!ex) throw new Error('fixture')
    const bad = { ...ex, name: ' ' }
    const r = parseBackup(
      JSON.stringify({ app: 'forge', schemaVersion: 1, exportedAt: NOW, tables: { ...t, exercises: [bad] } }),
      '2026-03-01',
    )
    expect(r.ok).toBe(false)
    const tomb = { ...ex, name: ' ', deleted: true }
    const ok = parseBackup(
      JSON.stringify({
        app: 'forge',
        schemaVersion: 1,
        exportedAt: NOW,
        tables: { ...t, exercises: [tomb] },
      }),
      '2026-03-01',
    )
    expect(ok.ok).toBe(true)
    const userTomb = { ...tomb, source: 'user' }
    const okUser = parseBackup(
      JSON.stringify({
        app: 'forge',
        schemaVersion: 1,
        exportedAt: NOW,
        tables: { ...t, exercises: [userTomb] },
      }),
      '2026-03-01',
    )
    expect(okUser.ok).toBe(true)
  })
})
