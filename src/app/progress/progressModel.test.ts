import { describe, expect, it } from 'vitest'
import { seedExercises } from '../../content'
import { defaultEquipment, defaultSettings } from '../../db/defaults'
import type { ProgressData } from '../../db'
import type { Exercise, ExerciseStrength, FoodLogEntry, Profile, Session, WeighIn } from '../../types'
import {
  CORRIDOR_WINDOW_DAYS,
  backupMessage,
  buildExercisesById,
  buildProgressModel,
  buildWeightModel,
  corridorStart,
  lastMetricValue,
  metricValue,
  personalRecordText,
  recordLines,
  strengthChartData,
  strengthMetric,
} from './progressModel'

const T0 = '2026-10-15T08:00:00.000Z'
// Vendredi 16 octobre 2026 ; semaine écoulée = lundi 5 → dimanche 11 octobre.
const NOW = new Date(2026, 9, 16, 12, 0, 0)

const profile: Profile = {
  id: 'me',
  sex: 'male',
  birthDate: '1998-05-12',
  heightCm: 178,
  activityLevel: 'moderate',
  goal: 'bulk',
  level: 1,
  weeklySessionsTarget: 3,
  weeklySessionsMin: 2,
  nutrition: { surplus: 0.12, proteinPerKg: 1.8, fatShare: 0.27, kcalAdjustment: 0 },
  createdAt: '2026-09-01T08:00:00.000Z',
  updatedAt: T0,
} as unknown as Profile

const squat = seedExercises.find((e) => e.id === 'goblet-squat') as Exercise

function session(id: string, date: string, exerciseId: string, loadKg: number, reps: number): Session {
  return {
    id,
    date,
    durationMin: 30,
    status: 'done',
    warmup: [],
    blocks: [
      {
        kind: 'single',
        exercises: [{ exerciseId, restSec: 60, sets: [{ loadKg, actualReps: reps, status: 'done' }] }],
      },
    ],
    deload: false,
    estimatedMin: 30,
    updatedAt: T0,
  } as unknown as Session
}

function data(over: Partial<ProgressData> = {}): ProgressData {
  return {
    profile,
    settings: defaultSettings(T0),
    weighIns: [],
    measurements: [],
    sessions: [],
    states: [],
    exerciseRows: [],
    prefs: [],
    foodLog: [],
    ...over,
  }
}

const build = (d: ProgressData) =>
  buildProgressModel({ data: d, equipment: defaultEquipment(T0), seeds: seedExercises, now: NOW })

describe('buildExercisesById', () => {
  it('garde les exercices supprimés (surcharge et perso)', () => {
    const deletedSeed = { ...squat, name: 'Squat perso', deleted: true } as Exercise
    const custom = {
      ...squat,
      id: 'custom-1',
      name: 'Mon exercice',
      source: 'user',
      deleted: true,
    } as Exercise
    const map = buildExercisesById(seedExercises, [deletedSeed, custom])
    expect(map.get('goblet-squat')?.name).toBe('Squat perso')
    expect(map.get('custom-1')?.name).toBe('Mon exercice')
    expect(map.get('two-hand-swing')).toBeDefined()
  })
})

