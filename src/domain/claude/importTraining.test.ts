import { describe, expect, it } from 'vitest'
import { checkExercise } from '../../db/validation'
import { parseImport } from './import'
import { resolvePlanBlocks, type ImportExerciseRef } from './importTraining'
import type { ImportPreviewItem } from '../../types/recipes'

const exercises: ImportExerciseRef[] = [
  { id: 'goblet-squat', name: 'Goblet squat', pattern: 'squat', level: 2, loadType: 'kettlebell', restSec: 90, repRange: [8, 12] },
  { id: 'incline-push-up', name: 'Pompes inclinées', pattern: 'push_h', level: 1, loadType: 'bodyweight', restSec: 60, repRange: [8, 15] },
  { id: 'plank', name: 'Planche', pattern: 'core', level: 1, loadType: 'timed', restSec: 45, durationRange: [20, 40] },
]
const ctx = { today: '2026-10-16', exercises, validateExercise: checkExercise }
const run = (v: unknown, c = ctx): ImportPreviewItem[] => {
  const r = parseImport(JSON.stringify(v), c)
  if (!r.ok) throw new Error(r.error)
  return r.items
}
const one = (v: unknown): ImportPreviewItem => run([v])[0] as ImportPreviewItem

const EXO = {
  type: 'exercise',
  name: 'Hip thrust au sol KB',
  pattern: 'charnière',
  level: 1,
  muscles: { primary: ['fessiers'], secondary: ['ischio-jambiers'] },
  loadType: 'kettlebell',
  repRange: [10, 15],
}

describe('sans exercices : types J9 non pris en charge', () => {
  it('unsupported avec renvoi vers « Coller la réponse de Claude »', () => {
    const r = parseImport(JSON.stringify([EXO, { type: 'sessionPlan' }, { type: 'exercisePreference' }]), { today: '2026-10-16' })
    if (!r.ok) throw new Error()
    expect(r.items.map((i) => i.kind)).toEqual(['unsupported', 'unsupported', 'unsupported'])
    expect(r.items[0]).toMatchObject({ message: expect.stringContaining('Coller la réponse de Claude') })
  })
})

describe('exercise', () => {
  it('valeurs françaises converties, champs complétés', () => {
    const it0 = one(EXO)
    expect(it0.kind).toBe('exercise')
    if (it0.kind !== 'exercise') return
    expect(it0.exercise).toMatchObject({
      name: 'Hip thrust au sol KB',
      pattern: 'hinge',
      muscles: { primary: ['glutes'], secondary: ['hamstrings'] },
      equipment: ['kettlebell'],
      loadStepKg: 2,
      restSec: 90,
      compound: true,
      unilateral: false,
    })
    expect(it0.exercise.durationRange).toBeUndefined()
    expect(it0.exercise.progressionCriteria).toContain('15')
    expect(it0.exercise.technique.setup).not.toBe('')
    expect(it0.warnings.join(' ')).toContain('à compléter')
  })
  it('poids du corps : pas de matériel, palier 1 kg ; chronométré : durée, repos 45', () => {
    const bw = one({ ...EXO, name: 'Pompes lestées', pattern: 'push_h', loadType: 'poids du corps', muscles: { primary: ['pectoraux'] } })
    expect(bw).toMatchObject({ kind: 'exercise', exercise: { equipment: [], loadStepKg: 1, restSec: 60 } })
    const timed = one({ ...EXO, name: 'Gainage latéral', pattern: 'gainage', loadType: 'timed', repRange: undefined, durationRange: [20, 45], muscles: { primary: ['abdos'] } })
    expect(timed).toMatchObject({ kind: 'exercise', exercise: { loadType: 'timed', durationRange: [20, 45], restSec: 45 } })
  })
  it('exactement une cible', () => {
    expect(one({ ...EXO, durationRange: [20, 30] })).toMatchObject({ kind: 'invalid' })
    expect(one({ ...EXO, repRange: undefined })).toMatchObject({ kind: 'invalid' })
    expect(one({ ...EXO, loadType: 'timed' })).toMatchObject({ kind: 'invalid' }) // timed + reps seulement
    expect(one({ ...EXO, loadType: 'timed', durationRange: [20, 30] })).toMatchObject({ kind: 'exercise', warnings: expect.arrayContaining(['exercice chronométré : repRange ignoré']) })
  })
  it('erreurs lisibles', () => {
    const bad = one({ ...EXO, pattern: 'banane', muscles: { primary: ['genou'] }, name: '' })
    expect(bad.kind).toBe('invalid')
    if (bad.kind !== 'invalid') return
    expect(bad.errors.join('|')).toMatch(/nom manquant.*schéma de mouvement inconnu « banane ».*muscle inconnu « genou »/)
  })
  it('validateExercise injecté et doublon de nom', () => {
    expect(one({ ...EXO, repRange: [0, 5] })).toMatchObject({ kind: 'invalid' })
    const dup = one({ ...EXO, name: 'goblet SQUAT' })
    expect(dup).toMatchObject({ kind: 'exercise' })
    if (dup.kind === 'exercise') {
      expect(dup.warnings.join(' ')).toContain('existe déjà')
      expect(dup.duplicateOf).toBe('goblet-squat')
    }
    const fresh = one(EXO)
    if (fresh.kind === 'exercise') expect('duplicateOf' in fresh).toBe(false)
    const custom = run([EXO], { ...ctx, validateExercise: () => 'refusé' })[0]
    expect(custom).toMatchObject({ kind: 'invalid', errors: ['refusé'] })
  })
  it('matériel explicite et muscle principal/secondaire en double', () => {
    const it0 = one({ ...EXO, loadType: 'bodyweight', equipment: ['tapis', 'barre de traction'], muscles: { primary: ['dos'], secondary: ['dos', 'biceps'] } })
    expect(it0).toMatchObject({ kind: 'exercise', exercise: { equipment: ['mat', 'pullup_bar'], muscles: { primary: ['back'], secondary: ['biceps'] } } })
  })
})

