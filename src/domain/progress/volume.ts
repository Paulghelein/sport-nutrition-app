// Volume par groupe musculaire sur 7 jours vs cible (SPEC §8, carte du corps). Fonctions pures.
import type { LocalDate, Range } from '../../types/common'
import type { Equipment } from '../../types/profile'
import type { GroupVolume, VolumeStatus } from '../../types/progress'
import type { EngineSettings } from '../../types/settings'
import type { Session } from '../../types/training'
import { MUSCLE_GROUPS, volumeTargets, weeklyVolume } from '../training/volume'
import type { ExercisesById } from './strength'

/** Statut d'un volume par rapport à une cible fermée `[min, max]` ; `[0, 0]` = groupe non suivi. */
export function volumeStatus(sets: number, target: Range): VolumeStatus {
  const [min, max] = target
  if (min === 0 && max === 0) return 'untracked'
  if (sets < min) return 'below'
  if (sets > max) return 'above'
  return 'within'
}

/**
 * Séries effectives des 7 jours glissants `[today − 6, today]` (`weeklyVolume` du moteur : séances `done`, séries
 * faites, primaire 1 / secondaire 0,5, exercice inconnu ignoré) comparées aux cibles effectives (`volumeTargets` :
 * défauts, dos majoré sans barre, réglages). Un groupe par entrée de `MUSCLE_GROUPS`, dans cet ordre.
 */
export function groupVolumes(
  sessions: readonly Session[],
  exercisesById: ExercisesById,
  settings: EngineSettings,
  equipment: Equipment,
  today: LocalDate,
): GroupVolume[] {
  const volume = weeklyVolume(sessions, [...exercisesById.values()], today)
  const targets = volumeTargets(settings, equipment)
  return MUSCLE_GROUPS.map((group) => {
    const target: Range = [targets[group][0], targets[group][1]]
    return { group, sets: volume[group], target, status: volumeStatus(volume[group], target) }
  })
}
