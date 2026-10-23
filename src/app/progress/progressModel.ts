// Préparation des données de l'écran Progrès (fonctions pures, sans React ni Dexie).
// Les composants n'affichent que ce modèle : la refonte de l'UI peut les réécrire sans toucher à ce fichier.
import { backupReminder } from '../../domain/progress/backup'
import { nutritionWeek } from '../../domain/progress/nutrition'
import { dayActivities } from '../../domain/progress/calendar'
import type { DaySummaryInput } from '../../domain/progress/daySummary'
import { recentRecords } from '../../domain/progress/recentRecords'
import { regularity, weekStartOf } from '../../domain/progress/regularity'
import { nutritionOkShare, sessionsThisMonth } from '../../domain/progress/stats'
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
  DayActivity,
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
import type { WeekStripDay } from '../../ui/kit'
import { formatDecimal, formatInt } from '../../ui/kit/format'
import { heatmapRange, makeTargetsFor, recordRows, toStripDays } from './calendarModel'
import type { RecordRowModel } from './calendarModel'

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
  /** Les trois chiffres de tête : série (semaines), séances du mois, % de jours nutrition OK (`null` : rien évalué). */
  headline: { streakWeeks: number; monthSessions: number; nutritionShare: number | null }
  /** 12 semaines (84 jours, du lundi au dimanche de la semaine en cours) pour le calendrier. */
  days: WeekStripDay[]
  /** Records des 6 dernières semaines, du plus récent au plus ancien. */
  records: RecordRowModel[]
  /** De quoi calculer le résumé d'un jour touché (sans `date`). */
  dayInput: Omit<DaySummaryInput, 'date'>
}

/** Fenêtre des « records récents », en jours. */
export const RECENT_RECORDS_DAYS = 42

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

/** Seuil de la série : `min(3, séances minimum du profil)`, pour qu'un profil à 2 séances/sem. ait aussi une série. */
export function profileWeekTarget(profile: { weeklySessionsMin: number }): number {
  return Math.min(REGULARITY_WEEK_TARGET, profile.weeklySessionsMin)
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
    lines.push({
      label: 'Charge la plus lourde',
      text: `${formatDecimal(load.value, 2)} kg`,
      date: load.date,
    })
  if (reps) {
    const at = reps.loadKg !== undefined ? ` à ${formatDecimal(reps.loadKg, 2)} kg` : ''
    lines.push({ label: 'Répétitions max', text: `${formatDecimal(reps.value, 2)}${at}`, date: reps.date })
  }
  if (duration) {
    const at = duration.loadKg !== undefined ? ` à ${formatDecimal(duration.loadKg, 2)} kg` : ''
    lines.push({
      label: 'Durée max',
      text: `${formatDecimal(duration.value, 2)} s${at}`,
      date: duration.date,
    })
  }
  if (tonnage) {
    lines.push({
      label: 'Meilleur tonnage',
      text: `${formatInt(tonnage.value)} kg`,
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
  /** Record de répétitions d'une série en temps fixe : la fenêtre en secondes (« en 45 s »). */
  windowSec?: number,
): string {
  const at = loadKg !== undefined ? ` à ${formatDecimal(loadKg, 2)} kg` : ''
  switch (kind) {
    case 'load':
      return `charge max ${formatDecimal(value, 2)} kg`
    case 'reps':
      if (windowSec !== undefined)
        return `${formatDecimal(value, 2)} répétitions en ${formatDecimal(windowSec, 2)} s${at}`
      return `${formatDecimal(value, 2)} répétitions${at}`
    case 'duration':
      return `${formatDecimal(value, 2)} s${at}`
    case 'tonnage':
      return `tonnage ${formatInt(value)} kg`
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
  /** Courbe des 8 dernières semaines (carte poids) ; `null` si moins de 2 pesées dans la fenêtre. */
  trend: WeightTrend | null
}

/** Fenêtre de la carte poids : la même que la recherche du départ du couloir (8 semaines). */
export const WEIGHT_TREND_DAYS = CORRIDOR_WINDOW_DAYS

export type CorridorStatus = 'inside' | 'below' | 'above'

export interface WeightTrend {
  /** Date de la première pesée de la fenêtre. */
  firstDate: LocalDate
  /** Moyenne 7 j au début et à la fin de la fenêtre. */
  startAvg: number
  endAvg: number
  changeKg: number
  /** Jours entre la première et la dernière pesée de la fenêtre. */
  spanDays: number
  /** Position de la moyenne actuelle par rapport au couloir (prise de masse avec couloir seulement). */
  corridorStatus: CorridorStatus | null
  /** Points de la fenêtre (`day` = jours depuis `firstDate`). */
  points: WeightChartPoint[]
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
    trend: buildWeightTrend(series, chart, today, corridor ? bandByDate : undefined),
  }
}

/** Fenêtre des 8 dernières semaines : variation de la moyenne 7 j et place par rapport au couloir. */
function buildWeightTrend(
  series: readonly { date: LocalDate; avg7d: number }[],
  chart: readonly WeightChartPoint[],
  today: LocalDate,
  band: ReadonlyMap<LocalDate, { lowKg: number; highKg: number }> | undefined,
): WeightTrend | null {
  const from = addDays(today, -WEIGHT_TREND_DAYS)
  const idx: number[] = []
  series.forEach((p, i) => {
    if (p.date >= from && p.date <= today) idx.push(i)
  })
  const firstI = idx[0]
  const lastI = idx[idx.length - 1]
  if (firstI === undefined || lastI === undefined || firstI === lastI) return null
  const a = series[firstI]
  const b = series[lastI]
  if (!a || !b) return null
  const base = chart[firstI]?.day ?? 0
  const at = band?.get(b.date)
  const corridorStatus: CorridorStatus | null = at
    ? b.avg7d < at.lowKg
      ? 'below'
      : b.avg7d > at.highKg
        ? 'above'
        : 'inside'
    : null
  return {
    firstDate: a.date,
    startAvg: a.avg7d,
    endAvg: b.avg7d,
    changeKg: b.avg7d - a.avg7d,
    spanDays: daysBetween(a.date, b.date),
    corridorStatus,
    points: idx.map((i) => {
      const p = chart[i] as WeightChartPoint
      return { ...p, day: p.day - base }
    }),
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

  const weekTarget = profileWeekTarget(profile)
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

  const targetsFor = makeTargetsFor(profile, data.weighIns)
  const calendarRange = heatmapRange(today)
  const activities: DayActivity[] = dayActivities({
    ...calendarRange,
    today,
    sessions: data.sessions,
    exercisesById: byId,
    foodLog: data.foodLog,
    targetsFor,
  })

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
    headline: {
      streakWeeks: reg.currentStreak,
      monthSessions: sessionsThisMonth(activities, today),
      nutritionShare: nutritionOkShare(activities, today),
    },
    days: toStripDays(activities, today),
    records: recordRows(
      recentRecords(data.sessions, addDays(today, -RECENT_RECORDS_DAYS), today, byId, 5),
      nameOf,
      today,
    ),
    dayInput: { today, sessions: data.sessions, exercisesById: byId, foodLog: data.foodLog, targetsFor },
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