describe('exercisePreference', () => {
  it('id existant, mots français, nom reconnu', () => {
    expect(one({ type: 'exercisePreference', exerciseId: 'plank', preference: 'disliked', reason: 'mal au dos' })).toMatchObject({
      kind: 'exercisePreference',
      preference: { exerciseId: 'plank', preference: 'disliked', reason: 'mal au dos' },
    })
    expect(one({ type: 'exercisePreference', exerciseId: 'plank', preference: 'Pas aimé' })).toMatchObject({ preference: { preference: 'disliked' } })
    expect(one({ type: 'exercisePreference', exerciseId: 'plank', preference: 'masqué' })).toMatchObject({ preference: { preference: 'hidden' } })
    const byName = one({ type: 'exercisePreference', exerciseId: 'pompes inclinees', preference: 'liked' })
    expect(byName).toMatchObject({ preference: { exerciseId: 'incline-push-up' } })
    if (byName.kind === 'exercisePreference') expect(byName.warnings).toHaveLength(1)
  })
  it('exercice inconnu ou préférence inconnue : invalid', () => {
    const bad = one({ type: 'exercisePreference', exerciseId: 'nimporte', preference: 'adoré' })
    expect(bad.kind).toBe('invalid')
    if (bad.kind !== 'invalid') return
    expect(bad.errors[0]).toContain('exercice inconnu « nimporte »')
    expect(bad.errors[1]).toContain('preference inconnue « adoré »')
  })
})