describe('buildProgressModel', () => {
  it('renvoie null sans profil', () => {
    expect(build(data({ profile: undefined }))).toBeNull()
  })

  it('carte du lundi : visible tant que la semaine écoulée n’est pas fermée', () => {
    expect(build(data())?.review?.weekStart).toBe('2026-10-05')
    const closed = data({ settings: { ...defaultSettings(T0), reviewDismissedWeek: '2026-10-05' } })
    expect(build(closed)?.review).toBeNull()
    const old = data({ settings: { ...defaultSettings(T0), reviewDismissedWeek: '2026-09-28' } })
    expect(build(old)?.review?.weekStart).toBe('2026-10-05')
  })

  it('carte du lundi masquée si le profil a été créé après la semaine évaluée', () => {
    const fresh = { ...profile, createdAt: new Date(2026, 9, 14, 9).toISOString() }
    expect(build(data({ profile: fresh }))?.review).toBeNull()
    const sameWeek = { ...profile, createdAt: new Date(2026, 9, 11, 20).toISOString() }
    expect(build(data({ profile: sameWeek }))?.review).not.toBeNull()
  })

  it('bilan : séances, minutes, records et nom d’un exercice supprimé', () => {
    const sessions = [
      session('a', '2026-10-01', 'goblet-squat', 12, 10),
      session('b', '2026-10-06', 'goblet-squat', 16, 10),
    ]
    const deleted = { ...squat, source: 'seed', deleted: true } as Exercise
    const m = build(data({ sessions, exerciseRows: [deleted] }))
    expect(m?.review?.sessions).toBe(1)
    expect(m?.review?.minutes).toBe(30)
    expect(m?.review?.plannedSessions).toBe(3)
    expect(m?.review?.records.some((r) => r.exerciseId === 'goblet-squat' && r.kind === 'load')).toBe(true)
    expect(m?.nameOf('goblet-squat')).toBe(squat.name)
    expect(m?.nameOf('inconnu')).toBe('Exercice supprimé')
    expect(m?.strength[0]?.name).toBe(squat.name)
  })

  it('rappel de sauvegarde : jamais, dû, récent', () => {
    expect(build(data())?.backup?.status).toBe('never')
    const due = data({ settings: { ...defaultSettings(T0), lastExportAt: '2026-10-01T10:00:00.000Z' } })
    expect(build(due)?.backup).toEqual({ status: 'due', daysSince: 15 })
    const ok = data({ settings: { ...defaultSettings(T0), lastExportAt: '2026-10-14T10:00:00.000Z' } })
    expect(build(ok)?.backup).toBeNull()
  })

  it('régularité : seuil = min(3, séances minimum du profil)', () => {
    expect(build(data())?.regularityTarget).toBe(2)
    expect(build(data({ profile: { ...profile, weeklySessionsMin: 5 } }))?.regularityTarget).toBe(3)
    expect(build(data())?.regularity.weeks).toHaveLength(12)
  })

  it('nutrition de la semaine en cours (lundi → hier) et objectifs depuis le poids', () => {
    const w: WeighIn = { id: 'w', date: '2026-10-15', weightKg: 75, createdAt: T0 } as WeighIn
    const entry = (date: string, kcal: number): FoodLogEntry =>
      ({
        id: `e${date}`,
        date,
        slot: 'lunch',
        name: 'x',
        origin: { kind: 'free' },
        macros: { kcal, protein: 100, carbs: 0, fat: 0 },
        createdAt: T0,
      }) as unknown as FoodLogEntry
    const m = build(data({ weighIns: [w], foodLog: [entry('2026-10-12', 3000), entry('2026-10-05', 1000)] }))
    expect(m?.nutrition.from).toBe('2026-10-12')
    expect(m?.nutrition.daysLogged).toBe(1)
    expect(m?.hasNutritionTargets).toBe(true)
    expect(m?.nutrition.targetKcal).toBeGreaterThan(2500)
    expect(build(data())?.hasNutritionTargets).toBe(false)
  })

  it('niveau par schéma : 10 schémas, niveau du profil par défaut', () => {
    const m = build(data())
    expect(m?.patterns).toHaveLength(10)
    expect(m?.patterns.every((p) => p.level === 1)).toBe(true)
  })

  it('volume : 13 groupes sur 7 jours', () => {
    const m = build(data({ sessions: [session('a', '2026-10-14', 'goblet-squat', 12, 10)] }))
    expect(m?.volumes).toHaveLength(13)
    expect(m?.volumes.find((v) => v.group === 'quads')?.sets).toBeGreaterThan(0)
  })
})

describe('corridorStart', () => {
  const w = (date: string, weightKg: number): WeighIn =>
    ({ id: date, date, weightKg, createdAt: T0 }) as WeighIn
  it('ancré sur le lundi de la semaine de début de fenêtre, poids = moyenne des 7 jours suivants', () => {
    // today 2026-10-20 → fenêtre 2026-08-25 (mardi) → lundi 2026-08-24
    const rows = [w('2026-08-23', 60), w('2026-08-26', 74), w('2026-08-28', 75), w('2026-10-20', 80)]
    expect(corridorStart(rows, '2026-10-20')).toEqual({ date: '2026-08-26', weightKg: 74.5 })
  })
  it('stable dans la semaine : même départ tous les jours de la semaine', () => {
    const rows = [w('2026-08-24', 74), w('2026-09-01', 75), w('2026-10-20', 80)]
    const a = corridorStart(rows, '2026-10-19')
    const b = corridorStart(rows, '2026-10-22')
    expect(a).toEqual(b)
  })
  it('repart du dernier ajustement kcal s’il est plus récent', () => {
    const rows = [w('2026-08-24', 74), w('2026-10-10', 76), w('2026-10-12', 77)]
    expect(corridorStart(rows, '2026-10-16', '2026-10-09')).toEqual({ date: '2026-10-10', weightKg: 76.5 })
  })
  it('null sans pesée', () => {
    expect(corridorStart([], '2026-10-16')).toBeNull()
    expect(CORRIDOR_WINDOW_DAYS).toBe(56)
  })
})

