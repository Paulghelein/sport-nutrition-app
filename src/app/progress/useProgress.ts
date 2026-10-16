import { useMemo } from 'react'
import { seedExercises } from '../../content'
import { getEquipment, loadProgressData } from '../../db'
import { toLocalDate } from '../../domain/shared/dates'
import { useLiveQuery } from '../../ui'
import { buildProgressModel } from './progressModel'
import type { ProgressModel } from './progressModel'
import { useToday } from './useToday'

export interface ProgressState {
  /** `undefined` pendant le chargement ; `null` sans profil. */
  model: ProgressModel | null | undefined
  error: unknown
}

/**
 * Lit tout ce dont l'écran Progrès a besoin (`loadProgressData`, une transaction, + matériel) et en tire le modèle
 * d'affichage. Mise à jour automatique à chaque changement en base. Importe le contenu embarqué : écran lazy seulement.
 */
export function useProgress(): ProgressState {
  const today = useToday()
  const { data, error } = useLiveQuery(async () => {
    // Un seul instant par lecture : `today` de la requête et `now` du modèle ne peuvent pas diverger.
    const now = new Date()
    const [progress, equipment] = await Promise.all([loadProgressData(toLocalDate(now)), getEquipment()])
    return { progress, equipment, now }
  }, [today])
  const model = useMemo(
    () =>
      data
        ? buildProgressModel({
            data: data.progress,
            equipment: data.equipment,
            seeds: seedExercises,
            now: data.now,
          })
        : undefined,
    [data],
  )
  return { model, error }
}
