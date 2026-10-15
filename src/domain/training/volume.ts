// Volume hebdomadaire, cibles et fatigue récente (SPEC §3.2 étapes 1-2).
import type { LocalDate, Range } from '../../types/common'
import type { MuscleVolume } from '../../types/engine'
import type { Equipment } from '../../types/profile'
import type { EngineSettings } from '../../types/settings'
import type { Exercise, MuscleGroup, Session } from '../../types/training'
import { daysBetween } from '../shared/dates'

/** Tous les groupes suivis, dans un ordre stable (affichage, départages). */
export const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'quads',
  'glutes',
  'hamstrings',
  'biceps',
  'triceps',
  'abs',
  'calves',
  'forearms',
  'traps',
  'lower_back',
]

/** Grands groupes (cible SPEC §3.2 : 8 à 12 séries / semaine). */
export const MAJOR_GROUPS: readonly MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'quads',
  'glutes',
  'hamstrings',
]

/**
 * Cibles par défaut en séries effectives / semaine (débutant, prise de masse).
 * - Grands groupes : 8–12 (SPEC §3.2) ; dos 10–14 sans barre de traction (voir `volumeTargets`).
 * - Biceps, triceps, abdominaux, mollets : 4–8. Ils reçoivent déjà du volume secondaire des polyarticulaires
 *   (un rowing compte 0,5 série de biceps, une pompe 1 série de triceps) : 4–8 séries directes ou indirectes
 *   suffisent à un débutant sans voler le temps des grands groupes.
 * - Avant-bras, trapèzes, lombaires : 0 = pas de priorité propre (travaillés par les portés, soulevés, rowings) ;
 *   ils restent comptés pour la fatigue récente.
 */
export const DEFAULT_VOLUME_TARGETS: Readonly<Record<MuscleGroup, Range>> = {
  chest: [8, 12],
  back: [8, 12],
  shoulders: [8, 12],
  quads: [8, 12],
  glutes: [8, 12],
  hamstrings: [8, 12],
  biceps: [4, 8],
  triceps: [4, 8],
  abs: [4, 8],
  calves: [4, 8],
  forearms: [0, 0],
  traps: [0, 0],
  lower_back: [0, 0],
}

/** Cible du dos sans barre de traction (SPEC §3.1 : tirage horizontal majoré). */
export const BACK_TARGET_WITHOUT_BAR: Range = [10, 14]

/** Cibles effectives : défauts (dos majoré sans barre) puis réglages de l'utilisateur par-dessus. */
export function volumeTargets(settings: EngineSettings, equipment: Equipment): Record<MuscleGroup, Range> {
  const out = {} as Record<MuscleGroup, Range>
  for (const g of MUSCLE_GROUPS) out[g] = [...DEFAULT_VOLUME_TARGETS[g]]
  if (!equipment.owned.includes('pullup_bar')) out.back = [...BACK_TARGET_WITHOUT_BAR]
  for (const g of MUSCLE_GROUPS) {
    const custom = settings.volumeTargets[g]
    if (custom !== undefined) out[g] = [custom[0], custom[1]]
  }
  return out
}

/** Volume nul pour tous les groupes. */
export function emptyVolume(): MuscleVolume {
  const v = {} as MuscleVolume
  for (const g of MUSCLE_GROUPS) v[g] = 0
  return v
}

/**
 * Ajoute `sets` séries d'un exercice au volume : 1 par groupe primaire, 0,5 par groupe secondaire
 * (un groupe à la fois primaire et secondaire ne compte qu'en primaire). Modifie `volume`.
 */
export function addExerciseVolume(volume: MuscleVolume, ex: Pick<Exercise, 'muscles'>, sets: number): void {
  const primary = new Set(ex.muscles.primary)
  for (const g of primary) volume[g] += sets
  for (const g of new Set(ex.muscles.secondary)) if (!primary.has(g)) volume[g] += 0.5 * sets
}

function libraryIndex(library: readonly Exercise[]): Map<string, Exercise> {
  return new Map(library.map((e) => [e.id, e]))
}

/** Séances `done` datées de `today − (days − 1)` à `today` inclus (les séances futures sont ignorées). */
export function doneSessionsWithin(sessions: readonly Session[], today: LocalDate, days: number): Session[] {
  return sessions.filter((s) => {
    if (s.status !== 'done') return false
    const age = daysBetween(s.date, today)
    return age >= 0 && age < days
  })
}

/**
 * Volume des 7 jours glissants [today − 6, today] : séries `done` des séances `done`.
 * Un exercice absent de la bibliothèque est ignoré.
 */
export function weeklyVolume(
  sessions: readonly Session[],
  library: readonly Exercise[],
  today: LocalDate,
): MuscleVolume {
  const index = libraryIndex(library)
  const volume = emptyVolume()
  for (const s of doneSessionsWithin(sessions, today, 7)) {
    for (const block of s.blocks) {
      for (const se of block.exercises) {
        const ex = index.get(se.exerciseId)
        if (ex === undefined) continue
        const n = se.sets.filter((x) => x.status === 'done').length
        if (n > 0) addExerciseVolume(volume, ex, n)
      }
    }
  }
  return volume
}

/** Seuil de fatigue récente (SPEC §3.2) : ≥ 4 séries en primaire il y a moins de 48 h. */
export const RECENT_FATIGUE_THRESHOLD = 4

/**
 * Séries faites où le groupe est primaire, dans les séances `done` d'aujourd'hui et d'hier (« < 48 h »).
 * Approximation : les séances n'ont qu'une date (pas d'heure fiable avant J4), donc « < 48 h » est lu comme
 * « aujourd'hui ou hier » ; une séance d'hier à 7 h est comptée même à 9 h le lendemain (prudent : retrait
 * un peu plus long), et une séance d'avant-hier soir ne l'est plus (≈ 36 à 60 h selon les heures).
 * Toute série faite compte comme « lourde » (prudent : un débutant récupère moins vite).
 */
export function recentPrimarySets(
  sessions: readonly Session[],
  library: readonly Exercise[],
  today: LocalDate,
): MuscleVolume {
  const index = libraryIndex(library)
  const volume = emptyVolume()
  for (const s of doneSessionsWithin(sessions, today, 2)) {
    for (const block of s.blocks) {
      for (const se of block.exercises) {
        const ex = index.get(se.exerciseId)
        if (ex === undefined) continue
        const n = se.sets.filter((x) => x.status === 'done').length
        for (const g of new Set(ex.muscles.primary)) volume[g] += n
      }
    }
  }
  return volume
}

/** Groupes fatigués (≥ RECENT_FATIGUE_THRESHOLD séries primaires en < 48 h) : pénalité forte à la génération. */
export function fatiguedGroups(
  sessions: readonly Session[],
  library: readonly Exercise[],
  today: LocalDate,
): Set<MuscleGroup> {
  const recent = recentPrimarySets(sessions, library, today)
  return new Set(MUSCLE_GROUPS.filter((g) => recent[g] >= RECENT_FATIGUE_THRESHOLD))
}
