import { describe, expect, it } from 'vitest'
import type { WeighIn } from '../../types/profile'
import type { KcalSuggestion } from '../../types/nutrition'
import type { NutritionWeek } from '../../types/progress'
import { previousWeekRange, shouldShowReview, weeklyReview, type WeeklyReviewInput } from './review'

const WS = '2026-10-05' // lundi
const nut = (over: Partial<NutritionWeek> = {}): NutritionWeek => ({
  from: WS,
  to: '2026-10-11',
  daysLogged: 6,
  avgKcal: 3000,
  avgProtein: 140,
  targetKcal: 3000,
  targetProtein: 140,
  daysInTarget: 5,
  ...over,
})
let id = 0
const wi = (date: string, weightKg: number): WeighIn => ({
  id: `w${id++}`,
  date,
  weightKg,
  createdAt: `${date}T08:00:00.000Z`,
})
// semaine précédente ~70 kg, cette semaine : +delta
const weights = (delta: number, thisWeekCount = 3): WeighIn[] => [
  wi('2026-09-29', 70),
  wi('2026-10-01', 70),
  wi('2026-10-03', 70),
  ...['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-11']
    .slice(0, thisWeekCount)
    .map((d) => wi(d, 70 + delta)),
]
// 70 kg il y a 2 semaines (fenêtre 21-27 sept.), puis 70 + delta cette semaine.
const twoWeeks = (delta: number, thisWeekCount = 3): WeighIn[] => [
  wi('2026-09-23', 70),
  wi('2026-09-25', 70),
  ...['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-11']
    .slice(0, thisWeekCount)
    .map((d) => wi(d, 70 + delta)),
]
const KS: KcalSuggestion = { kcal: 150, changeKg: 0.05, days: 21, message: 'x' }
const base = (over: Partial<WeeklyReviewInput> = {}): WeeklyReviewInput => ({
  weekStart: WS,
  sessions: 3,
  minutes: 120,
  plannedSessions: 3,
  records: [],
  weighIns: weights(0.3),
  goal: 'bulk',
  nutrition: nut(),
  majorGroupsBelowTarget: [],
  kcalSuggestion: null,
  ...over,
})
const rule = (o: Partial<WeeklyReviewInput>) => weeklyReview(base(o)).suggestion.rule

describe('weeklyReview', () => {
  it('semaine sans rien : no_data', () => {
    const r = weeklyReview(
      base({ sessions: 0, nutrition: nut({ daysLogged: 0, avgKcal: null, avgProtein: null }), weighIns: [] }),
    )
    expect(r.suggestion.rule).toBe('no_data')
    expect(r.weightChangeKg).toBeNull()
  })
  it('all_good et variation de poids', () => {
    const r = weeklyReview(base())
    expect(r.suggestion.rule).toBe('all_good')
    expect(r.weightChangeKg).toBeCloseTo(0.3, 6)
    expect(r.plannedSessions).toBe(3)
  })
  it('few_sessions avec message', () => {
    const r = weeklyReview(base({ sessions: 2 }))
    expect(r.suggestion.rule).toBe('few_sessions')
    expect(r.suggestion.message).toBe(
      '2 séances sur 3 la semaine dernière : vise 3 la semaine prochaine, même courtes (20 min).',
    )
  })
  it('low_protein', () => {
    const r = weeklyReview(base({ nutrition: nut({ avgProtein: 109.2 }) }))
    expect(r.suggestion.rule).toBe('low_protein')
    expect(r.suggestion.message).toContain('78 %')
  })
  it('protéines pile à 90 % : pas de règle', () => {
    expect(rule({ nutrition: nut({ avgProtein: 126 }) })).toBe('all_good')
  })
  it('weight_stalled : seulement si kcalSuggestion fournie, message avec sa valeur', () => {
    expect(rule({ kcalSuggestion: null })).toBe('all_good')
    expect(rule({ kcalSuggestion: undefined })).toBe('all_good')
    const r = weeklyReview(base({ kcalSuggestion: KS, weighIns: [] }))
    expect(r.suggestion.rule).toBe('weight_stalled')
    expect(r.suggestion.message).toContain('150 kcal')
  })
  it('weight_stalled : ignorée si objectif maintain / cut', () => {
    expect(rule({ goal: 'maintain', kcalSuggestion: KS })).toBe('all_good')
    expect(rule({ goal: 'cut', kcalSuggestion: KS })).toBe('all_good')
  })
  it('weight_too_fast : > 0,5 %/sem. en moyenne sur 14 jours, ≥ 3 pesées', () => {
    expect(rule({ weighIns: twoWeeks(0.8) })).toBe('weight_too_fast') // 0,4 kg/sem. > 0,35
    expect(rule({ weighIns: twoWeeks(0.69) })).toBe('all_good') // juste sous 0,35
    expect(rule({ weighIns: twoWeeks(0.8, 2) })).toBe('all_good') // < 3 pesées
    expect(rule({ weighIns: weights(2) })).toBe('all_good') // pas de repère à 14 jours
  })
  it('weight_too_fast : message prudent', () => {
    const m = weeklyReview(base({ weighIns: twoWeeks(0.8) })).suggestion.message
    expect(m).toContain('100 à 150 kcal')
  })
  it('low_kcal', () => {
    const r = weeklyReview(base({ nutrition: nut({ avgKcal: 2400 }) }))
    expect(r.suggestion.rule).toBe('low_kcal')
    expect(r.suggestion.message).toContain('80 %')
  })
  it('volume_gap avec noms français', () => {
    const r = weeklyReview(base({ majorGroupsBelowTarget: ['back', 'quads'] }))
    expect(r.suggestion.rule).toBe('volume_gap')
    expect(r.suggestion.message).toContain('dos, quadriceps')
  })
  it('priorité : no_data > few_sessions > low_protein > poids > low_kcal > volume_gap', () => {
    const all = base({
      sessions: 1,
      nutrition: nut({ avgProtein: 50, avgKcal: 1000 }),
      kcalSuggestion: KS,
      majorGroupsBelowTarget: ['back'],
    })
    expect(weeklyReview(all).suggestion.rule).toBe('few_sessions')
    const s3 = { ...all, sessions: 3 }
    expect(weeklyReview(s3).suggestion.rule).toBe('low_protein')
    const s4 = { ...s3, nutrition: nut({ avgKcal: 1000 }) }
    expect(weeklyReview(s4).suggestion.rule).toBe('weight_stalled')
    const s4b = { ...s4, kcalSuggestion: null, weighIns: twoWeeks(0.8) }
    expect(weeklyReview(s4b).suggestion.rule).toBe('weight_too_fast')
    const s5 = { ...s4, goal: 'maintain' as const }
    expect(weeklyReview(s5).suggestion.rule).toBe('low_kcal')
    const s6 = { ...s5, nutrition: nut() }
    expect(weeklyReview(s6).suggestion.rule).toBe('volume_gap')
  })
  it('maintain / cut : jamais de règle poids de prise de masse', () => {
    for (const goal of ['maintain', 'cut'] as const) {
      expect(rule({ goal, weighIns: twoWeeks(0), kcalSuggestion: KS })).toBe('all_good')
      expect(rule({ goal, weighIns: twoWeeks(3) })).toBe('all_good')
    }
  })
})

