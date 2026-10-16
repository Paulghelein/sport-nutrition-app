import { undoRecipeEntries } from '../../db'
import type { FoodLogEntry, FridgeItem } from '../../types'
import { journalPath } from '../routes'
import { portionsText } from './format'
import type { NoticeState } from './partsV2'

/**
 * « 1 portion ajoutée au journal » + Annuler (remet les portions au frigo et retire l'entrée) + lien vers le jour.
 * Commun à la fiche, au frigo et au mode cuisine.
 */
export function loggedNotice(
  entries: FoodLogEntry[],
  fridgeBefore: FridgeItem[],
  servingUnit: string | undefined,
): NoticeState {
  const origin = entries[0]?.origin
  const n = origin?.kind === 'recipe' ? origin.portions : 1
  return {
    message: `Ajouté au journal : ${portionsText(n, servingUnit)}.`,
    to: journalPath(entries[0]?.date ?? ''),
    linkLabel: 'Journal',
    undo: () => undoRecipeEntries(entries, fridgeBefore),
  }
}
