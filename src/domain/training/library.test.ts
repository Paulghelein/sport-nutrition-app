import { describe, expect, it } from 'vitest'
import type { Equipment } from '../../types/profile'
import type { Exercise, ExercisePref, LibraryExercise } from '../../types/training'
import {
  PATTERN_ORDER,
  defaultLoadStep,
  deletedSeedExercises,
  emptyExerciseInput,
  filterLibrary,
  groupByPattern,
  isAvailable,
  mergeLibrary,
  missingEquipment,
  normalizeSearch,
  sortLibrary,
  toExerciseInput,
  variantsOf,
} from './library'

const T = '2026-10-15T08:00:00.000Z'

const ex = (over: Partial<Exercise> & Pick<Exercise, 'id'>): Exercise => ({
  name: over.id,
  pattern: 'squat',
  level: 1,
  muscles: { primary: ['quads'], secondary: ['glutes'] },
  equipment: ['kettlebell'],
  loadType: 'kettlebell',
  repRange: [8, 12],
  restSec: 90,
  compound: true,
  unilateral: false,
  loadStepKg: 2,
  progressionCriteria: '3 × 12',
  technique: { setup: 's', steps: ['a'], cues: ['c'], mistakes: ['m'] },
  source: 'seed',
  updatedAt: T,
  ...over,
})

const pref = (exerciseId: string, preference: ExercisePref['preference']): ExercisePref => ({
  exerciseId,
  preference,
  updatedAt: T,
})

const equipment = (owned: Equipment['owned'] = ['mat']): Equipment => ({
  id: 'me',
  kettlebell: { minKg: 12, maxKg: 24, stepKg: 1 },
  owned,
  updatedAt: T,
})

const lib = (e: Exercise, over: Partial<LibraryExercise> = {}): LibraryExercise => ({
  ...e,
  overridden: false,
  preference: 'neutral',
  ...over,
})

const SEEDS: Exercise[] = [
  ex({ id: 'goblet-squat', name: 'Goblet squat', pattern: 'squat', level: 2 }),
  ex({ id: 'bw-squat', name: 'Squat poids du corps', pattern: 'squat', level: 1 }),
  ex({ id: 'kb-deadlift', name: 'Soulevé de terre KB', pattern: 'hinge', level: 1 }),
  ex({
    id: 'press',
    name: 'Développé 1 bras debout',
    pattern: 'push_v',
    level: 2,
    loadStepKg: 1,
  }),
  ex({
    id: 'pullup-neg',
    name: 'Tractions négatives',
    pattern: 'pull',
    level: 2,
    equipment: ['pullup_bar'],
    loadType: 'bodyweight',
  }),
  ex({
    id: 'plank',
    name: 'Planche',
    pattern: 'core',
    level: 1,
    equipment: ['mat'],
    loadType: 'timed',
    repRange: undefined,
    durationRange: [20, 45],
  }),
]

describe('PATTERN_ORDER', () => {
  it("suit l'ordre du tableau SPEC §3.1 et couvre les 10 schémas", () => {
    expect(PATTERN_ORDER).toEqual([
      'hinge',
      'squat',
      'lunge',
      'push_h',
      'push_v',
      'pull',
      'core',
      'carry',
      'arms',
      'calves',
    ])
  })
})

