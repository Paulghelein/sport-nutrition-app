import { describe, expect, it } from 'vitest'
import type { Profile } from '../../types/profile'
import type { DayLog, FoodLogEntry, MealSlot, NutritionTargets, Recipe } from '../../types/nutrition'
import type { Session } from '../../types/training'
import type { WeeklyReview } from '../../types/progress'
import { makeEquipment, seedLibrary } from '../training/testkit'
import {
  buildJournalMessage,
  buildProgressMessage,
  buildRecipeMessage,
  buildReviewMessage,
  buildSessionAfterMessage,
  buildSessionBeforeMessage,
  DEFAULT_REQUESTS,
  type ClaudeBaseInput,
} from './context'

const T = '2026-10-16T08:00:00.000Z'
const profile: Profile = {
  id: 'me',
  name: 'Paul Secret',
  sex: 'male',
  birthDate: '2001-03-04',
  heightCm: 178,
  activityLevel: 'moderate',
  goal: 'bulk',
  level: 1,
  weeklySessionsTarget: 5,
  weeklySessionsMin: 3,
  nutrition: { surplus: 0.12, proteinPerKg: 1.8, fatShare: 0.27, kcalAdjustment: 0 },
  createdAt: T,
  updatedAt: T,
}
const targets: NutritionTargets = {
  kcal: 2851.4,
  protein: 130.2,
  carbs: 380,
  fat: 85,
  bmr: 1800,
  tdee: 2700,
  weightKg: 72.43,
  ageYears: 25,
}
const base: ClaudeBaseInput = { profile, equipment: makeEquipment(['mat']), targets, today: '2026-10-16' }
const SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']

const entry = (i: number, slot: MealSlot): FoodLogEntry => ({
  id: `uuid-secret-${String(i)}`,
  date: '2026-10-16',
  slot,
  name: `Aliment numéro ${String(i)} avec un nom assez long`,
  origin: { kind: 'free' },
  macros: { kcal: 123.456, protein: 10.04, carbs: 20.06, fat: 3.333 },
  createdAt: T,
})
const day = (perMeal: number): DayLog => {
  const meals = SLOTS.map((slot, s) => {
    const entries = Array.from({ length: perMeal }, (_, i) => entry(s * 100 + i, slot))
    const sum = (k: 'kcal' | 'protein' | 'carbs' | 'fat') => entries.reduce((a, e) => a + e.macros[k], 0)
    return {
      slot,
      entries,
      totals: { kcal: sum('kcal'), protein: sum('protein'), carbs: sum('carbs'), fat: sum('fat') },
    }
  })
  const sum = (k: 'kcal' | 'protein' | 'carbs' | 'fat') => meals.reduce((a, m) => a + m.totals[k], 0)
  return {
    date: '2026-10-16',
    meals,
    totals: { kcal: sum('kcal'), protein: sum('protein'), carbs: sum('carbs'), fat: sum('fat') },
  }
}

/** JSON du bloc de données du message. */
function dataOf(text: string): Record<string, unknown> {
  const m = /```json\n([\s\S]*?)\n```/.exec(text)
  if (!m) throw new Error('bloc json absent')
  return JSON.parse(m[1] ?? '') as Record<string, unknown>
}

describe('structure commune', () => {
  const msg = buildJournalMessage({ ...base, day: day(2), request: 'Que manger ce soir ?' })
  it('en-tête, profil, objectifs, données, demande, format', () => {
    expect(msg.kind).toBe('journal')
    expect(msg.text).toContain('Contexte envoyé par mon app Forge')
    expect(msg.text).toContain(
      'homme, 25 ans, 178 cm, 72,4 kg (moyenne 7 j), objectif prise de masse, niveau débutant, 5 séances/sem',
    )
    expect(msg.text).toContain('kettlebell réglable 12–24 kg (pas 1 kg), tapis')
    expect(msg.text).toContain('2851 kcal, protéines 130 g, glucides 380 g, lipides 85 g')
    expect(msg.text).toContain('Ma demande : Que manger ce soir ?')
    expect(msg.text).toContain('UN SEUL bloc ```json')
    expect(msg.text).toContain('Types utiles ici : meal, recipe.')
    expect(msg.text.indexOf('Données :')).toBeLessThan(msg.text.indexOf('Ma demande'))
    expect(msg.text.indexOf('Ma demande')).toBeLessThan(msg.text.indexOf('Format de réponse'))
  })
  it('aucune donnée d’identité ni id interne', () => {
    expect(msg.text).not.toContain('Paul')
    expect(msg.text).not.toContain('Secret')
    expect(msg.text).not.toContain('2001')
    expect(msg.text).not.toContain('uuid-secret')
  })
  it('demande vide ou blanche → demande par défaut', () => {
    for (const request of [undefined, '', '   \n']) {
      expect(
        buildJournalMessage({ ...base, day: day(1), ...(request === undefined ? {} : { request }) }).text,
      ).toContain(`Ma demande : ${DEFAULT_REQUESTS.journal}`)
    }
  })
})

