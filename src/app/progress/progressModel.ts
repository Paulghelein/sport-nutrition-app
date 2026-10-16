// Préparation des données de l'écran Progrès (fonctions pures, sans React ni Dexie).
// Les composants n'affichent que ce modèle : la refonte de l'UI peut les réécrire sans toucher à ce fichier.
import { backupReminder } from '../../domain/progress/backup'
import { nutritionWeek } from '../../domain/progress/nutrition'
import { regularity, weekStartOf } from '../../domain/progress/regularity'
import { previousWeekRange, shouldShowReview, weeklyReview } from '../../domain/progress/review'
import { recordsInRange, strengthByExercise } from '../../domain/progress/strength'
import type { ExercisesById } from '../../domain/progress/strength'
import { groupVolumes } from '../../domain/progress/volume'
import {
  STAGNATION_KCAL_STEP,
  kcalSuggestion,
  nutritionTargets,
  targetWeight,
} from '../../domain/nutrition/targets'
import { weightSeries, weightSummary, weightTargetCorridor } from '../../domain/progress/weight'
import type { WeightSummary } from '../../domain/progress/weight'
import { PATTERN_ORDER, mergeLibrary } from '../../domain/training/library'
import { patternLevels } from '../../domain/training/levels'
import { MAJOR_GROUPS } from '../../domain/training/volume'
import { addDays, daysBetween, toLocalDate } from '../../domain/shared/dates'
import { REGULARITY_WEEK_TARGET } from '../../types/progress'
import type {
  BackupReminder,
  Equipment,
  Exercise,
  ExerciseStrength,
  StrengthPoint,
  GroupVolume,
  LocalDate,
  Measurement,
  MovementPattern,
  NutritionWeek,
  Regularity,
  WeighIn,
  TrainingLevel,
  WeeklyReview,
} from '../../types'
import type { ProgressData } from '../../db'

export interface StrengthRow {
  exerciseId: string
  name: string
  strength: ExerciseStrength
  /** Mesure principale de la courbe de cet exercice. */
  metric: StrengthMetric
}

export interface ProgressModel {
  today: LocalDate
  bulk: boolean
  /** Carte du lundi à afficher, sinon `null` (déjà fermée). */
  review: WeeklyReview | null
  /** Rappel à afficher (`never` / `due`), sinon `null`. */
  backup: BackupReminder | null
  regularity: Regularity
  /** Seuil réellement utilisé pour la série (`min(3, séances minimum du profil)`). */
  regularityTarget: number
  strength: StrengthRow[]
  patterns: { pattern: MovementPattern; level: TrainingLevel }[]
  /** 13 groupes, ordre de `MUSCLE_GROUPS`. */
  volumes: GroupVolume[]
  /** Lundi → HIER (la journée en cours n'est pas finie). */
  nutrition: NutritionWeek
  /** Jours complets écoulés depuis lundi (0 le lundi : pas encore de moyenne). */
  nutritionDaysElapsed: number
  weight: WeightModel
  /** `false` : pas de pesée, donc pas d'objectif calculable (affichage « objectif inconnu »). */
  hasNutritionTargets: boolean
  measurements: Measurement[]
  /** Nom d'un exercice, y compris supprimé (« Exercice supprimé » si introuvable). */
  nameOf: (id: string) => string
}

/**
 * Index des exercices par id pour les calculs d'historique : exercices de départ (version d'origine), recouverts par
 * les lignes de la base, y compris SUPPRIMÉES (sinon leur nom disparaît de l'historique et leur tonnage unilatéral
 * n'est plus doublé).
 */
export function buildExercisesById(seeds: readonly Exercise[], rows: readonly Exercise[]): ExercisesById {
  const map = new Map<string, Exercise>()
  for (const s of seeds) map.set(s.id, s)
  for (const r of rows) map.set(r.id, r)
  return map
}

export const DELETED_EXERCISE_NAME = 'Exercice supprimé'

// ---------- Force ----------

export type StrengthMetric = 'load' | 'duration' | 'reps'

