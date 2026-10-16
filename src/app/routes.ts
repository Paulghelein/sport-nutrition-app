// Chemins partagés entre App.tsx et les écrans (évite d'importer App depuis un écran lazy).

/** Accueil : écran Aujourd'hui. */
export const HOME_PATH = '/'

/** Écran Entraînement (ancien « Séance ») et sa racine : tous les chemins d'entraînement en dérivent. */
export const TRAINING_PATH = '/entrainement'

/** Aperçu de séance (`?duree=` ou `?modele=`). */
export const PREVIEW_PATH = `${TRAINING_PATH}/apercu`

/** Mode guidé : plein écran, hors de la barre d'onglets. */
export const GUIDED_PATH = `${TRAINING_PATH}/seance`

export const NUTRITION_PATH = '/nutrition'
export const PROGRESS_PATH = '/progres'
export const SETTINGS_PATH = '/reglages'

/** Mode cuisine d'une recette : plein écran, hors de la barre d'onglets. */
export const COOK_PATH_PATTERN = /^\/nutrition\/recettes\/[^/]+\/cuisine\/?$/

/** Coller et appliquer une réponse de Claude (J9). */
export const CLAUDE_RESPONSE_PATH = '/claude/reponse'

/** Page de composants v2 (outil de développement), plein écran hors de la barre d'onglets. */
export const DEV_UI_PATH = '/dev/ui'

/** Sous-sections de l'entraînement (bibliothèque, historique, modèles, récapitulatif). */
export const LIBRARY_PATH = `${TRAINING_PATH}/exercices`
export const HISTORY_PATH = `${TRAINING_PATH}/historique`
export const TEMPLATES_PATH = `${TRAINING_PATH}/modeles`
export const RECAP_PATH = `${TRAINING_PATH}/recap`

/** R3 — F4 : recette par scan (caméra en continu, brouillon conservé). */
export const RECIPE_SCAN_PATH = `${NUTRITION_PATH}/recette-scan`

/** R3 — F5 : recette d'une vidéo (lien TikTok / Reels → message pour Claude). */
export const VIDEO_RECIPE_PATH = `${NUTRITION_PATH}/recette-video`

/** R3 : Recettes, fiche, mode cuisine, frigo et courses (onglets de la nutrition). */
export const RECIPES_PATH = `${NUTRITION_PATH}/recettes`
export const NEW_RECIPE_PATH = `${RECIPES_PATH}/nouvelle`
export const FRIDGE_PATH = `${NUTRITION_PATH}/frigo`
export const SHOPPING_PATH = `${NUTRITION_PATH}/courses`
export const recipePath = (id: string): string => `${RECIPES_PATH}/${id}`
export const cookPath = (id: string): string => `${RECIPES_PATH}/${id}/cuisine`
export const editRecipePath = (id: string): string => `${RECIPES_PATH}/${id}/modifier`
/** Journal d'un jour donné. */
export const journalPath = (date: string): string => `${NUTRITION_PATH}?date=${date}`