describe('journal', () => {
  it('macros arrondies, totaux et reste', () => {
    const data = dataOf(buildJournalMessage({ ...base, day: day(1) }).text) as {
      repas: { repas: string; items: { nom: string; kcal: number; prot: number }[] }[]
      total: { kcal: number }
      objectif: { kcal: number }
      reste: { kcal: number }
    }
    expect(data.repas).toHaveLength(4)
    expect(data.repas[0]?.repas).toBe('petit-déjeuner')
    expect(data.repas[0]?.items[0]).toMatchObject({ kcal: 123, prot: 10 })
    expect(data.total.kcal).toBe(494)
    expect(data.objectif.kcal).toBe(2851)
    expect(data.reste.kcal).toBe(2358)
  })
  it('repas vides omis ; journal vide valide', () => {
    const empty: DayLog = {
      date: '2026-10-16',
      meals: SLOTS.map((slot) => ({ slot, entries: [], totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 } })),
      totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    }
    const data = dataOf(buildJournalMessage({ ...base, day: empty }).text) as { repas: unknown[] }
    expect(data.repas).toEqual([])
  })
  it('taille raisonnable pour un journal chargé (4 repas × 8 entrées)', () => {
    const text = buildJournalMessage({ ...base, day: day(8), request: 'x'.repeat(300) }).text
    expect(text.length).toBeLessThan(6000)
  })
})

describe('séance avant', () => {
  const library = seedLibrary({ plank: 'hidden' })
  const blocks: Session['blocks'] = [
    {
      id: 'b1',
      kind: 'single',
      exercises: [
        {
          exerciseId: 'goblet-squat',
          restSec: 90,
          sets: [1, 2, 3].map(() => ({ targetReps: [8, 12], loadKg: 16 })),
        },
      ],
    },
    {
      id: 'b2',
      kind: 'superset',
      exercises: [
        { exerciseId: 'incline-push-up', restSec: 20, sets: [1, 2].map(() => ({ targetReps: [10, 15] })) },
        { exerciseId: 'dead-hang', restSec: 60, sets: [1, 2].map(() => ({ targetDurationSec: 20 })) },
      ],
    },
  ]
  const msg = buildSessionBeforeMessage({
    ...base,
    plan: { durationMin: 30, estimatedMin: 31, deload: false, blocks },
    library,
  })
  it('blocs avec exerciseId, nom, séries, cible, charge, repos', () => {
    const data = dataOf(msg.text) as {
      seance: {
        dureeMin: number
        blocs: { bloc: number; type?: string; exercices: Record<string, unknown>[] }[]
      }
    }
    expect(data.seance.dureeMin).toBe(30)
    expect(data.seance.blocs[0]?.exercices[0]).toEqual({
      exerciseId: 'goblet-squat',
      nom: 'Goblet squat',
      series: 3,
      reps: [8, 12],
      chargeKg: 16,
      reposSec: 90,
    })
    expect(data.seance.blocs[1]?.type).toBe('superset')
    expect(data.seance.blocs[1]?.exercices[1]).toMatchObject({ series: 2, dureeSec: 20 })
  })
  it('liste d’exercices : niveau et matériel respectés, masqués exclus, exercices de la séance toujours présents', () => {
    const list = msg.text.slice(msg.text.indexOf('Exercices disponibles'), msg.text.indexOf('Ma demande'))
    expect(list).toContain('goblet-squat = Goblet squat (n2, KB)')
    expect(list).not.toContain(' plank =')
    for (const ex of library.filter((e) => e.level > 1 && e.id !== 'goblet-squat' && e.id !== 'dead-hang')) {
      expect(list.includes(` ${ex.id} =`) || list.includes(`: ${ex.id} =`)).toBe(false)
    }
  })
  it('rappel : types et règle de l’exerciseId', () => {
    expect(msg.text).toContain('Types utiles ici : sessionPlan, exercise, exercisePreference.')
    expect(msg.text).toContain('mets son nom comme exerciseId')
    expect(msg.text.length).toBeLessThan(6000)
  })
  it('niveau par schéma relevé → exercices de niveau supérieur proposés', () => {
    const levels = {
      hinge: 1,
      squat: 3,
      lunge: 1,
      push_h: 1,
      push_v: 1,
      pull: 1,
      core: 1,
      carry: 1,
      arms: 1,
      calves: 1,
    } as const
    const hi = buildSessionBeforeMessage({
      ...base,
      plan: { durationMin: 30, estimatedMin: 31, deload: false, blocks },
      library,
      patternLevels: levels,
    })
    expect(hi.text.length).toBeGreaterThan(msg.text.length)
  })
})

