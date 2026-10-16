// Bouton « Demander à Claude » (J9, SPEC §10) : messages de contexte envoyés par copier-coller et éléments de
// réponse propres à l'entraînement. Les recettes et repas réutilisent l'import JSON (src/types/recipes.ts).
import type { Id, LocalDate } from './common'
import type { ExerciseInput, ExercisePreference, SessionDuration, TemplateBlock } from './training'

// ---------- Envoi (§10.1) ----------

/** Écran d'où part la demande ; détermine le contexte joint au message. */
export type ClaudeContextKind =
  | 'journal'
  | 'session_before'
  | 'session_after'
  | 'recipe'
  | 'progress'
  | 'review'

/**
 * Message prêt à copier : contexte compact (profil résumé, objectifs, données de l'écran en JSON) + demande saisie
 * + rappel du format de réponse. Construit par une fonction pure de src/domain/claude/ ; l'utilisateur le voit avant
 * de le copier (§10.4). Pas de pré-remplissage par URL : `claude.ai/new?q=` n'est pas documenté, a déjà cessé de
 * fonctionner, peut envoyer seul le message et les contextes dépassent la longueur utile d'une URL.
 */
export interface ClaudeMessage {
  kind: ClaudeContextKind
  text: string
}

/** URL ouverte quand le Projet « Coach » n'est pas réglé (`Settings.coachUrl === null`). */
export const CLAUDE_DEFAULT_URL = 'https://claude.ai/new'

/** « Faire évoluer l'app » (§10.3). */
export const CLAUDE_CODE_URL = 'https://claude.ai/code'

// ---------- Retour (§10.2) : éléments propres à J9 ----------

/**
 * Ligne d'une séance proposée par Claude, au format d'un modèle (`TemplateBlock`), pour réutiliser
 * `planFromTemplate`. `newExerciseIndex` : l'`exerciseId` reçu désigne par son nom un objet `exercise` de la même
 * réponse (index dans le tableau source) ; l'id réel est substitué après création de l'exercice.
 */
export interface ImportedPlanBlock extends TemplateBlock {
  newExerciseIndex?: number
}

/**
 * Séance modifiée (IMPORT_FORMAT.md, `sessionPlan`) : remplace la séance proposée du jour. Appliquer = enregistrer
 * le modèle unique `CLAUDE_TEMPLATE_ID` (écrasé à chaque fois) puis ouvrir son aperçu, où l'utilisateur peut encore
 * la modifier avant « Commencer ». Les lignes dont l'exercice est inconnu sont écartées (avertissement).
 */
export interface ImportedSessionPlan {
  durationMin: SessionDuration
  blocks: ImportedPlanBlock[]
  /** Ids reçus qui ne correspondent ni à un exercice de l'app ni à un `exercise` de la réponse. */
  unknownExerciseIds: string[]
}

/** Modèle de séance réservé à la dernière séance appliquée depuis Claude. */
export const CLAUDE_TEMPLATE_ID = 'claude-plan'

/** Préférence d'exercice reçue (`exercisePreference`) ; l'exercice existe (vérifié à l'aperçu). */
export interface ImportedExercisePreference {
  exerciseId: Id
  preference: ExercisePreference
  reason?: string
}

/** Résumé de ce qui a été appliqué, pour le message de fin. */
export interface ClaudeApplyOutcome {
  recipesCreated: number
  mealsLogged: number
  exercisesCreated: number
  preferencesSet: number
  /** Présent si une séance a été appliquée : date du jour concerné. */
  sessionPlanFor?: LocalDate
}

/** Exercice personnel reçu (`exercise`), converti en `ExerciseInput` (valeurs par défaut complétées). */
export type ImportedExercise = ExerciseInput