describe('buildWeightModel', () => {
  const w = (date: string, weightKg: number): WeighIn =>
    ({ id: date, date, weightKg, createdAt: T0 }) as WeighIn
  const rows = [w('2026-10-01', 72), w('2026-10-08', 72.5), w('2026-10-15', 73)]
  it('données du graphe, historique récent d’abord, couloir en prise de masse', () => {
    const m = buildWeightModel(rows, '2026-10-16', true)
    expect(m.firstDate).toBe('2026-10-01')
    expect(m.chart.map((p) => p.day)).toEqual([0, 7, 14])
    expect(m.chart[2]?.low).toBeDefined()
    expect(m.recent[0]?.date).toBe('2026-10-15')
    expect(m.summary.latest?.weightKg).toBe(73)
    expect(m.corridor).not.toBeNull()
  })
  it('pas de couloir hors prise de masse ni avec moins de 2 points', () => {
    expect(buildWeightModel(rows, '2026-10-16', false).corridor).toBeNull()
    expect(buildWeightModel(rows, '2026-10-16', false).chart[0]?.low).toBeUndefined()
    expect(buildWeightModel([w('2026-10-15', 73)], '2026-10-16', true).corridor).toBeNull()
  })
  it('sans pesée', () => {
    const m = buildWeightModel([], '2026-10-16', true)
    expect(m.firstDate).toBeNull()
    expect(m.chart).toEqual([])
  })
})

describe('force', () => {
  const base = { exerciseId: 'x', lastPerformedOn: '2026-10-10' }
  const strength = (
    points: ExerciseStrength['points'],
    records: ExerciseStrength['records'] = {},
  ): ExerciseStrength => ({
    ...base,
    points,
    records,
  })
  it('choisit charge, sinon durée, sinon répétitions', () => {
    const p = { date: '2026-10-01', sessionId: 's', tonnageKg: 0 }
    expect(strengthMetric(strength([{ ...p, topLoadKg: 12, bestReps: 8 }]))).toBe('load')
    expect(strengthMetric(strength([{ ...p, bestDurationSec: 30 }]))).toBe('duration')
    expect(strengthMetric(strength([{ ...p, bestReps: 15 }]))).toBe('reps')
  })
  it('série de la courbe', () => {
    const s = strength([
      { date: '2026-10-01', sessionId: 'a', tonnageKg: 0, topLoadKg: 12, bestReps: 8 },
      { date: '2026-10-08', sessionId: 'b', tonnageKg: 0, topLoadKg: 14, bestReps: 8 },
    ])
    expect(strengthChartData(s)).toEqual([
      { date: '2026-10-01', day: 0, value: 12 },
      { date: '2026-10-08', day: 7, value: 14 },
    ])
    expect(strengthChartData(s, 'reps').map((p) => p.value)).toEqual([8, 8])
  })
  it('dernière valeur connue et valeur d’un point', () => {
    const s = strength([
      { date: '2026-10-01', sessionId: 'a', tonnageKg: 0, topLoadKg: 12 },
      { date: '2026-10-08', sessionId: 'b', tonnageKg: 0, bestReps: 8 },
    ])
    expect(metricValue(s.points[1] as never, 'load')).toBeUndefined()
    expect(lastMetricValue(s, 'load')).toBe(12)
  })
  it('lignes de records en français', () => {
    const s = strength([], {
      load: { value: 14, date: '2026-10-08' },
      reps: { value: 10, date: '2026-10-08', loadKg: 12.5 },
    })
    expect(recordLines(s).map((l) => l.text)).toEqual(['14 kg', '10 à 12,5 kg'])
    expect(personalRecordText('load', 14)).toBe('charge max 14 kg')
    expect(personalRecordText('duration', 45, 8)).toBe('45 s à 8 kg')
  })
})