describe('séance après', () => {
  const session: Session = {
    id: 'sess-uuid',
    date: '2026-10-16',
    durationMin: 30,
    status: 'done',
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
              { status: 'done', actualReps: 12, loadKg: 16, feeling: 'ok' },
              { status: 'done', actualReps: 10, loadKg: 16, feeling: 'hard' },
              { status: 'skipped' },
            ],
          },
        ],
      },
    ],
    deload: false,
    estimatedMin: 30,
    notes: 'Bonne séance',
    updatedAt: T,
  }
  it('séries réelles, ressenti, records', () => {
    const msg = buildSessionAfterMessage({
      ...base,
      session,
      actualMin: 33,
      exercises: [{ id: 'goblet-squat', name: 'Goblet squat' }],
      records: [{ exerciseId: 'goblet-squat', kind: 'load', value: 16, previous: 14 }],
      request: 'Je monte la charge ?',
    })
    const data = dataOf(msg.text) as {
      seance: { dureeReelleMin: number; exercices: unknown[]; notes: string }
      records: unknown[]
    }
    expect(data.seance.dureeReelleMin).toBe(33)
    expect(data.seance.exercices[0]).toEqual({
      exerciseId: 'goblet-squat',
      nom: 'Goblet squat',
      series: ['12×16kg ok', '10×16kg dur'],
      passees: 1,
    })
    expect(data.records[0]).toEqual({
      exerciseId: 'goblet-squat',
      nom: 'Goblet squat',
      type: 'charge',
      valeur: 16,
      avant: 14,
    })
    expect(msg.text).not.toContain('sess-uuid')
    expect(msg.text).toContain('Types utiles ici : exercisePreference, exercise.')
  })
})

describe('recette', () => {
  const recipe: Recipe = {
    id: 'rid',
    name: 'Poulet riz',
    meal: ['lunch', 'dinner'],
    servings: 4,
    prepMinutes: 15,
    cookMinutes: 25,
    tags: [],
    ingredients: [
      { name: 'Poulet', grams: 600.4, aisle: 'butcher' },
      { name: 'Riz', grams: 320, aisle: 'grocery' },
    ],
    steps: ['Cuire le riz.'],
    source: 'user',
    updatedAt: T,
  }
  it('ingrédients et macros par portion', () => {
    const msg = buildRecipeMessage({
      ...base,
      recipe,
      nutrition: {
        ingredients: [],
        total: { kcal: 2400, protein: 160, carbs: 280, fat: 40 },
        perServing: { kcal: 600, protein: 40.04, carbs: 70, fat: 10.55 },
        missing: ['Riz'],
      },
    })
    const data = dataOf(msg.text) as { recette: Record<string, unknown> }
    expect(data.recette).toMatchObject({
      nom: 'Poulet riz',
      repas: ['déjeuner', 'dîner'],
      portions: 4,
      ingredients: [
        { nom: 'Poulet', g: 600 },
        { nom: 'Riz', g: 320 },
      ],
      parPortion: { kcal: 600, prot: 40, gluc: 70, lip: 10.6 },
      sansValeurs: ['Riz'],
    })
    expect(msg.text).not.toContain('rid"')
    expect(msg.text).toContain('Types utiles ici : recipe.')
  })
})

const nutritionWeek = {
  from: '2026-10-05',
  to: '2026-10-11',
  daysLogged: 5,
  avgKcal: 2710.6,
  avgProtein: 118.2,
  targetKcal: 2851,
  targetProtein: 130,
  daysInTarget: 3,
}