describe('mergeLibrary', () => {
  it('sans ligne en base : tous les seeds, non surchargés, préférence neutral', () => {
    const out = mergeLibrary(SEEDS, [], [])
    expect(out).toHaveLength(SEEDS.length)
    expect(out.every((e) => !e.overridden && e.preference === 'neutral')).toBe(true)
  })

  it("une surcharge remplace l'original et est marquée overridden", () => {
    const override = ex({
      id: 'goblet-squat',
      name: 'Goblet squat modifié',
      pattern: 'squat',
      level: 2,
      restSec: 120,
    })
    const out = mergeLibrary(SEEDS, [override], [])
    const g = out.filter((e) => e.id === 'goblet-squat')
    expect(g).toHaveLength(1)
    expect(g[0]?.name).toBe('Goblet squat modifié')
    expect(g[0]?.restSec).toBe(120)
    expect(g[0]?.overridden).toBe(true)
    expect(out).toHaveLength(SEEDS.length)
  })

  it('une surcharge deleted fait disparaître l’exercice', () => {
    const out = mergeLibrary(SEEDS, [ex({ id: 'plank', deleted: true })], [])
    expect(out.find((e) => e.id === 'plank')).toBeUndefined()
    expect(out).toHaveLength(SEEDS.length - 1)
  })

  it('une surcharge orpheline (id inconnu des seeds) est ignorée', () => {
    const out = mergeLibrary(SEEDS, [ex({ id: 'removed-from-content', name: 'Orpheline' })], [])
    expect(out.find((e) => e.id === 'removed-from-content')).toBeUndefined()
    expect(out).toHaveLength(SEEDS.length)
  })

  it('les exercices user sont ajoutés, non surchargés', () => {
    const user = ex({ id: 'uuid-1', name: 'Mon squat', source: 'user' })
    const out = mergeLibrary(SEEDS, [user], [])
    const u = out.find((e) => e.id === 'uuid-1')
    expect(u?.source).toBe('user')
    expect(u?.overridden).toBe(false)
    expect(out).toHaveLength(SEEDS.length + 1)
  })

  it('un exercice user deleted est ignoré', () => {
    const out = mergeLibrary(SEEDS, [ex({ id: 'uuid-2', source: 'user', deleted: true })], [])
    expect(out.find((e) => e.id === 'uuid-2')).toBeUndefined()
  })

  it("un exercice user dont l'id collisionne avec un seed est ignoré (pas de doublon)", () => {
    const out = mergeLibrary(SEEDS, [ex({ id: 'plank', name: 'Intrus', source: 'user' })], [])
    expect(out.filter((e) => e.id === 'plank')).toHaveLength(1)
    expect(out.find((e) => e.id === 'plank')?.name).toBe('Planche')
  })

  it('applique les préférences par exerciseId (seed, surcharge, user), défaut neutral', () => {
    const user = ex({ id: 'uuid-3', source: 'user' })
    const override = ex({ id: 'goblet-squat', name: 'Goblet squat', level: 2 })
    const out = mergeLibrary(
      SEEDS,
      [user, override],
      [
        pref('plank', 'hidden'),
        pref('goblet-squat', 'liked'),
        pref('uuid-3', 'disliked'),
        pref('unknown', 'liked'),
      ],
    )
    const p = (id: string) => out.find((e) => e.id === id)?.preference
    expect(p('plank')).toBe('hidden')
    expect(p('goblet-squat')).toBe('liked')
    expect(p('uuid-3')).toBe('disliked')
    expect(p('bw-squat')).toBe('neutral')
  })

  it('renvoie la liste triée par sortLibrary', () => {
    const out = mergeLibrary(SEEDS, [], [])
    expect(out.map((e) => e.id)).toEqual(sortLibrary(out).map((e) => e.id))
    expect(out[0]?.id).toBe('kb-deadlift')
  })

  it('ne modifie pas les entrées', () => {
    const seeds = structuredClone(SEEDS)
    mergeLibrary(seeds, [ex({ id: 'plank', deleted: true })], [pref('bw-squat', 'liked')])
    expect(seeds).toEqual(SEEDS)
  })
})

describe('deletedSeedExercises', () => {
  it("renvoie l'original des seeds masqués, pas la surcharge", () => {
    const rows = [
      ex({ id: 'plank', name: 'Planche modifiée', deleted: true }),
      ex({ id: 'goblet-squat', name: 'Surcharge non supprimée' }),
      ex({ id: 'ghost', deleted: true }),
      ex({ id: 'uuid', source: 'user', deleted: true }),
    ]
    const out = deletedSeedExercises(SEEDS, rows)
    expect(out).toHaveLength(1)
    expect(out[0]?.name).toBe('Planche')
  })

  it('vide sans suppression', () => {
    expect(deletedSeedExercises(SEEDS, [])).toEqual([])
  })
})