describe('semaines', () => {
  it('previousWeekRange', () => {
    expect(previousWeekRange('2026-10-12')).toEqual({ from: '2026-10-05', to: '2026-10-11' }) // lundi
    expect(previousWeekRange('2026-10-18')).toEqual({ from: '2026-10-05', to: '2026-10-11' }) // dimanche
    expect(previousWeekRange('2026-10-16')).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(previousWeekRange('2026-01-01')).toEqual({ from: '2025-12-22', to: '2025-12-28' })
  })
  it('shouldShowReview', () => {
    expect(shouldShowReview('2026-10-12')).toBe(true)
    expect(shouldShowReview('2026-10-14', '2026-09-28')).toBe(true)
    expect(shouldShowReview('2026-10-14', '2026-10-05')).toBe(false)
    expect(shouldShowReview('2026-10-18', '2026-10-05')).toBe(false)
    expect(shouldShowReview('2026-10-19', '2026-10-05')).toBe(true)
  })
})

describe('weeklyReview : bornes et exclusivité', () => {
  it('exactement 3 séances prévues et faites : pas few_sessions', () => {
    expect(rule({ sessions: 3, plannedSessions: 3 })).toBe('all_good')
    expect(rule({ sessions: 2, plannedSessions: 3 })).toBe('few_sessions')
    expect(rule({ sessions: 1, plannedSessions: 1 })).toBe('all_good')
  })
  it('kcal pile à 90 % : pas de règle ; juste dessous : low_kcal', () => {
    expect(rule({ nutrition: nut({ avgKcal: 2700 }) })).toBe('all_good')
    expect(rule({ nutrition: nut({ avgKcal: 2699 }) })).toBe('low_kcal')
  })
  it('jours non logués (moyennes null) : pas de règle nutrition', () => {
    expect(rule({ nutrition: nut({ daysLogged: 0, avgKcal: null, avgProtein: null }) })).toBe('all_good')
  })
  it('sessions 0 mais nutrition loguée : few_sessions, pas no_data', () => {
    expect(rule({ sessions: 0 })).toBe('few_sessions')
    expect(weeklyReview(base({ sessions: 0 })).suggestion.message).toContain('0 séance sur 3')
  })
  it('poids : maintain / cut ne déclenchent ni stalled ni too_fast', () => {
    expect(rule({ goal: 'cut', weighIns: twoWeeks(3), kcalSuggestion: KS })).toBe('all_good')
    expect(rule({ goal: 'maintain', weighIns: twoWeeks(3), kcalSuggestion: KS })).toBe('all_good')
    expect(rule({ weighIns: [] })).toBe('all_good')
  })
  it('une seule suggestion : toutes les règles vraies donnent la plus prioritaire', () => {
    const r = weeklyReview(
      base({
        sessions: 0,
        nutrition: nut({ avgProtein: 1, avgKcal: 1 }),
        kcalSuggestion: KS,
        majorGroupsBelowTarget: ['back'],
      }),
    )
    expect(r.suggestion.rule).toBe('few_sessions')
  })
  it('weeklyReview recopie les données d’entrée', () => {
    const r = weeklyReview(base({ minutes: 77 }))
    expect(r).toMatchObject({ weekStart: WS, minutes: 77, sessions: 3 })
  })
})
