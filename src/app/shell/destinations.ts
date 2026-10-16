import type { MealSlot } from '../../types'
import type { LogAction } from '../../ui/kit'
import {
  CLAUDE_RESPONSE_PATH,
  NUTRITION_PATH,
  PROGRESS_PATH,
  RECIPE_SCAN_PATH,
  SETTINGS_PATH,
  VIDEO_RECIPE_PATH,
} from '../routes'

/** Destination d'une action de la feuille pour un repas donné (`null` : action qui n'est pas une simple navigation). */
export function destinationFor(action: LogAction, meal: MealSlot): string | null {
  const q = `?repas=${meal}`
  switch (action) {
    case 'scan':
      return `${NUTRITION_PATH}/scanner${q}`
    case 'search':
      return `${NUTRITION_PATH}/ajouter${q}`
    case 'recipe-or-fridge':
      return `${NUTRITION_PATH}/ajouter${q}&ouvrir=recette`
    case 'quick-entry':
      return `${NUTRITION_PATH}/ajouter${q}&ouvrir=libre`
    case 'describe-to-claude':
      return `${NUTRITION_PATH}?claude=1`
    case 'recipe-from-scan':
      return RECIPE_SCAN_PATH
    case 'recipe-from-video':
      return VIDEO_RECIPE_PATH
    // « Nouvelle recette » / « Nouvel aliment » : plus dans la feuille depuis R3 (création depuis Recettes et
    // l'écran Ajouter), destinations gardées pour les appelants éventuels.
    case 'recipe-new':
      return `${NUTRITION_PATH}/recettes/nouvelle`
    case 'food-new':
      return `${NUTRITION_PATH}/aliments/nouveau`
    case 'claude-response':
      return CLAUDE_RESPONSE_PATH
    case 'import-recipe':
      return `${SETTINGS_PATH}/importer`
    case 'measurements':
      return `${PROGRESS_PATH}#mensurations`
    default:
      return null
  }
}