describe('backupMessage', () => {
  it('message selon le cas', () => {
    expect(backupMessage({ status: 'never', daysSince: null })).toContain('jamais')
    expect(backupMessage({ status: 'due', daysSince: null })).toContain('à refaire')
    expect(backupMessage({ status: 'due', daysSince: 9 })).toContain('9 jours')
  })
})

describe('cas limites', () => {
  const w = (date: string, weightKg: number): WeighIn =>
    ({ id: date, date, weightKg, createdAt: T0 }) as WeighIn
  const food = (date: string): FoodLogEntry =>
    ({
      id: `f${date}`,
      date,
      slot: 'lunch',
      name: 'x',
      origin: { kind: 'free' },
      macros: { kcal: 2800, protein: 120, carbs: 0, fat: 0 },
      createdAt: T0,
    }) as unknown as FoodLogEntry

  it('aucune donnée : listes vides, pas de NaN, carte du lundi à zéro', () => {
    const m = build(data())
    expect(m).not.toBeNull()
    expect(m?.strength).toEqual([])
    expect(m?.measurements).toEqual([])
    expect(m?.hasNutritionTargets).toBe(false)
    expect(m?.nutrition.daysLogged).toBe(0)
    expect(m?.nutrition.avgKcal).toBeNull()
    expect(m?.nutrition.avgProtein).toBeNull()
    expect(m?.nutrition.daysInTarget).toBe(0)
    expect(m?.review?.sessions).toBe(0)
    expect(m?.review?.minutes).toBe(0)
    expect(m?.review?.records).toEqual([])
    expect(m?.review?.weightChangeKg).toBeNull()
    expect(m?.volumes.every((v) => v.sets === 0)).toBe(true)
    expect(m?.regularity.weeks.every((x) => x.sessions === 0)).toBe(true)
    expect(JSON.stringify(m?.regularity)).not.toContain('NaN')
  })

  it('une seule pesée : objectifs calculés, pas de variation de poids ni de NaN', () => {
    const m = build(data({ weighIns: [w('2026-10-15', 75)] }))
    expect(m?.hasNutritionTargets).toBe(true)
    expect(m?.nutrition.targetKcal).toBeGreaterThan(0)
    expect(Number.isFinite(m?.nutrition.targetKcal)).toBe(true)
    expect(m?.review?.weightChangeKg).toBeNull()
    expect(corridorStart([w('2026-10-15', 75)], '2026-10-16')).toEqual({ date: '2026-10-15', weightKg: 75 })
  })

  it('une pesée le jour même : point de départ du couloir = aujourd’hui', () => {
    expect(corridorStart([w('2026-10-16', 80)], '2026-10-16')).toEqual({ date: '2026-10-16', weightKg: 80 })
  })

  it('exercice absent des exercices de départ et des lignes : « Exercice supprimé », sans plantage', () => {
    const m = build(data({ sessions: [session('a', '2026-10-06', 'disparu-xyz', 10, 8)] }))
    expect(m?.nameOf('disparu-xyz')).toBe('Exercice supprimé')
    expect(m?.strength).toHaveLength(1)
    expect(m?.strength[0]?.name).toBe('Exercice supprimé')
    expect(m?.strength[0]?.metric).toBe('load')
    expect(m?.review?.sessions).toBe(1)
  })

  it('exercice supprimé (ligne deleted) : nom conservé dans l’historique et la force', () => {
    const deleted = { ...squat, name: 'Squat renommé', source: 'seed', deleted: true } as Exercise
    const m = build(
      data({ sessions: [session('a', '2026-10-06', 'goblet-squat', 12, 10)], exerciseRows: [deleted] }),
    )
    expect(m?.nameOf('goblet-squat')).toBe('Squat renommé')
    expect(m?.strength[0]?.name).toBe('Squat renommé')
  })

  it('semaine écoulée sans journal : moyennes nulles, 0 jour logué, objectifs conservés', () => {
    const m = build(data({ weighIns: [w('2026-10-01', 75)], foodLog: [food('2026-10-14')] }))
    expect(m?.review?.nutrition.daysLogged).toBe(0)
    expect(m?.review?.nutrition.avgKcal).toBeNull()
    expect(m?.review?.nutrition.targetKcal).toBeGreaterThan(0)
    expect(m?.nutrition.daysLogged).toBe(1)
  })

  it('journal d’hier dimanche : exclu de la semaine en cours le lundi', () => {
    const monday = new Date(2026, 9, 12, 9)
    const m = buildProgressModel({
      data: data({ weighIns: [w('2026-10-05', 75)], foodLog: [food('2026-10-11')] }),
      equipment: defaultEquipment(T0),
      seeds: seedExercises,
      now: monday,
    })
    expect(m?.nutrition.from).toBe('2026-10-12')
    expect(m?.nutrition.daysLogged).toBe(0)
    expect(m?.review?.nutrition.daysLogged).toBe(1)
  })

  it('mensuration partielle : conservée telle quelle, champs absents non remplis', () => {
    const partial = { id: 'm1', date: '2026-10-10', waistCm: 82, createdAt: T0 }
    const m = build(data({ measurements: [partial] }))
    expect(m?.measurements).toEqual([partial])
    expect(m?.measurements[0]).not.toHaveProperty('armCm')
  })

  it('courbe de force : points sans la mesure choisie ignorés, liste vide sans plantage', () => {
    const s: ExerciseStrength = {
      exerciseId: 'x',
      lastPerformedOn: '2026-10-10',
      points: [
        { date: '2026-10-01', sessionId: 'a', tonnageKg: 0, bestReps: 8 },
        { date: '2026-10-08', sessionId: 'b', tonnageKg: 0, topLoadKg: 10, bestReps: 8 },
      ],
      records: {},
    }
    expect(strengthChartData(s)).toEqual([{ date: '2026-10-08', day: 7, value: 10 }])
    expect(strengthChartData(s, 'duration')).toEqual([])
    expect(recordLines(s)).toEqual([])
    expect(strengthMetric({ ...s, points: [] })).toBe('reps')
  })
})

