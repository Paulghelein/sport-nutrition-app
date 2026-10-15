import { describe, expect, it } from 'vitest'
import type { Profile, WeighIn } from '../../types/profile'
import { bmrMifflin, kcalSuggestion, nutritionTargets, targetWeight, type TargetsProfile } from './targets'

const profile: TargetsProfile = {
  sex: 'male',
  birthDate: '2001-03-10', // 25 ans au 2026-10-15
  heightCm: 180,
  activityLevel: 'moderate',
  goal: 'bulk',
  nutrition: { surplus: 0.12, proteinPerKg: 1.8, fatShare: 0.27, kcalAdjustment: 0 },
}
const ON = '2026-10-15'

describe('bmrMifflin', () => {
  it('homme +5, femme -161', () => {
    expect(bmrMifflin('male', 75, 180, 25)).toBe(1755)
    expect(bmrMifflin('female', 75, 180, 25)).toBe(1589)
  })
})

describe('nutritionTargets', () => {
  it('exemple calculé à la main : 75 kg, 180 cm, 25 ans, modéré, bulk 12 %', () => {
    // BMR 1755 ; TDEE 2720,25 ; kcal 3046,68 ; P 135 ; L 0,27*3046,68/9 = 91,40 ; G (3046,68-540-822,60)/4 = 421,02
    expect(nutritionTargets(profile, 75, ON)).toEqual({
      kcal: 3047,
      protein: 135,
      carbs: 421,
      fat: 91,
      bmr: 1755,
      tdee: 2720,
      weightKg: 75,
      ageYears: 25,
    })
  })
  it('maintien : TDEE', () => {
    expect(nutritionTargets({ ...profile, goal: 'maintain' }, 75, ON).kcal).toBe(2720)
  })
  it('sèche : TDEE × (1 - surplus) = 2393,82', () => {
    expect(nutritionTargets({ ...profile, goal: 'cut' }, 75, ON).kcal).toBe(2394)
  })
  it('ajustement manuel ajouté après le surplus', () => {
    const p = { ...profile, nutrition: { ...profile.nutrition, kcalAdjustment: 150 } }
    expect(nutritionTargets(p, 75, ON).kcal).toBe(3197) // 3196,68
  })
  it('femme', () => {
    // BMR 1589 ; TDEE 2462,95 ; bulk 2758,6
    expect(nutritionTargets({ ...profile, sex: 'female' }, 75, ON).kcal).toBe(2759)
  })
  it('âge calculé à la date', () => {
    expect(nutritionTargets(profile, 75, '2026-03-09').ageYears).toBe(24)
    expect(nutritionTargets(profile, 75, '2027-03-09').ageYears).toBe(25)
    expect(nutritionTargets(profile, 75, '2027-03-10').ageYears).toBe(26)
  })
  it('glucides jamais négatifs', () => {
    const p = {
      ...profile,
      goal: 'cut' as const,
      nutrition: { ...profile.nutrition, proteinPerKg: 2.2, fatShare: 0.9 },
    }
    expect(nutritionTargets(p, 40, ON).carbs).toBe(0)
  })
  it('paramètres de protéines et lipides respectés', () => {
    const p = { ...profile, nutrition: { ...profile.nutrition, proteinPerKg: 2, fatShare: 0.3 } }
    const t = nutritionTargets(p, 80, ON)
    expect(t.protein).toBe(160)
    expect(t.fat).toBe(Math.round((0.3 * ((10 * 80 + 6.25 * 180 - 5 * 25 + 5) * 1.55 * 1.12)) / 9))
  })
  it('accepte un Profile complet', () => {
    const full = { ...profile, id: 'me' } as unknown as Profile
    expect(nutritionTargets(full, 75, ON).kcal).toBe(3047)
  })
})

const w = (date: string, weightKg: number): WeighIn => ({
  id: date,
  date,
  weightKg,
  createdAt: `${date}T08:00:00.000Z`,
})