describe('sortLibrary', () => {
  it('trie par schéma (PATTERN_ORDER), puis niveau, puis nom', () => {
    const list = [
      ex({ id: 'c', name: 'Mollets', pattern: 'calves' }),
      ex({ id: 'b2', name: 'Zeta', pattern: 'squat', level: 1 }),
      ex({ id: 'b1', name: 'Alpha', pattern: 'squat', level: 2 }),
      ex({ id: 'b0', name: 'Beta', pattern: 'squat', level: 1 }),
      ex({ id: 'a', name: 'Swing', pattern: 'hinge', level: 3 }),
    ]
    expect(sortLibrary(list).map((e) => e.id)).toEqual(['a', 'b0', 'b2', 'b1', 'c'])
  })

  it('compare les noms à la française (accents, casse)', () => {
    const list = [
      ex({ id: '1', name: 'Fente' }),
      ex({ id: '2', name: 'élévation' }),
      ex({ id: '3', name: 'Extension' }),
      ex({ id: '4', name: 'Développé' }),
    ]
    expect(sortLibrary(list).map((e) => e.name)).toEqual(['Développé', 'élévation', 'Extension', 'Fente'])
  })

  it("tri stable et déterministe : à égalité, départage par id quel que soit l'ordre d'entrée", () => {
    const a = ex({ id: 'x-a', name: 'Même nom' })
    const b = ex({ id: 'x-b', name: 'Même nom' })
    expect(sortLibrary([b, a]).map((e) => e.id)).toEqual(['x-a', 'x-b'])
    expect(sortLibrary([a, b]).map((e) => e.id)).toEqual(['x-a', 'x-b'])
  })

  it("ne modifie pas le tableau d'entrée", () => {
    const list = [ex({ id: 'z', pattern: 'calves' }), ex({ id: 'a', pattern: 'hinge' })]
    sortLibrary(list)
    expect(list.map((e) => e.id)).toEqual(['z', 'a'])
  })
})

describe('isAvailable', () => {
  it('kettlebell toujours possédée', () => {
    expect(isAvailable(ex({ id: 'k', equipment: ['kettlebell'] }), equipment([]))).toBe(true)
  })

  it('sans matériel requis : disponible', () => {
    expect(isAvailable(ex({ id: 'n', equipment: [] }), equipment([]))).toBe(true)
  })

  it('matériel manquant : indisponible', () => {
    expect(isAvailable(ex({ id: 'p', equipment: ['pullup_bar'] }), equipment(['mat']))).toBe(false)
  })

  it('tout le matériel requis doit être possédé', () => {
    const e = ex({ id: 'r', equipment: ['kettlebell', 'bench', 'mat'] })
    expect(isAvailable(e, equipment(['mat']))).toBe(false)
    expect(isAvailable(e, equipment(['mat', 'bench']))).toBe(true)
  })
})

describe('missingEquipment', () => {
  it('kettlebell jamais manquante', () => {
    expect(missingEquipment(ex({ id: 'k', equipment: ['kettlebell'] }), equipment([]))).toEqual([])
  })

  it('sans matériel requis : rien ne manque', () => {
    expect(missingEquipment(ex({ id: 'n', equipment: [] }), equipment([]))).toEqual([])
  })

  it("liste le matériel non possédé dans l'ordre de ex.equipment", () => {
    const e = ex({ id: 'r', equipment: ['table', 'kettlebell', 'mat', 'bench', 'pullup_bar'] })
    expect(missingEquipment(e, equipment(['mat']))).toEqual(['table', 'bench', 'pullup_bar'])
  })

  it('sans doublon', () => {
    const e = ex({ id: 'd', equipment: ['bench', 'bands', 'bench', 'kettlebell', 'kettlebell'] })
    expect(missingEquipment(e, equipment([]))).toEqual(['bench', 'bands'])
  })

  it('tout possédé : vide, et cohérent avec isAvailable', () => {
    const e = ex({ id: 'o', equipment: ['kettlebell', 'bench', 'mat'] })
    expect(missingEquipment(e, equipment(['mat', 'bench']))).toEqual([])
    expect(isAvailable(e, equipment(['mat', 'bench']))).toBe(true)
    expect(isAvailable(e, equipment(['mat']))).toBe(false)
  })
})