describe('nutrition de la semaine : jours complets', () => {
  const entry = (date: string, kcal: number): FoodLogEntry =>
    ({
      id: `n${date}`,
      date,
      slot: 'lunch',
      name: 'x',
      origin: { kind: 'free' },
      macros: { kcal, protein: 100, carbs: 0, fat: 0 },
      createdAt: T0,
    }) as unknown as FoodLogEntry
  const w = { id: 'w', date: '2026-10-15', weightKg: 75, createdAt: T0 } as WeighIn

  it('n’inclut pas aujourd’hui (vendredi : lundi → jeudi)', () => {
    const m = build(data({ weighIns: [w], foodLog: [entry('2026-10-12', 3000), entry('2026-10-16', 500)] }))
    expect(m?.nutrition.to).toBe('2026-10-15')
    expect(m?.nutrition.daysLogged).toBe(1)
    expect(m?.nutritionDaysElapsed).toBe(4)
  })
  it('le lundi : aucun jour complet', () => {
    const monday = new Date(2026, 9, 12, 12)
    const m = buildProgressModel({
      data: data({ foodLog: [entry('2026-10-12', 3000)] }),
      equipment: defaultEquipment(T0),
      seeds: seedExercises,
      now: monday,
    })
    expect(m?.nutritionDaysElapsed).toBe(0)
    expect(m?.nutrition.daysLogged).toBe(0)
  })
})