describe('progrès', () => {
  it('poids, régularité, volume, nutrition, records récents', () => {
    const msg = buildProgressMessage({
      ...base,
      weight: { avg7Kg: 72.43, avg7Kg28DaysAgo: 71.2, weighIns28d: 20 },
      regularity: {
        weeks: Array.from({ length: 12 }, (_, i) => ({
          weekStart: `2026-0${String(i < 7 ? 8 : 9)}-01`,
          sessions: i % 4,
          minutes: 60,
        })),
        currentStreak: 2,
        bestStreak: 5,
        totalMinutes: 700,
      },
      volume: [
        { group: 'chest', sets: 6.5, target: [8, 14], status: 'below' },
        { group: 'forearms', sets: 0, target: [0, 0], status: 'untracked' },
      ],
      nutritionWeek,
      strength: [
        {
          exerciseId: 'goblet-squat',
          points: [],
          lastPerformedOn: '2026-10-14',
          records: {
            load: { value: 16, date: '2026-10-14' },
            reps: { value: 12, date: '2026-08-01', loadKg: 14 },
          },
        },
      ],
      exercises: [{ id: 'goblet-squat', name: 'Goblet squat' }],
    })
    const data = dataOf(msg.text) as Record<string, unknown> & {
      regularite: { seancesParSemaine8: number[] }
      volume7j: unknown[]
      recordsRecents: unknown[]
    }
    expect(data.poids).toMatchObject({ moy7jKg: 72.4, variation28jKg: 1.2 })
    expect(data.regularite.seancesParSemaine8).toHaveLength(8)
    expect(data.volume7j).toEqual([{ groupe: 'pectoraux', series: 6.5, cible: [8, 14], statut: 'below' }])
    expect(data.nutritionSemaine).toMatchObject({ kcalMoy: 2711, joursDansLaCible: 3 })
    expect(data.recordsRecents).toEqual([
      { exerciseId: 'goblet-squat', nom: 'Goblet squat', type: 'charge', valeur: 16, date: '2026-10-14' },
    ])
  })
  it('pesées insuffisantes : null, pas d’exception', () => {
    const msg = buildProgressMessage({
      ...base,
      weight: { avg7Kg: null, avg7Kg28DaysAgo: null, weighIns28d: 0 },
      regularity: { weeks: [], currentStreak: 0, bestStreak: 0, totalMinutes: 0 },
      volume: [],
      nutritionWeek: { ...nutritionWeek, avgKcal: null, avgProtein: null, daysLogged: 0, daysInTarget: 0 },
      strength: [],
      exercises: [],
    })
    expect((dataOf(msg.text).poids as { variation28jKg: unknown }).variation28jKg).toBeNull()
  })
})

describe('bilan', () => {
  it('WeeklyReview résumé', () => {
    const review: WeeklyReview = {
      weekStart: '2026-10-05',
      sessions: 4,
      plannedSessions: 5,
      minutes: 130,
      records: [{ exerciseId: 'goblet-squat', kind: 'reps', value: 12, previous: 10, loadKg: 16 }],
      weightChangeKg: 0.34,
      nutrition: nutritionWeek,
      suggestion: { rule: 'low_protein', message: 'Ajoute une source de protéines.' },
    }
    const msg = buildReviewMessage({
      ...base,
      review,
      exercises: [{ id: 'goblet-squat', name: 'Goblet squat' }],
    })
    const data = dataOf(msg.text)
    expect(data).toMatchObject({
      seances: 4,
      seancesPrevues: 5,
      variationPoidsKg: 0.3,
      suggestionApp: 'Ajoute une source de protéines.',
    })
    expect((data.records as unknown[])[0]).toMatchObject({ type: 'répétitions', chargeKg: 16 })
    expect(msg.text).toContain(`Ma demande : ${DEFAULT_REQUESTS.review}`)
  })
})

