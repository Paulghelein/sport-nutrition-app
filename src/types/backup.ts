// Tables de la base et fichier de sauvegarde (SPEC §5).
import type { IsoDateTime } from './common'
import type { FoodLogEntry, Food, FridgeItem, Recipe, ShoppingList } from './nutrition'
import type { Equipment, Measurement, Profile, WeighIn } from './profile'
import type { Settings } from './settings'
import type { Exercise, ExercisePref, ExerciseState, Session, SessionTemplate } from './training'

/** Ligne de chaque table Dexie. L'ordre des clés est l'ordre d'export. */
export interface TableRows {
  profile: Profile
  weighIns: WeighIn
  measurements: Measurement
  equipment: Equipment
  exercises: Exercise
  exercisePrefs: ExercisePref
  exerciseState: ExerciseState
  sessions: Session
  sessionTemplates: SessionTemplate
  foods: Food
  recipes: Recipe
  fridge: FridgeItem
  foodLog: FoodLogEntry
  shoppingLists: ShoppingList
  settings: Settings
}

export type TableName = keyof TableRows

export const TABLE_NAMES = [
  'profile',
  'weighIns',
  'measurements',
  'equipment',
  'exercises',
  'exercisePrefs',
  'exerciseState',
  'sessions',
  'sessionTemplates',
  'foods',
  'recipes',
  'fridge',
  'foodLog',
  'shoppingLists',
  'settings',
] as const satisfies readonly TableName[]

/** Fichier `forge-sauvegarde-YYYY-MM-DD.json`. `schemaVersion` = version Dexie au moment de l'export. */
export interface BackupFile {
  app: 'forge'
  schemaVersion: number
  exportedAt: IsoDateTime
  tables: { [K in TableName]: TableRows[K][] }
}

/**
 * `replace` : vide toutes les tables puis écrit le fichier.
 * `merge` : écrit chaque ligne par clé primaire (la ligne du fichier remplace celle de même clé),
 * les lignes absentes du fichier sont conservées.
 */
export type ImportMode = 'replace' | 'merge'

export interface ImportReport {
  mode: ImportMode
  /** Nombre de lignes écrites par table. */
  counts: Record<TableName, number>
}