describe('bilan : jugé à la fin de la semaine évaluée', () => {
  const w = (date: string, weightKg: number): WeighIn =>
    ({ id: date, date, weightKg, createdAt: T0 }) as WeighIn
  // Poids stable : stagnation 21 j à la fin de la semaine évaluée (11 octobre).
  const stalled = ['2026-09-15', '2026-09-16', '2026-09-17', '2026-10-06', '2026-10-07', '2026-10-08'].map(
    (d) => w(d, 75),
  )
  const week = [
    session('r1', '2026-10-05', 'goblet-squat', 12, 10),
    session('r2', '2026-10-07', 'goblet-squat', 12, 10),
    session('r3', '2026-10-09', 'goblet-squat', 12, 10),
  ]

  it('weight_stalled évalué à range.to ; accepter +150 le lundi ne change pas le conseil', () => {
    expect(build(data({ weighIns: stalled, sessions: week }))?.review?.suggestion.rule).toBe('weight_stalled')
    const accepted: Profile = {
      ...profile,
      nutrition: { ...profile.nutrition, kcalAdjustment: 150, kcalAdjustedOn: '2026-10-12' },
    }
    const after = build(data({ profile: accepted, weighIns: stalled, sessions: week }))
    expect(after?.review?.suggestion.rule).toBe('weight_stalled')
  })

  it('les objectifs du bilan viennent du poids de la fin de semaine', () => {
    const rows = [w('2026-10-08', 70), w('2026-10-14', 80)]
    const entry = {
      id: 'e',
      date: '2026-10-06',
      slot: 'lunch',
      name: 'x',
      origin: { kind: 'free' },
      macros: { kcal: 2500, protein: 100, carbs: 0, fat: 0 },
      createdAt: T0,
    } as unknown as FoodLogEntry
    const m = build(data({ weighIns: rows, foodLog: [entry], sessions: week }))
    const week70 = m?.review?.nutrition.targetProtein
    expect(week70).toBe(Math.round(1.8 * 70))
    expect(m?.nutrition.targetProtein).toBe(Math.round(1.8 * 80))
  })

  it('groupes sous la cible issus de la semaine évaluée : les séances de la semaine en cours ne comptent pas', () => {
    const base = build(data({ sessions: week }))?.review?.suggestion
    expect(base?.rule).toBe('volume_gap')
    const extra = [
      ...week,
      ...['2026-10-12', '2026-10-13', '2026-10-14'].map((d, i) =>
        session(`c${i}`, d, 'goblet-squat', 12, 10),
      ),
    ]
    expect(build(data({ sessions: extra }))?.review?.suggestion).toEqual(base)
  })
})

describe('R4 : chiffres de tête, calendrier, records récents', () => {
  const entry = (id: string, date: string, kcal: number, protein: number): FoodLogEntry =>
    ({
      id,
      date,
      slot: 'lunch',
      name: 'x',
      origin: { kind: 'free' },
      macros: { kcal, protein, carbs: 0, fat: 0 },
      createdAt: T0,
    }) as unknown as FoodLogEntry
  const w = (date: string, weightKg: number): WeighIn =>
    ({ id: date, date, weightKg, createdAt: T0 }) as WeighIn

  it('calendrier : 84 jours, du lundi d’il y a 11 semaines au dimanche de la semaine en cours', () => {
    const m = build(data())
    expect(m?.days).toHaveLength(84)
    expect(m?.days[0]?.date).toBe('2026-07-27')
    expect(m?.days[83]?.date).toBe('2026-10-18')
    expect(m?.days.filter((d) => d.today).map((d) => d.date)).toEqual(['2026-10-16'])
    expect(m?.days.filter((d) => d.future)).toHaveLength(2)
  })

  it('chiffres de tête : séances du mois, % de jours nutrition OK, série', () => {
    const sessions = [
      session('a', '2026-09-30', 'goblet-squat', 12, 10),
      session('b', '2026-10-02', 'goblet-squat', 12, 10),
      session('c', '2026-10-14', 'goblet-squat', 14, 10),
    ]
    // Objectif : 75 kg → on s'en sert pour fabriquer un jour dans la cible et un jour hors cible.
    const weighIns = [w('2026-10-01', 75)]
    const probe = build(data({ weighIns }))
    const target = probe?.nutrition.targetKcal ?? 0
    const protein = probe?.nutrition.targetProtein ?? 0
    const foodLog = [
      entry('f1', '2026-10-10', target, protein),
      entry('f2', '2026-10-11', target * 0.5, protein),
      entry('f3', '2026-10-12', target, protein),
      entry('f4', '2026-10-13', target, protein),
    ]
    const m = build(data({ sessions, weighIns, foodLog }))
    expect(m?.headline.monthSessions).toBe(2)
    expect(m?.headline.nutritionShare).toBe(75)
    expect(m?.headline.streakWeeks).toBeGreaterThanOrEqual(0)
    expect(build(data())?.headline).toMatchObject({ monthSessions: 0, nutritionShare: null })
  })

  it('le journal des 84 derniers jours alimente le calendrier (un jour d’il y a 10 semaines est évalué)', () => {
    const weighIns = [w('2026-07-01', 75)]
    const probe = build(data({ weighIns }))
    const day = '2026-08-12'
    const foodLog = [entry('old', day, probe?.nutrition.targetKcal ?? 0, probe?.nutrition.targetProtein ?? 0)]
    const m = build(data({ weighIns, foodLog }))
    expect(m?.days.find((d) => d.date === day)?.nutritionOk).toBe(true)
  })

  it('records récents : ligne avec nom, nature, jour relatif et valeur', () => {
    const sessions = [
      session('a', '2026-10-01', 'goblet-squat', 12, 10),
      session('b', '2026-10-14', 'goblet-squat', 16, 10),
    ]
    const m = build(data({ sessions }))
    const load = m?.records.find((r) => r.detail.startsWith('Charge max'))
    expect(load).toMatchObject({
      exerciseId: 'goblet-squat',
      name: squat.name,
      value: '16 kg',
      detail: 'Charge max · mercredi',
    })
  })

  it('records récents : fenêtre de 6 semaines', () => {
    const sessions = [
      session('a', '2026-07-01', 'goblet-squat', 12, 10),
      session('b', '2026-08-01', 'goblet-squat', 16, 10),
    ]
    expect(build(data({ sessions }))?.records).toEqual([])
  })

  it('résumé d’un jour : dayInput permet de relire la séance et les repas', () => {
    const sessions = [session('a', '2026-10-14', 'goblet-squat', 16, 10)]
    const m = build(data({ sessions, foodLog: [entry('f', '2026-10-14', 500, 30)] }))
    expect(m?.dayInput.today).toBe('2026-10-16')
    expect(m?.dayInput.sessions).toHaveLength(1)
    expect(m?.dayInput.foodLog).toHaveLength(1)
  })

  it('texte d’un record de série en temps fixe : « en 45 s »', () => {
    expect(personalRecordText('reps', 36, 12, 45)).toBe('36 répétitions en 45 s à 12 kg')
    expect(personalRecordText('reps', 36, undefined, 45)).toBe('36 répétitions en 45 s')
    expect(personalRecordText('reps', 12, 8)).toBe('12 répétitions à 8 kg')
  })
})