/** Charge si l'exercice a déjà été fait chargé, sinon durée, sinon répétitions. */
export function strengthMetric(s: ExerciseStrength): StrengthMetric {
  if (s.points.some((p) => p.topLoadKg !== undefined && p.topLoadKg > 0)) return 'load'
  if (s.points.some((p) => p.bestDurationSec !== undefined)) return 'duration'
  return 'reps'
}

/** Valeur d'un point pour la mesure choisie (`undefined` si non mesurée cette séance). */
export function metricValue(p: StrengthPoint, metric: StrengthMetric): number | undefined {
  return metric === 'load' ? p.topLoadKg : metric === 'duration' ? p.bestDurationSec : p.bestReps
}

export interface StrengthChartPoint {
  date: LocalDate
  /** Jours depuis le premier point (axe X numérique). */
  day: number
  /** Charge max (kg), durée max (s) ou reps max selon la mesure. */
  value: number
}

export function strengthChartData(
  s: ExerciseStrength,
  metric: StrengthMetric = strengthMetric(s),
): StrengthChartPoint[] {
  const first = s.points[0]
  const out: StrengthChartPoint[] = []
  for (const p of s.points) {
    const value = metricValue(p, metric)
    if (value !== undefined && first) out.push({ date: p.date, day: daysBetween(first.date, p.date), value })
  }
  return out
}

/** Dernière valeur connue de la mesure (pas forcément celle de la dernière séance). */
export function lastMetricValue(s: ExerciseStrength, metric: StrengthMetric): number | undefined {
  for (let i = s.points.length - 1; i >= 0; i--) {
    const v = metricValue(s.points[i] as StrengthPoint, metric)
    if (v !== undefined) return v
  }
  return undefined
}

export const METRIC_UNIT: Record<StrengthMetric, string> = { load: 'kg', duration: 's', reps: 'reps' }
export const METRIC_LABEL: Record<StrengthMetric, string> = {
  load: 'Charge max',
  duration: 'Durée max',
  reps: 'Répétitions max',
}

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })
export const formatNumber = (n: number): string => nf.format(n)

export interface RecordLine {
  label: string
  text: string
  date: LocalDate
}

/** Records de l'historique d'un exercice, une ligne par type, en français. */
export function recordLines(s: ExerciseStrength): RecordLine[] {
  const { load, reps, duration, tonnage } = s.records
  const lines: RecordLine[] = []
  if (load)
    lines.push({ label: 'Charge la plus lourde', text: `${formatNumber(load.value)} kg`, date: load.date })
  if (reps) {
    const at = reps.loadKg !== undefined ? ` à ${formatNumber(reps.loadKg)} kg` : ''
    lines.push({ label: 'Répétitions max', text: `${formatNumber(reps.value)}${at}`, date: reps.date })
  }
  if (duration) {
    const at = duration.loadKg !== undefined ? ` à ${formatNumber(duration.loadKg)} kg` : ''
    lines.push({ label: 'Durée max', text: `${formatNumber(duration.value)} s${at}`, date: duration.date })
  }
  if (tonnage) {
    lines.push({
      label: 'Meilleur tonnage',
      text: `${formatNumber(Math.round(tonnage.value))} kg`,
      date: tonnage.date,
    })
  }
  return lines
}

/** Texte d'un record battu pendant la semaine (carte du lundi). */
export function personalRecordText(
  kind: 'load' | 'reps' | 'duration' | 'tonnage',
  value: number,
  loadKg?: number,
): string {
  const at = loadKg !== undefined ? ` à ${formatNumber(loadKg)} kg` : ''
  switch (kind) {
    case 'load':
      return `charge max ${formatNumber(value)} kg`
    case 'reps':
      return `${formatNumber(value)} répétitions${at}`
    case 'duration':
      return `${formatNumber(value)} s${at}`
    case 'tonnage':
      return `tonnage ${formatNumber(Math.round(value))} kg`
  }
}

// ---------- Poids : couloir cible ----------

/** Fenêtre (en jours) dans laquelle on cherche le point de départ du couloir : 8 semaines. */
export const CORRIDOR_WINDOW_DAYS = 56

export interface CorridorStart {
  date: LocalDate
  weightKg: number
}