describe('normalizeSearch', () => {
  it('retire accents et casse', () => {
    expect(normalizeSearch('  DÉVELOPPÉ   Épaulé ')).toBe('developpe epaule')
  })

  it('développe les ligatures et remplace la ponctuation par des espaces', () => {
    expect(normalizeSearch('Œuf')).toBe('oeuf')
    expect(normalizeSearch("Pike push-up (l'avancé)")).toBe('pike push up l avance')
  })
})

describe('filterLibrary', () => {
  const list = mergeLibrary(SEEDS, [], [pref('goblet-squat', 'hidden')])
  const eq = equipment(['mat'])

  it('filtre vide : tout sauf hidden', () => {
    const out = filterLibrary(list, {}, eq)
    expect(out).toHaveLength(SEEDS.length - 1)
    expect(out.find((e) => e.id === 'goblet-squat')).toBeUndefined()
  })

  it('includeHidden réintègre les exercices masqués', () => {
    expect(filterLibrary(list, { includeHidden: true }, eq)).toHaveLength(SEEDS.length)
  })

  it('recherche insensible aux accents : « developpe » trouve « Développé »', () => {
    expect(filterLibrary(list, { query: 'developpe' }, eq).map((e) => e.id)).toEqual(['press'])
    expect(filterLibrary(list, { query: 'DÉVELOPPÉ' }, eq).map((e) => e.id)).toEqual(['press'])
  })

  it('recherche multi-mots : tous les mots présents, ordre libre', () => {
    expect(filterLibrary(list, { query: 'debout bras' }, eq).map((e) => e.id)).toEqual(['press'])
    expect(filterLibrary(list, { query: 'debout assis' }, eq)).toEqual([])
  })

  it('requête faite seulement d’espaces = pas de filtre texte', () => {
    expect(filterLibrary(list, { query: '   ' }, eq)).toHaveLength(SEEDS.length - 1)
  })

  it('filtre par schéma et par niveau', () => {
    expect(filterLibrary(list, { pattern: 'squat', includeHidden: true }, eq).map((e) => e.id)).toEqual([
      'bw-squat',
      'goblet-squat',
    ])
    expect(filterLibrary(list, { level: 2 }, eq).map((e) => e.id)).toEqual(['press', 'pullup-neg'])
  })

  it('availableOnly exclut le matériel manquant', () => {
    const out = filterLibrary(list, { availableOnly: true }, eq)
    expect(out.find((e) => e.id === 'pullup-neg')).toBeUndefined()
    expect(out.find((e) => e.id === 'plank')).toBeDefined()
    const withBar = filterLibrary(list, { availableOnly: true }, equipment(['mat', 'pullup_bar']))
    expect(withBar.find((e) => e.id === 'pullup-neg')).toBeDefined()
  })

  it('combine tous les critères', () => {
    expect(
      filterLibrary(list, { query: 'squat', level: 1, pattern: 'squat', availableOnly: true }, eq).map(
        (e) => e.id,
      ),
    ).toEqual(['bw-squat'])
  })
})

describe('groupByPattern', () => {
  it('groupes dans PATTERN_ORDER, groupes vides omis, ordre interne conservé', () => {
    const groups = groupByPattern(mergeLibrary(SEEDS, [], []))
    expect(groups.map((g) => g.pattern)).toEqual(['hinge', 'squat', 'push_v', 'pull', 'core'])
    expect(groups[1]?.exercises.map((e) => e.id)).toEqual(['bw-squat', 'goblet-squat'])
  })

  it('liste vide -> aucun groupe', () => {
    expect(groupByPattern([])).toEqual([])
  })
})