describe('R4 : tendance du poids (8 semaines)', () => {
  const w = (date: string, weightKg: number): WeighIn =>
    ({ id: date, date, weightKg, createdAt: T0 }) as WeighIn

  it('moins de deux pesées dans la fenêtre : pas de courbe', () => {
    expect(buildWeightModel([], '2026-10-16', true).trend).toBeNull()
    expect(buildWeightModel([w('2026-10-15', 73)], '2026-10-16', true).trend).toBeNull()
    expect(buildWeightModel([w('2026-06-01', 70), w('2026-10-15', 73)], '2026-10-16', true).trend).toBeNull()
  })

  it('variation de la moyenne 7 j, durée couverte et points relatifs à la première pesée de la fenêtre', () => {
    const rows = [w('2026-08-21', 71.2), w('2026-09-18', 72), w('2026-10-16', 72.8)]
    const t = buildWeightModel(rows, '2026-10-16', false).trend
    expect(t?.firstDate).toBe('2026-08-21')
    expect(t?.spanDays).toBe(56)
    expect(t?.changeKg).toBeCloseTo(1.6, 5)
    expect(t?.points.map((p) => p.day)).toEqual([0, 28, 56])
    expect(t?.corridorStatus).toBeNull()
  })

  it('position par rapport au couloir : dans, sous, au-dessus', () => {
    const base = [w('2026-08-24', 70), w('2026-09-21', 70)]
    const at = (last: number) =>
      buildWeightModel([...base, w('2026-10-16', last)], '2026-10-16', true).trend?.corridorStatus
    // Départ 70 kg le 24 août ; 7,6 semaines plus tard le couloir vaut 71,3 à 72,6 kg (la moyenne 7 j de la
    // dernière pesée est cette pesée seule : les précédentes sont à plus de 6 jours).
    expect(at(70)).toBe('below')
    expect(at(72)).toBe('inside')
    expect(at(74)).toBe('above')
  })
})