/**
 * Point de départ du couloir cible (+0,25 à +0,5 %/sem.), ancré pour ne bouger qu'une fois par semaine :
 * - début = lundi de la semaine contenant le jour « aujourd'hui − 56 j » ;
 * - ou le dernier ajustement kcal accepté (`kcalAdjustedOn`) s'il est plus récent : on repart d'un nouveau régime ;
 * - date de départ = première pesée à partir de ce début ; poids de départ = moyenne des pesées des 7 jours
 *   qui suivent (cette pesée comprise), pour ne pas partir d'une pesée isolée.
 * `null` sans pesée depuis le début.
 */
export function corridorStart(
  weighIns: readonly { date: LocalDate; weightKg: number }[],
  today: LocalDate,
  adjustedOn?: LocalDate,
): CorridorStart | null {
  let from = weekStartOf(addDays(today, -CORRIDOR_WINDOW_DAYS))
  if (adjustedOn !== undefined && adjustedOn > from) from = adjustedOn
  const inWindow = weighIns
    .filter((w) => w.date >= from && w.date <= today)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  const first = inWindow[0]
  if (!first) return null
  const end = addDays(first.date, 6)
  const first7 = inWindow.filter((w) => w.date <= end)
  const avg = first7.reduce((a, w) => a + w.weightKg, 0) / first7.length
  return { date: first.date, weightKg: avg }
}

export interface WeightChartPoint {
  /** Jours depuis la première pesée. */
  day: number
  weight: number
  avg: number
  low?: number
  high?: number
}

export interface WeightModel {
  summary: WeightSummary
  /** Pesées, la plus récente d'abord. */
  recent: WeighIn[]
  /** Date de la première pesée (origine de `day`), `null` sans pesée. */
  firstDate: LocalDate | null
  chart: WeightChartPoint[]
  /** Couloir cible : seulement en prise de masse et s'il a au moins 2 points. */
  corridor: CorridorStart | null
}

const round2 = (n: number): number => Math.round(n * 100) / 100