describe('sessionPlan', () => {
  const plan = (blocks: unknown[], durationMin: unknown = 30) => one({ type: 'sessionPlan', durationMin, blocks })

  it('exemple de IMPORT_FORMAT.md', () => {
    const p = plan([
      { exerciseId: 'goblet-squat', sets: 3, reps: [8, 12], loadKg: 16, restSec: 90 },
      { exerciseId: 'incline-push-up', sets: 3, reps: [10, 15], restSec: 60 },
    ])
    expect(p).toMatchObject({ kind: 'sessionPlan', warnings: ['Charges plafonnées à ta progression : l’app ne monte jamais au-delà.'] })
    if (p.kind !== 'sessionPlan') return
    expect(p.plan.durationMin).toBe(30)
    expect(p.plan.blocks).toEqual([
      { exerciseId: 'goblet-squat', sets: 3, reps: [8, 12], loadKg: 16, restSec: 90, group: 0, kind: 'single' },
      { exerciseId: 'incline-push-up', sets: 3, reps: [10, 15], restSec: 60, group: 1, kind: 'single' },
    ])
  })
  it('durée arrondie avec avertissement', () => {
    const p = plan([{ exerciseId: 'plank', sets: 2 }], 40)
    expect(p).toMatchObject({ kind: 'sessionPlan', plan: { durationMin: 45 } })
    if (p.kind === 'sessionPlan') expect(p.warnings[0]).toContain('arrondie à 45')
    expect(plan([{ exerciseId: 'plank', sets: 2 }], 'beaucoup').kind).toBe('invalid')
  })
  it('valeurs par défaut de l’exercice (repos, reps, durée)', () => {
    const p = plan([{ exerciseId: 'goblet-squat', sets: 3 }, { exerciseId: 'plank', sets: 3 }])
    if (p.kind !== 'sessionPlan') throw new Error()
    expect(p.plan.blocks[0]).toMatchObject({ reps: [8, 12], restSec: 90 })
    expect(p.plan.blocks[1]).toMatchObject({ durationSec: 20, restSec: 45 })
    expect(p.plan.blocks[1]?.reps).toBeUndefined()
  })
  it('séries et repos : bornes', () => {
    for (const sets of [0, 11, 2.5, 'x', undefined]) expect(plan([{ exerciseId: 'plank', sets }]).kind).toBe('invalid')
    expect(plan([{ exerciseId: 'plank', sets: 2, restSec: 900 }]).kind).toBe('invalid')
    expect(plan([{ exerciseId: 'plank', sets: 2, reps: [12, 8] }]).kind).toBe('invalid')
  })
  it('charges : arrondies au kg, ignorées hors kettlebell', () => {
    const p = plan([
      { exerciseId: 'goblet-squat', sets: 3, loadKg: 15.6 },
      { exerciseId: 'incline-push-up', sets: 3, loadKg: 10 },
    ])
    if (p.kind !== 'sessionPlan') throw new Error()
    expect(p.plan.blocks[0]?.loadKg).toBe(16)
    expect(p.plan.blocks[1]?.loadKg).toBeUndefined()
    expect(p.warnings.join('|')).toMatch(/ramenée à 16 kg.*charge ignorée/)
  })
  it('cible incompatible avec l’exercice ignorée', () => {
    const p = plan([{ exerciseId: 'plank', sets: 2, reps: [8, 12] }, { exerciseId: 'goblet-squat', sets: 2, durationSec: 30 }])
    if (p.kind !== 'sessionPlan') throw new Error()
    expect(p.plan.blocks[0]).toMatchObject({ durationSec: 20 })
    expect(p.plan.blocks[1]).toMatchObject({ reps: [8, 12] })
    expect(p.warnings).toHaveLength(2)
  })
  it('résolution par nom, exercice inconnu écarté, plan vide invalide', () => {
    const p = plan([{ exerciseId: 'Goblet Squat', sets: 3 }, { exerciseId: 'Burpee', sets: 3 }, { exerciseId: 'Burpee', sets: 2 }])
    if (p.kind !== 'sessionPlan') throw new Error()
    expect(p.plan.blocks.map((b) => b.exerciseId)).toEqual(['goblet-squat'])
    expect(p.plan.unknownExerciseIds).toEqual(['Burpee'])
    expect(p.warnings.filter((w) => w.includes('Burpee'))).toHaveLength(1)
    expect(plan([{ exerciseId: 'Burpee', sets: 3 }])).toMatchObject({ kind: 'invalid' })
    expect(plan([])).toMatchObject({ kind: 'invalid' })
  })
  it('supersets : lignes consécutives de même group', () => {
    const p = plan([
      { exerciseId: 'goblet-squat', sets: 3, group: 1 },
      { exerciseId: 'incline-push-up', sets: 3, group: 1 },
      { exerciseId: 'plank', sets: 2, group: 2 },
      { exerciseId: 'plank', sets: 2, group: 1 },
    ])
    if (p.kind !== 'sessionPlan') throw new Error()
    expect(p.plan.blocks.map((b) => [b.group, b.kind])).toEqual([[0, 'superset'], [0, 'superset'], [1, 'single'], [2, 'single']])
  })
  it('nouvel exercice de la même réponse + resolvePlanBlocks', () => {
    const items = run([
      { type: 'sessionPlan', durationMin: 20, blocks: [{ exerciseId: 'Hip thrust au sol KB', sets: 3, loadKg: 14, group: 1 }, { exerciseId: 'plank', sets: 2, group: 1 }] },
      EXO,
    ])
    const p = items[0]
    if (p?.kind !== 'sessionPlan') throw new Error()
    expect(p.plan.blocks[0]).toMatchObject({ newExerciseIndex: 1, loadKg: 14, reps: [10, 15], restSec: 90, kind: 'superset' })
    expect(p.plan.unknownExerciseIds).toEqual([])
    const resolved = resolvePlanBlocks(p.plan, new Map([[1, 'uuid-1']]))
    expect(resolved).toEqual([
      { exerciseId: 'uuid-1', sets: 3, loadKg: 14, reps: [10, 15], restSec: 90, group: 0, kind: 'superset' },
      { exerciseId: 'plank', sets: 2, durationSec: 20, restSec: 45, group: 0, kind: 'superset' },
    ])
    // Exercice non créé : ligne écartée, le superset restant redevient un bloc simple.
    expect(resolvePlanBlocks(p.plan, new Map())).toEqual([{ exerciseId: 'plank', sets: 2, durationSec: 20, restSec: 45, group: 0, kind: 'single' }])
  })
  it('exercice invalide de la réponse : le plan qui le cite perd la ligne', () => {
    const items = run([
      { type: 'sessionPlan', durationMin: 20, blocks: [{ exerciseId: 'Truc', sets: 3 }, { exerciseId: 'plank', sets: 2 }] },
      { ...EXO, name: 'Truc', pattern: 'x' },
    ])
    expect(items[1]?.kind).toBe('invalid')
    expect(items[0]).toMatchObject({ kind: 'sessionPlan', plan: { unknownExerciseIds: ['Truc'] } })
  })
  it('plusieurs sessionPlan : seul le dernier valide est applicable', () => {
    const a = { type: 'sessionPlan', durationMin: 20, blocks: [{ exerciseId: 'plank', sets: 2 }] }
    const b = { ...a, durationMin: 30 }
    const items = run([a, { type: 'sessionPlan', blocks: [] }, b])
    expect(items.map((i) => i.kind)).toEqual(['invalid', 'invalid', 'sessionPlan'])
    expect(items[0]).toMatchObject({ errors: [expect.stringContaining('seule la dernière')] })
    const withInvalidLast = run([a, { type: 'sessionPlan', blocks: [] }])
    expect(withInvalidLast.map((i) => i.kind)).toEqual(['sessionPlan', 'invalid'])
  })
})