describe('exercices perso et supprimés', () => {
  it('pas d’UUID envoyé : nom seul ; supprimé → « exercice supprimé »', () => {
    const uuid = '3f2b8c1e-aaaa-bbbb-cccc-1234567890ab'
    const msg = buildReviewMessage({
      ...base,
      review: {
        weekStart: '2026-10-05',
        sessions: 1,
        plannedSessions: 3,
        minutes: 30,
        weightChangeKg: null,
        nutrition: nutritionWeek,
        records: [
          { exerciseId: uuid, kind: 'load', value: 20, previous: 18 },
          { exerciseId: 'gone-id', kind: 'load', value: 20, previous: 18 },
        ],
        suggestion: { rule: 'all_good', message: 'ok' },
      },
      exercises: [{ id: uuid, name: 'Mon hip thrust', source: 'user' }],
    })
    expect(msg.text).not.toContain(uuid)
    expect(msg.text).not.toContain('gone-id')
    expect(msg.text).toContain('Mon hip thrust')
    expect(msg.text).toContain('exercice supprimé')
  })
})

describe('F3 : types de séries dans le contexte de séance', () => {
  const library = seedLibrary()
  it('avant : temps fixe (type + fenêtre, sans dureeSec) et dernière série AMRAP ; séries normales inchangées', () => {
    const blocks: Session['blocks'] = [
      {
        id: 'b1',
        kind: 'single',
        exercises: [
          {
            exerciseId: 'incline-push-up',
            restSec: 60,
            sets: [
              { targetReps: [8, 15] },
              { targetReps: [8, 15] },
              { targetReps: [8, 15], setType: 'amrap' },
            ],
          },
        ],
      },
      {
        id: 'b2',
        kind: 'finisher',
        exercises: [
          {
            exerciseId: 'two-hand-swing',
            restSec: 90,
            sets: [1, 2].map(() => ({ setType: 'timedMax' as const, targetDurationSec: 45, loadKg: 16 })),
          },
        ],
      },
    ]
    const msg = buildSessionBeforeMessage({
      ...base,
      plan: { durationMin: 60, estimatedMin: 60, deload: false, blocks },
      library,
    })
    const data = dataOf(msg.text) as { seance: { blocs: { exercices: Record<string, unknown>[] }[] } }
    expect(data.seance.blocs[0]?.exercices[0]).toEqual({
      exerciseId: 'incline-push-up',
      nom: 'Pompes inclinées',
      series: 3,
      reps: [8, 15],
      derniereSerie: 'amrap',
      reposSec: 60,
    })
    const swing = data.seance.blocs[1]?.exercices[0] ?? {}
    expect(swing).toMatchObject({ series: 2, type: 'tempsMax', fenetreSec: 45, chargeKg: 16 })
    expect(swing).not.toHaveProperty('dureeSec')
  })

  it('après : « amrap 22 », « 24×16kg en 45s », fenêtre du record', () => {
    const session: Session = {
      id: 's',
      date: '2026-10-16',
      durationMin: 60,
      status: 'done',
      warmup: [],
      blocks: [
        {
          id: 'b1',
          kind: 'single',
          exercises: [
            {
              exerciseId: 'incline-push-up',
              restSec: 60,
              sets: [
                { status: 'done', actualReps: 15, feeling: 'ok' },
                { setType: 'amrap', status: 'done', actualReps: 22, feeling: 'hard' },
              ],
            },
            {
              exerciseId: 'two-hand-swing',
              restSec: 90,
              sets: [
                {
                  setType: 'timedMax',
                  targetDurationSec: 45,
                  status: 'done',
                  actualReps: 24,
                  actualDurationSec: 45,
                  loadKg: 16,
                  feeling: 'ok',
                },
              ],
            },
          ],
        },
      ],
      deload: false,
      estimatedMin: 60,
      updatedAt: T,
    }
    const msg = buildSessionAfterMessage({
      ...base,
      session,
      exercises: [
        { id: 'incline-push-up', name: 'Pompes inclinées' },
        { id: 'two-hand-swing', name: 'Swing' },
      ],
      records: [
        { exerciseId: 'two-hand-swing', kind: 'reps', value: 24, previous: 22, loadKg: 16, windowSec: 45 },
      ],
    })
    const data = dataOf(msg.text) as {
      seance: { exercices: { series: string[] }[] }
      records: Record<string, unknown>[]
    }
    expect(data.seance.exercices[0]?.series).toEqual(['15 ok', 'amrap 22 dur'])
    expect(data.seance.exercices[1]?.series).toEqual(['24×16kg en 45s ok'])
    expect(data.records[0]).toMatchObject({ valeur: 24, chargeKg: 16, fenetreSec: 45 })
  })
})