export function buildWeightModel(
  weighIns: readonly WeighIn[],
  today: LocalDate,
  bulk: boolean,
  adjustedOn?: LocalDate,
): WeightModel {
  const list = [...weighIns]
  const series = weightSeries(list)
  const first = series[0]
  const start = bulk ? corridorStart(list, today, adjustedOn) : null
  const band = start
    ? weightTargetCorridor(
        start.weightKg,
        start.date,
        series.filter((p) => p.date >= start.date).map((p) => p.date),
      )
    : []
  const corridor = band.length >= 2 ? start : null
  const bandByDate = new Map(band.map((b) => [b.date, b]))
  const chart = series.map((p) => {
    const b = corridor ? bandByDate.get(p.date) : undefined
    const point: WeightChartPoint = {
      day: first ? daysBetween(first.date, p.date) : 0,
      weight: p.weightKg,
      avg: round2(p.avg7d),
    }
    if (b) {
      point.low = round2(b.lowKg)
      point.high = round2(b.highKg)
    }
    return point
  })
  return {
    summary: weightSummary(list, today),
    recent: [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    firstDate: first?.date ?? null,
    chart,
    corridor,
  }
}

// ---------- Modèle complet ----------

export interface ProgressInputs {
  data: ProgressData
  equipment: Equipment
  seeds: readonly Exercise[]
  now: Date
}

/** `null` sans profil (onboarding non terminé). */
export function buildProgressModel({ data, equipment, seeds, now }: ProgressInputs): ProgressModel | null {
  const { profile, settings } = data
  if (!profile) return null
  const today = toLocalDate(now)
  const byId = buildExercisesById(seeds, data.exerciseRows)
  const library = mergeLibrary(seeds, data.exerciseRows, data.prefs)
  const nameOf = (id: string): string => byId.get(id)?.name ?? DELETED_EXERCISE_NAME

  const weekTarget = Math.min(REGULARITY_WEEK_TARGET, profile.weeklySessionsMin)
  const reg = regularity(data.sessions, today, { weekTarget })

  const goalsAt = (p: typeof profile, on: LocalDate) => {
    const w = targetWeight(data.weighIns, on)
    const t = w !== undefined ? nutritionTargets(p, w, on) : undefined
    return { goals: { kcal: t?.kcal ?? 0, protein: t?.protein ?? 0 }, has: t !== undefined }
  }
  const current = goalsAt(profile, today)

  let review: WeeklyReview | null = null
  const range = previousWeekRange(today)
  // Profil créé après la fin de la semaine évaluée : rien à évaluer.
  const createdOn = toLocalDate(new Date(profile.createdAt))
  if (createdOn <= range.to && shouldShowReview(today, settings.reviewDismissedWeek)) {
    // Le bilan juge la semaine avec les objectifs de SA fin : poids à range.to, et un ajustement kcal accepté
    // depuis (ex. +150 le lundi) est retiré pour ne pas changer le conseil rétroactivement.
    // Limite connue : suppose que l'ajustement daté après range.to est le pas accepté (+150) ; une modification
    // manuelle de kcalAdjustment la même semaine, ou un ajustement précédent récent, n'est pas reconstitué.
    const adjustedAfter = (profile.nutrition.kcalAdjustedOn ?? '') > range.to
    const reviewProfile = adjustedAfter
      ? {
          ...profile,
          nutrition: {
            ...profile.nutrition,
            kcalAdjustment: profile.nutrition.kcalAdjustment - STAGNATION_KCAL_STEP,
            kcalAdjustedOn: undefined,
          },
        }
      : profile
    const activity = reg.weeks.find((w) => w.weekStart === range.from)
    const below = groupVolumes(data.sessions, byId, settings.engine, equipment, range.to)
      .filter((v) => MAJOR_GROUPS.includes(v.group) && v.status === 'below')
      .map((v) => v.group)
    review = weeklyReview({
      weekStart: range.from,
      sessions: activity?.sessions ?? 0,
      minutes: activity?.minutes ?? 0,
      plannedSessions: profile.weeklySessionsTarget,
      records: recordsInRange(data.sessions, range.from, range.to, byId),
      weighIns: data.weighIns,
      goal: profile.goal,
      nutrition: nutritionWeek(data.foodLog, range.from, range.to, goalsAt(reviewProfile, range.to).goals),
      majorGroupsBelowTarget: below,
      kcalSuggestion: kcalSuggestion(reviewProfile, data.weighIns, range.to),
    })
  }

  const reminder = backupReminder(settings.lastExportAt, now)

  const strength = strengthByExercise(data.sessions, byId).map((s) => ({
    exerciseId: s.exerciseId,
    name: nameOf(s.exerciseId),
    strength: s,
    metric: strengthMetric(s),
  }))

  const levels = patternLevels(library, data.states, profile.level)

  return {
    today,
    bulk: profile.goal === 'bulk',
    review,
    backup: reminder.status === 'ok' ? null : reminder,
    regularity: reg,
    regularityTarget: weekTarget,
    strength,
    patterns: PATTERN_ORDER.map((pattern) => ({ pattern, level: levels[pattern] })),
    volumes: groupVolumes(data.sessions, byId, settings.engine, equipment, today),
    nutrition: nutritionWeek(data.foodLog, weekStartOf(today), addDays(today, -1), current.goals),
    nutritionDaysElapsed: daysBetween(weekStartOf(today), today),
    weight: buildWeightModel(data.weighIns, today, profile.goal === 'bulk', profile.nutrition.kcalAdjustedOn),
    hasNutritionTargets: current.has,
    measurements: data.measurements,
    nameOf,
  }
}

// ---------- Textes ----------

export function backupMessage(r: BackupReminder): string {
  if (r.status === 'never')
    return 'Tu n’as encore jamais exporté de sauvegarde. Tes données ne sont que sur ce téléphone.'
  if (r.daysSince === null) return 'Ta dernière sauvegarde est à refaire.'
  return `Dernière sauvegarde il y a ${r.daysSince} jours.`
}

export type VolumeLabelKey = GroupVolume['status']
export const VOLUME_STATUS_LABEL: Record<VolumeLabelKey, string> = {
  below: 'Sous la cible',
  within: 'Dans la cible',
  above: 'Au-dessus',
  untracked: 'Non suivi',
}
