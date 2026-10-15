import { useMemo } from 'react'
import { seedExercises } from '../../content'
import { getEquipment, listExercisePrefs, listExerciseRows } from '../../db'
import { mergeLibrary } from '../../domain/training'
import type { Equipment, Exercise, LibraryExercise } from '../../types'
import { useLiveQuery } from '../../ui'

export interface LibraryData {
  /** Bibliothèque fusionnée (départ + base + préférences). */
  library: LibraryExercise[]
  /** Lignes brutes de la table `exercises` (pour retrouver les exercices supprimés). */
  rows: Exercise[]
  equipment: Equipment
}

/** `data` est `undefined` pendant le premier chargement ; se met à jour à chaque changement en base. */
export function useLibrary(): { data: LibraryData | undefined; error: unknown } {
  const { data, error } = useLiveQuery(async () => {
    const [rows, prefs, equipment] = await Promise.all([
      listExerciseRows(),
      listExercisePrefs(),
      getEquipment(),
    ])
    return { rows, prefs, equipment }
  }, [])
  const merged = useMemo(
    () =>
      data
        ? {
            library: mergeLibrary(seedExercises, data.rows, data.prefs),
            rows: data.rows,
            equipment: data.equipment,
          }
        : undefined,
    [data],
  )
  return { data: merged, error }
}