describe('variantsOf', () => {
  const goblet = lib(ex({ id: 's2', name: 'Goblet squat', pattern: 'squat', level: 2 }))
  const swing = lib(ex({ id: 'h', name: 'Swing', pattern: 'hinge', level: 2 }))
  const list = [
    lib(ex({ id: 's3', name: 'Front squat', pattern: 'squat', level: 3 })),
    goblet,
    lib(ex({ id: 's1b', name: 'Squat PDC', pattern: 'squat', level: 1 })),
    lib(ex({ id: 's1a', name: 'Goblet sur boîte', pattern: 'squat', level: 1 })),
    lib(ex({ id: 'sh', name: 'Squat masqué', pattern: 'squat', level: 2 }), { preference: 'hidden' }),
    swing,
  ]

  it('autres exercices du même schéma, triés par niveau puis nom, sans lui-même ni hidden', () => {
    expect(variantsOf(list, goblet).map((e) => e.id)).toEqual(['s1a', 's1b', 's3'])
  })

  it('includeHidden inclut les masqués', () => {
    expect(variantsOf(list, goblet, { includeHidden: true }).map((e) => e.id)).toEqual([
      's1a',
      's1b',
      'sh',
      's3',
    ])
  })

  it('aucune variante -> liste vide', () => {
    expect(variantsOf(list, swing)).toEqual([])
  })
})

describe('toExerciseInput', () => {
  it('retire id, source, deleted, updatedAt', () => {
    const input = toExerciseInput(ex({ id: 'x', deleted: true, videoUrl: 'https://v' }))
    expect(input).not.toHaveProperty('id')
    expect(input).not.toHaveProperty('source')
    expect(input).not.toHaveProperty('deleted')
    expect(input).not.toHaveProperty('updatedAt')
    expect(input.videoUrl).toBe('https://v')
    expect(input.name).toBe('x')
  })

  it('retire aussi overridden et preference d’un LibraryExercise', () => {
    const input = toExerciseInput(lib(ex({ id: 'y' }), { overridden: true, preference: 'liked' }))
    expect(input).not.toHaveProperty('overridden')
    expect(input).not.toHaveProperty('preference')
    expect(Object.keys(input).sort()).toEqual(Object.keys(emptyExerciseInput()).sort())
  })

  it('ne crée pas de clé pour un champ optionnel absent', () => {
    const input = toExerciseInput(ex({ id: 'z' }))
    expect(input).not.toHaveProperty('durationRange')
    expect(input).not.toHaveProperty('illustration')
  })
})

describe('defaultLoadStep et emptyExerciseInput', () => {
  it('2 kg pour hinge/squat/lunge, 1 kg sinon', () => {
    expect(PATTERN_ORDER.filter((p) => defaultLoadStep(p) === 2)).toEqual(['hinge', 'squat', 'lunge'])
    expect(defaultLoadStep('push_h')).toBe(1)
    expect(defaultLoadStep('calves')).toBe(1)
  })

  it('valeurs par défaut sensées', () => {
    const e = emptyExerciseInput()
    expect(e).toMatchObject({
      name: '',
      pattern: 'hinge',
      level: 1,
      loadType: 'kettlebell',
      equipment: ['kettlebell'],
      repRange: [8, 12],
      restSec: 90,
      loadStepKg: 2,
      unilateral: false,
      muscles: { primary: [], secondary: [] },
      technique: { setup: '', steps: [], cues: [], mistakes: [] },
    })
    expect(e.durationRange).toBeUndefined()
  })

  it('le palier et le caractère polyarticulaire suivent le schéma', () => {
    expect(emptyExerciseInput('arms')).toMatchObject({ pattern: 'arms', loadStepKg: 1, compound: false })
    expect(emptyExerciseInput('lunge')).toMatchObject({ loadStepKg: 2, compound: true })
    expect(emptyExerciseInput('pull')).toMatchObject({ loadStepKg: 1, compound: true })
  })

  it('renvoie des objets indépendants (pas de tableaux partagés)', () => {
    const a = emptyExerciseInput()
    a.muscles.primary.push('quads')
    a.equipment.push('mat')
    expect(emptyExerciseInput().muscles.primary).toEqual([])
    expect(emptyExerciseInput().equipment).toEqual(['kettlebell'])
  })
})
