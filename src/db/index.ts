// API publique de la couche de données (Dexie). L'UI n'importe que depuis ce fichier.
// `db` brut n'est volontairement pas exporté ; les tests utilisent `./database` directement.

export { DB_SCHEMA_VERSION } from './database'
export { defaultEquipment, defaultNutritionParams, defaultSettings } from './defaults'
export {
  ValidationError,
  addMeasurement,
  completeOnboarding,
  createExercise,
  deleteExercise,
  deleteMeasurement,
  deleteWeighIn,
  getEquipment,
  getProfile,
  getSettings,
  listExercisePrefs,
  listExerciseRows,
  listMeasurements,
  listWeighIns,
  observe,
  requestPersistentStorage,
  restoreExercise,
  saveEquipment,
  saveProfile,
  setExercisePreference,
  updateExercise,
  updateMeasurement,
  updateSettings,
  updateWeighIn,
  upsertWeighIn,
} from './repositories'
export type {
  MeasurementInput,
  MeasurementPatch,
  OnboardingInput,
  SettingsPatch,
  WeighInInput,
  WeighInPatch,
} from './repositories'
export {
  backupFileName,
  exportBackup,
  importBackup,
  markExported,
  migrateBackup,
  parseBackup,
} from './backup'
export type { ParseResult, RawBackup, TableCounts } from './backup'
export {
  MAX_DURATION_SEC,
  MAX_EXERCISE_NAME_LENGTH,
  MAX_PROGRESSION_CRITERIA_LENGTH,
  MAX_REPS,
  MAX_REST_SEC,
  MAX_SETUP_LENGTH,
  MAX_TECHNIQUE_LINE_LENGTH,
  MAX_TECHNIQUE_LINES,
  MAX_VIDEO_URL_LENGTH,
  MIN_DURATION_SEC,
  MIN_REPS,
  MIN_REST_SEC,
  checkCoachUrl,
  checkEquipment,
  checkExercise,
  checkMeasurement,
  checkProfile,
  checkProfileIdentity,
  checkSettings,
  checkWeeklySessions,
  checkWeighIn,
} from './validation'