describe('bornes et garde-fous (retours reviewer)', () => {
  const plan = (blocks: unknown[], extra: Partial<typeof ctx> & Record<string, unknown> = {}, durationMin = 45) =>
    run([{ type: 'sessionPlan', durationMin, blocks }], { ...ctx, ...extra } as typeof ctx)[0] as ImportPreviewItem
  const line = (i: number) => ({ exerciseId: i % 2 ? 'plank' : 'goblet-squat', sets: 2 })

  it('13 lignes ou plus de 30 séries : invalid', () => {
    expect(plan(Array.from({ length: 13 }, (_, i) => line(i))).kind).toBe('invalid')
    expect(plan(Array.from({ length: 8 }, () => ({ exerciseId: 'plank', sets: 4 }))).kind).toBe('invalid')
    expect(plan(Array.from({ length: 12 }, (_, i) => line(i))).kind).toBe('sessionPlan')
  })
  it('séance trop chargée pour la durée : avertissement', () => {
    const p = plan(Array.from({ length: 8 }, (_, i) => line(i)), {}, 20)
    if (p.kind !== 'sessionPlan') throw new Error()
    expect(p.warnings.join(' ')).toContain('séance chargée pour 20 min')
    const ok = plan([line(0), line(1), line(2)], {}, 20)
    if (ok.kind === 'sessionPlan') expect(ok.warnings.join(' ')).not.toContain('chargée')
  })
  it('charges ramenées dans la plage et au pas de la kettlebell', () => {
    const kb = { minKg: 12, maxKg: 24, stepKg: 2 }
    const p = plan([{ exerciseId: 'goblet-squat', sets: 3, loadKg: 30 }, { exerciseId: 'goblet-squat', sets: 3, loadKg: 7 }, { exerciseId: 'goblet-squat', sets: 3, loadKg: 17 }], { kettlebell: kb })
    if (p.kind !== 'sessionPlan') throw new Error()
    expect(p.plan.blocks.map((b) => b.loadKg)).toEqual([24, 12, 16])
    expect(p.warnings.join(' ')).toContain('ramenée à 24 kg')
    const noKb = plan([{ exerciseId: 'goblet-squat', sets: 3, loadKg: 200 }])
    if (noKb.kind === 'sessionPlan') expect(noKb.plan.blocks[0]?.loadKg).toBe(48)
  })
  it('planIssues : avertissement par ligne écartée', () => {
    const p = plan([{ exerciseId: 'goblet-squat', sets: 3 }, { exerciseId: 'plank', sets: 2 }], {
      planIssues: (blocks: { exerciseId: string }[]) => blocks.filter((b) => b.exerciseId === 'goblet-squat').map((b) => ({ exerciseId: b.exerciseId, message: 'niveau non atteint' })),
    })
    if (p.kind !== 'sessionPlan') throw new Error()
    expect(p.warnings).toContain('« Goblet squat » sera écartée de la séance : niveau non atteint')
  })
  it('préférence hidden dans la même réponse sur un exercice du plan : avertissement', () => {
    const items = run([
      { type: 'sessionPlan', durationMin: 30, blocks: [{ exerciseId: 'plank', sets: 2 }] },
      { type: 'exercisePreference', exerciseId: 'plank', preference: 'hidden' },
    ])
    expect(items[0]).toMatchObject({ kind: 'sessionPlan', warnings: [expect.stringContaining('masqué')] })
  })
  it('limites de texte : reason, exerciseId, group, unknownExerciseIds', () => {
    const pref = one({ type: 'exercisePreference', exerciseId: 'plank', preference: 'liked', reason: 'x'.repeat(300) })
    if (pref.kind !== 'exercisePreference') throw new Error()
    expect(pref.preference.reason).toHaveLength(200)
    expect(pref.warnings).toHaveLength(1)
    expect(one({ type: 'exercisePreference', exerciseId: 'x'.repeat(81), preference: 'liked' }).kind).toBe('invalid')
    expect(plan([{ exerciseId: 'x'.repeat(81), sets: 2 }]).kind).toBe('invalid')
    expect(plan([{ exerciseId: 'plank', sets: 2, group: 'g'.repeat(21) }]).kind).toBe('invalid')
    const many = plan([{ exerciseId: 'plank', sets: 2 }, ...Array.from({ length: 11 }, (_, i) => ({ exerciseId: `inconnu-${String(i)}`, sets: 1 }))])
    if (many.kind !== 'sessionPlan') throw new Error()
    expect(many.plan.unknownExerciseIds).toHaveLength(10)
  })
  it('superset de plus de 2 : découpé par groupes de 3 avec avertissement', () => {
    const p = plan([1, 2, 3, 4, 5, 6, 7].map((i) => ({ exerciseId: i % 2 ? 'plank' : 'goblet-squat', sets: 2, group: 7 })))
    if (p.kind !== 'sessionPlan') throw new Error()
    expect(p.plan.blocks.map((b) => [b.group, b.kind])).toEqual([[0, 'superset'], [0, 'superset'], [0, 'superset'], [1, 'superset'], [1, 'superset'], [1, 'superset'], [2, 'single']])
    expect(p.warnings.join(' ')).toContain('découpé')
  })
  it('doublons : deux exercise de même nom, nom déjà dans la bibliothèque', () => {
    const items = run([EXO, { ...EXO, name: 'hip thrust AU sol kb' }, { ...EXO, name: 'Planche', pattern: 'core', loadType: 'timed', repRange: undefined, durationRange: [20, 40], muscles: { primary: ['abdos'] } }])
    expect(items[1]).toMatchObject({ kind: 'exercise', warnings: expect.arrayContaining([expect.stringContaining('plusieurs fois')]) })
    expect(items[2]).toMatchObject({ kind: 'exercise', warnings: expect.arrayContaining([expect.stringContaining('le plan utilisera l’existant')]) })
  })
  it('aliments retirés : « développé » n’est plus un schéma', () => {
    expect(one({ ...EXO, pattern: 'développé' }).kind).toBe('invalid')
  })
  it('resolvePlanBlocks peut renvoyer []', () => {
    expect(resolvePlanBlocks({ durationMin: 20, unknownExerciseIds: [], blocks: [{ exerciseId: 'N', sets: 2, restSec: 60, newExerciseIndex: 3 }] }, new Map())).toEqual([])
  })
  it('newExerciseIssue : avertit sur l’exercice et sur les lignes du plan qui le citent', () => {
    const c = { ...ctx, newExerciseIssue: () => 'niveau non atteint' }
    const items = run([{ type: 'sessionPlan', durationMin: 20, blocks: [{ exerciseId: 'Hip thrust au sol KB', sets: 3 }] }, EXO], c)
    expect(items[1]).toMatchObject({ warnings: expect.arrayContaining([expect.stringContaining('ne serait pas proposé')]) })
    expect(items[0]).toMatchObject({ warnings: expect.arrayContaining(['« Hip thrust au sol KB » sera écartée de la séance : niveau non atteint']) })
  })
  it('masqué : le nom, pas l’id', () => {
    const items = run([
      { type: 'sessionPlan', durationMin: 30, blocks: [{ exerciseId: 'plank', sets: 2 }] },
      { type: 'exercisePreference', exerciseId: 'plank', preference: 'hidden' },
    ])
    expect(items[0]).toMatchObject({ warnings: expect.arrayContaining([expect.stringContaining('« Planche »')]) })
  })
})
