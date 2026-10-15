// API publique de la couche de données (Dexie). L'UI n'importe que depuis ce fichier.
// `db` brut n'est volontairement pas exporté ; les tests utilisent `./database` directement.

export { DB_SCHEMA_VERSION } from './database'
export { defaultEquipment, defaultNutritionParams, defaultSettings } from './defaults'
export {
  ValidationError,
  addMeasurement,
  completeOnboarding,
  deleteMeasurement,
  deleteWeighIn,
  getEquipment,
  getProfile,
  getSettings,
  listMeasurements,
  listWeighIns,
  observe,
  requestPersistentStorage,
  saveEquipment,
  saveProfile,
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
  checkCoachUrl,
  checkEquipment,
  checkMeasurement,
  checkProfile,
  checkProfileIdentity,
  checkSettings,
  checkWeeklySessions,
  checkWeighIn,
} from './validation'
