// Base Dexie unique de l'app (SPEC §5). Toute modification du schéma = nouvelle version + migration.
import Dexie from 'dexie'
import type { EntityTable } from 'dexie'
import type { CiqualFood, TableRows } from '../types'

export const DB_NAME = 'forge'
/** Version courante du schéma ; écrite dans les sauvegardes (`BackupFile.schemaVersion`). */
export const DB_SCHEMA_VERSION = 2

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
  /** Données de référence Ciqual (v2) : hors `TableRows` / `TABLE_NAMES`, donc hors sauvegarde. */
  ciqual!: EntityTable<CiqualFood, 'id'>

  constructor(name: string = DB_NAME) {
    super(name)
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
    // Version 2 (J4 + J5) : ajoute la table `ciqual`. Les nouveaux champs de Session, Exercise, Settings et
    // NutritionParams sont optionnels : aucune donnée existante à transformer, donc pas d'`upgrade()`.
    // Dexie reprend les tables de la version 1 et n'a besoin que de celles qui changent.
    this.version(2).stores({
      ciqual: 'id',
    })
  }
}

/** Singleton utilisé par les repositories. */
export const db = new AppDB()

/** Base isolée (nom distinct) pour les tests. */
export function openTestDb(name: string): AppDB {
  return new AppDB(name)
}
