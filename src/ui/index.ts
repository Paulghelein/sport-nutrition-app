export { useLiveQuery } from './useLiveQuery'
export type { LiveQueryState } from './useLiveQuery'
export {
  activityLabel,
  equipmentChoices,
  equipmentLabel,
  goalLabel,
  levelLabel,
  levels,
  loadTypeLabel,
  loadTypes,
  muscleLabel,
  muscles,
  patternLabel,
  patterns,
  preferenceLabel,
  preferences,
  sexLabel,
} from './choices'
export {
  draftToEquipment,
  draftToProfile,
  equipmentToDraft,
  isGoalsFilled,
  isIdentityFilled,
  newProfileDraft,
  ownableEquipment,
  profileToDraft,
} from './drafts'
export type { EquipmentDraft, ProfileDraft } from './drafts'
export {
  errorMessage,
  formatDateTimeFr,
  formatKg,
  formatSignedKg,
  parseDecimal,
  toInputNumber,
} from './format'
export { ErrorBoundary } from './ErrorBoundary'
// exerciseDraft n'est volontairement pas réexporté ici : il tire le catalogue d'entraînement dans le démarrage.
// Les écrans de la bibliothèque l'importent directement (`ui/exerciseDraft`).
