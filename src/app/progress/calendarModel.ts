// Calendrier et résumé du jour : préparation des données de l'écran Progrès et de la carte « Ta semaine »
// (fonctions pures, sans React ni Dexie). Les composants n'affichent que ces modèles.
import { nutritionTargets, targetWeight } from '../../domain/nutrition/targets'
import type { DayTargets } from '../../domain/progress/calendar'
import type { DaySummary } from '../../domain/progress/daySummary'
import type { DatedRecord } from '../../domain/progress/recentRecords'
import { weekStartOf } from '../../domain/progress/regularity'
import { addDays, daysBetween } from '../../domain/shared/dates'
import type { DaySummaryView, WeekStripDay } from '../../ui/kit'
import { longDateLabel, parseLocalNoon } from '../../ui/kit'
import { formatNumber } from './format'
import type { DayActivity, LocalDate, MealSlot, PersonalRecord, Profile, WeighIn } from '../../types'

/** Nombre de semaines du calendrier de l'écran Progrès. */
export const HEATMAP_WEEKS = 12

/** Du lundi d'il y a 11 semaines au dimanche de la semaine en cours : 84 jours, une colonne par semaine. */
export function heatmapRange(today: LocalDate): { from: LocalDate; to: LocalDate } {
  const monday = weekStartOf(today)
  return { from: addDays(monday, -7 * (HEATMAP_WEEKS - 1)), to: addDays(monday, 6) }
}

/** Objectifs (kcal, protéines) d'un jour d'après le poids de référence de ce jour ; `null` sans pesée. */
export function makeTargetsFor(
  profile: Profile,
  weighIns: readonly WeighIn[],
): (date: LocalDate) => DayTargets | null {
  return (date) => {
    const weight = targetWeight(weighIns as WeighIn[], date)
    if (weight === undefined) return null
    const t = nutritionTargets(profile, weight, date)
    return { kcal: t.kcal, protein: t.protein }
  }
}

/** Jours du calendrier prêts pour le kit (`today` marqué). */
export function toStripDays(activities: readonly DayActivity[], today: LocalDate): WeekStripDay[] {
  return activities.map((a) => ({
    date: a.date,
    level: a.level,
    sessions: a.sessions,
    minutes: a.minutes,
    // La journée en cours n'est pas finie : jamais « hors cible » (ni « dans la cible ») avant minuit.
    nutritionOk: a.date === today ? null : a.nutritionOk,
    future: a.future,
    today: a.date === today,
  }))
}

const weekdayName = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' })
const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long' })

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Petit-déjeuner',
  lunch: 'Déjeuner',
  dinner: 'Dîner',
  snack: 'Collation',
}

/** Valeur d'un record en un coup d'œil : « 18 kg × 12 », « max 14 », « 36 reps en 45 s ». */
export function recordValueText(r: PersonalRecord): string {
  switch (r.kind) {
    case 'load':
      return `${formatNumber(r.value)} kg`
    case 'reps': {
      if (r.windowSec !== undefined) {
        const at = r.loadKg !== undefined ? ` à ${formatNumber(r.loadKg)} kg` : ''
        return `${formatNumber(r.value)} reps en ${formatNumber(r.windowSec)} s${at}`
      }
      return r.loadKg !== undefined
        ? `${formatNumber(r.loadKg)} kg × ${formatNumber(r.value)}`
        : `max ${formatNumber(r.value)}`
    }
    case 'duration':
      return `${formatNumber(r.value)} s${r.loadKg !== undefined ? ` à ${formatNumber(r.loadKg)} kg` : ''}`
    case 'tonnage':
      return `${formatNumber(Math.round(r.value))} kg au total`
  }
}

/** Nature du record, en un mot (sous le nom de l'exercice). */
export function recordKindLabel(r: PersonalRecord): string {
  switch (r.kind) {
    case 'load':
      return 'Charge max'
    case 'reps':
      return r.windowSec !== undefined ? 'Reps en temps fixe' : 'Répétitions'
    case 'duration':
      return 'Durée max'
    case 'tonnage':
      return 'Tonnage'
  }
}

/** « mercredi » dans les 6 derniers jours, sinon « le 3 octobre » (pas d'ambiguïté avec la semaine dernière). */
export function relativeDay(date: LocalDate, today: LocalDate): string {
  const age = daysBetween(date, today)
  if (age <= 0) return 'aujourd’hui'
  if (age === 1) return 'hier'
  if (age <= 6) return weekdayName.format(parseLocalNoon(date))
  const day = Number(date.slice(8, 10))
  return `le ${day === 1 ? '1er' : day} ${monthName.format(parseLocalNoon(date))}`
}

export interface RecordRowModel {
  key: string
  exerciseId: string
  name: string
  /** « Charge max · mercredi ». */
  detail: string
  value: string
}

/** Lignes de la carte « Records récents ». */
export function recordRows(
  records: readonly DatedRecord[],
  nameOf: (id: string) => string,
  today: LocalDate,
): RecordRowModel[] {
  return records.map(({ record, date, sessionId }) => ({
    key: `${sessionId}-${record.exerciseId}-${record.kind}-${record.loadKg ?? 'bw'}-${record.windowSec ?? '-'}`,
    exerciseId: record.exerciseId,
    name: nameOf(record.exerciseId),
    detail: `${recordKindLabel(record)} · ${relativeDay(date, today)}`,
    value: recordValueText(record),
  }))
}

/** Résumé d'un jour mis en forme pour la feuille du kit. */
export function dayView(
  summary: DaySummary,
  nameOf: (id: string) => string,
  today: LocalDate,
): DaySummaryView {
  const inProgress = summary.date === today
  return {
    title: longDateLabel(summary.date),
    inProgress,
    ...(summary.date === today
      ? { description: 'Aujourd’hui' }
      : summary.future
        ? { description: 'À venir' }
        : {}),
    future: summary.future,
    sessions: summary.sessions.map((s) => {
      const names = s.exerciseIds.map(nameOf)
      const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? `… (+${names.length - 3})` : '')
      return {
        id: s.id,
        title: `Séance de ${Math.round(s.minutes)} min`,
        details: `${s.setsDone} série${s.setsDone > 1 ? 's' : ''}${shown ? ` · ${shown}` : ''}`,
        records: s.records.map((r) => `${nameOf(r.exerciseId)}, ${recordValueText(r)}`),
      }
    }),
    meals: summary.meals.map((m) => ({
      id: m.slot,
      label: SLOT_LABEL[m.slot],
      details: m.names.join(', '),
      kcal: m.kcal,
    })),
    totals: summary.totals,
    targets: summary.targets,
    nutritionOk: summary.nutritionOk,
  }
}
