// Règles métier uniques, partagées par la saisie (UI, repositories) et l'import de sauvegarde.
// Fonctions pures : elles renvoient un message français affichable tel quel, ou `null` si tout est valide.
// `today` est toujours fourni par l'appelant.
import { ageOn, isValidLocalDate } from '../domain/shared/dates'
import type { Equipment, LocalDate, Profile, Settings } from '../types'

export const MIN_AGE = 14
export const MAX_AGE = 100
export const MIN_HEIGHT_CM = 100
export const MAX_HEIGHT_CM = 250
export const MIN_WEIGHT_KG = 30
export const MAX_WEIGHT_KG = 250
export const MAX_WEEKLY_SESSIONS = 7

const DATE_FORMAT_MSG = 'Date invalide : le format attendu est AAAA-MM-JJ.'

/** Date de naissance (âge entre 14 et 100 ans) et taille (100–250 cm). */
export function checkProfileIdentity(
  p: { birthDate: LocalDate; heightCm: number },
  today: LocalDate,
): string | null {
  if (!isValidLocalDate(p.birthDate)) return 'Date de naissance invalide.'
  if (!isValidLocalDate(today)) return DATE_FORMAT_MSG
  const age = ageOn(p.birthDate, today)
  if (age < MIN_AGE || age > MAX_AGE) {
    return `L’âge doit être compris entre ${MIN_AGE} et ${MAX_AGE} ans.`
  }
  if (!Number.isFinite(p.heightCm) || p.heightCm < MIN_HEIGHT_CM || p.heightCm > MAX_HEIGHT_CM) {
    return `La taille doit être comprise entre ${MIN_HEIGHT_CM} et ${MAX_HEIGHT_CM} cm.`
  }
  return null
}

/** Séances par semaine : entiers, 1 ≤ minimum ≤ cible ≤ 7. */
export function checkWeeklySessions(p: {
  weeklySessionsTarget: number
  weeklySessionsMin: number
}): string | null {
  const { weeklySessionsTarget: t, weeklySessionsMin: m } = p
  if (!Number.isInteger(t) || !Number.isInteger(m) || m < 1 || m > t || t > MAX_WEEKLY_SESSIONS) {
    return `Le nombre de séances par semaine doit être un entier entre 1 et ${MAX_WEEKLY_SESSIONS}, et le minimum ne peut pas dépasser la cible.`
  }
  return null
}

export function checkProfile(p: Profile, today: LocalDate): string | null {
  return checkProfileIdentity(p, today) ?? checkWeeklySessions(p)
}

/** Kettlebell réglable : valeurs positives, min ≤ max, (max − min) multiple du pas. */
export function checkEquipment(eq: Pick<Equipment, 'kettlebell'>): string | null {
  const { minKg, maxKg, stepKg } = eq.kettlebell
  if (![minKg, maxKg, stepKg].every(Number.isFinite) || minKg <= 0 || maxKg <= 0) {
    return 'Les poids de la kettlebell doivent être des nombres positifs.'
  }
  if (minKg > maxKg) return 'Le poids minimum de la kettlebell ne peut pas dépasser le maximum.'
  if (stepKg <= 0) return 'Le pas de la kettlebell doit être supérieur à 0.'
  const steps = (maxKg - minKg) / stepKg
  if (Math.abs(steps - Math.round(steps)) > 1e-9) {
    return 'L’écart entre le minimum et le maximum doit être un multiple du pas.'
  }
  return null
}

/** Pesée : date valide et non future, poids entre 30 et 250 kg. */
export function checkWeighIn(w: { date: LocalDate; weightKg: number }, today: LocalDate): string | null {
  if (!isValidLocalDate(w.date)) return DATE_FORMAT_MSG
  if (!Number.isFinite(w.weightKg) || w.weightKg < MIN_WEIGHT_KG || w.weightKg > MAX_WEIGHT_KG) {
    return `Le poids doit être compris entre ${MIN_WEIGHT_KG} et ${MAX_WEIGHT_KG} kg.`
  }
  if (w.date > today) return 'La date d’une pesée ne peut pas être dans le futur.'
  return null
}

const MEASURE_KEYS = ['armCm', 'chestCm', 'waistCm', 'thighCm'] as const

/** Mensuration : date valide, au moins une valeur, toutes les valeurs renseignées > 0. */
export function checkMeasurement(
  m: { date: LocalDate } & { [K in (typeof MEASURE_KEYS)[number]]?: number | undefined },
): string | null {
  if (!isValidLocalDate(m.date)) return DATE_FORMAT_MSG
  let any = false
  for (const key of MEASURE_KEYS) {
    const v = m[key]
    if (v === undefined) continue
    if (!Number.isFinite(v) || v <= 0) return 'Les mensurations doivent être des nombres supérieurs à 0.'
    any = true
  }
  return any ? null : 'Renseigne au moins une mensuration.'
}

/** URL du Projet Claude : `null` ou URL https valide (refus de `javascript:` et autres schémas). */
export function checkCoachUrl(url: string | null): string | null {
  if (url === null) return null
  try {
    if (new URL(url).protocol === 'https:') return null
  } catch {
    // tombe dans le message ci-dessous
  }
  return 'L’adresse du coach doit être une URL valide commençant par https://.'
}

export function checkSettings(s: Pick<Settings, 'coachUrl'>): string | null {
  return checkCoachUrl(s.coachUrl)
}
