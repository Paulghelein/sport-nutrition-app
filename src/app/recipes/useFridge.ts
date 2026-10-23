import { listFridge } from '../../db'
import type { FridgeItem } from '../../types'
import { useLiveQuery } from '../../ui'

export function useFridge(): { data: FridgeItem[] | undefined; error: unknown } {
  const live = useLiveQuery(() => listFridge(), [])
  return { data: live.data, error: live.error }
}

/** Total des portions restantes au frigo (pastille « Frigo · N » de NutritionTabs). */
export function fridgePortionsTotal(items: readonly FridgeItem[] | undefined): number {
  return (items ?? []).reduce((sum, f) => sum + f.portionsLeft, 0)
}

/** Portions au frigo pour les écrans de la nutrition qui n'affichent pas le frigo (une lecture par écran). */
export function useFridgePortions(): number {
  return fridgePortionsTotal(useFridge().data)
}
