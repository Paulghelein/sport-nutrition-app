// Base Dexie unique de l'app (SPEC §5). Toute modification du schéma = nouvelle version + migration.
import Dexie from 'dexie'
import type { EntityTable } from 'dexie'
import type { TableRows } from '../types'

export const DB_NAME = 'forge'
/** Version courante du schéma ; écrite dans les sauvegardes (`BackupFile.schemaVersion`). */
export const DB_SCHEMA_VERSION = 1

export class AppDB extends Dexie {
  profile!: EntityTable<TableRows['profile'], 'id'>
  weighIns!: EntityTable<TableRows['weighIns'], 'id'>
  measurements!: EntityTable<TableRows['measurements'], 'id'>
  equipment!: EntityTable<TableRows['equipment'], 'id'>
  exercises!: EntityTable<TableRows['exercises'], 'id'>
  exercisePrefs!: EntityTable<TableRows['exercisePrefs'], 'exerciseId'>
  exerciseState!: EntityTable<TableRows['exerciseState'], 'exerciseId'>
  sessions!: EntityTable<TableRows['sessions'], 'id'>
  sessionTemplates!: EntityTable<TableRows['sessionTemplates'], 'id'>
  foods!: EntityTable<TableRows['foods'], 'id'>
  recipes!: EntityTable<TableRows['recipes'], 'id'>
  fridge!: EntityTable<TableRows['fridge'], 'id'>
  foodLog!: EntityTable<TableRows['foodLog'], 'id'>
  shoppingLists!: EntityTable<TableRows['shoppingLists'], 'id'>
  settings!: EntityTable<TableRows['settings'], 'id'>

  constructor(name: string = DB_NAME) {
    super(name)
    // Version 1. Pour la suivante : this.version(2).stores({...}).upgrade(tx => ...)
    this.version(1).stores({
      profile: 'id',
      weighIns: 'id, &date',
      measurements: 'id, date',
      equipment: 'id',
      exercises: 'id, source',
      exercisePrefs: 'exerciseId',
      exerciseState: 'exerciseId',
      sessions: 'id, date, status',
      sessionTemplates: 'id',
      foods: 'id, source, ciqualCode, ean, favorite, lastUsedAt',
      recipes: 'id, source',
      fridge: 'id, recipeId',
      foodLog: 'id, date, [date+slot]',
      shoppingLists: 'id',
      settings: 'id',
    })
  }
}

/** Singleton utilisé par les repositories. */
export const db = new AppDB()

/** Base isolée (nom distinct) pour les tests. */
export function openTestDb(name: string): AppDB {
  return new AppDB(name)
}