describe('targetWeight', () => {
  it('aucune pesée -> undefined', () => expect(targetWeight([], ON)).toBeUndefined())
  it('moyenne 7 j', () => {
    expect(targetWeight([w('2026-10-14', 70), w('2026-10-15', 72)], ON)).toBe(71)
  })
  it('sinon dernière pesée', () => {
    expect(targetWeight([w('2026-09-01', 70), w('2026-09-20', 71)], ON)).toBe(71)
  })
  it('ignore le futur', () => {
    expect(targetWeight([w('2026-10-20', 80)], ON)).toBeUndefined()
  })
})

/** 3 pesées dans les 7 jours qui précèdent (et incluent) la date. */
const around = (on: string, kg: number): WeighIn[] => {
  const d = (n: number) => {
    const t = new Date(`${on}T12:00:00Z`)
    t.setUTCDate(t.getUTCDate() - n)
    return t.toISOString().slice(0, 10)
  }
  return [w(d(0), kg), w(d(2), kg), w(d(4), kg)]
}

describe('kcalSuggestion', () => {
  const before = '2026-09-24' // ON - 21 jours
  it('stagnation -> +150 kcal', () => {
    const s = kcalSuggestion(profile, [...around(before, 70), ...around(ON, 70.05)], ON)
    expect(s?.kcal).toBe(150)
    expect(s?.days).toBe(21)
    expect(s?.changeKg).toBeCloseTo(0.05, 10)
    expect(s?.message).toContain('150 kcal')
  })
  it('perte de poids -> aussi proposé', () => {
    const s = kcalSuggestion(profile, [...around(before, 70), ...around(ON, 69.5)], ON)
    expect(s?.changeKg).toBeCloseTo(-0.5, 10)
    expect(s?.message).toContain('-0,5 kg')
  })
  it('prise suffisante (+0,1 kg ou plus) -> rien', () => {
    expect(kcalSuggestion(profile, [...around(before, 70), ...around(ON, 70.2)], ON)).toBeUndefined()
    expect(kcalSuggestion(profile, [...around(before, 70), ...around(ON, 71)], ON)).toBeUndefined()
  })
  it('objectif autre que bulk -> rien', () => {
    const ws = [...around(before, 70), ...around(ON, 70)]
    expect(kcalSuggestion({ ...profile, goal: 'maintain' }, ws, ON)).toBeUndefined()
    expect(kcalSuggestion({ ...profile, goal: 'cut' }, ws, ON)).toBeUndefined()
  })
  it('données insuffisantes -> rien', () => {
    expect(kcalSuggestion(profile, [], ON)).toBeUndefined()
    expect(kcalSuggestion(profile, around(ON, 70), ON)).toBeUndefined() // pas de point à J-21
    expect(
      kcalSuggestion(profile, [...around(before, 70), w(ON, 70), w('2026-10-14', 70)], ON),
    ).toBeUndefined()
  })
  it('ajustement déjà proche de la borne (+150 > 1000) -> rien', () => {
    const ws = [...around(before, 70), ...around(ON, 70)]
    const at = (kcalAdjustment: number): TargetsProfile => ({
      ...profile,
      nutrition: { ...profile.nutrition, kcalAdjustment },
    })
    expect(kcalSuggestion(at(850), ws, ON)).toBeDefined()
    expect(kcalSuggestion(at(851), ws, ON)).toBeUndefined()
  })
  it('ajustement récent (< 21 jours) -> rien ; 21 jours -> possible', () => {
    const ws = [...around(before, 70), ...around(ON, 70)]
    const adj = (d: string): TargetsProfile => ({
      ...profile,
      nutrition: { ...profile.nutrition, kcalAdjustedOn: d },
    })
    expect(kcalSuggestion(adj('2026-09-25'), ws, ON)).toBeUndefined() // 20 jours
    expect(kcalSuggestion(adj('2026-09-24'), ws, ON)).toBeDefined() // 21 jours
  })
})
