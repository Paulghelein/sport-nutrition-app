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
