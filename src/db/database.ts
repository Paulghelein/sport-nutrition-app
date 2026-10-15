// Base Dexie unique de l'app (SPEC §5). Toute modification du schéma = nouvelle version + migration.
import Dexie from 'dexie'
import type { EntityTable } from 'dexie'
import type { CiqualFood, TableRows } from '../types'

export const DB_NAME = 'forge'
/** Version courante du schéma ; écrite dans les sauvegardes (`BackupFile.schemaVersion`). */
export const DB_SCHEMA_VERSION = 2

/**
 * Instantané de migration (v1 → v2) : exercices de départ qui portent un drapeau depuis J4. Une surcharge `seed`
 * enregistrée avant J4 remplace tout l'exercice et en perd le drapeau ; la migration le repose s'il est absent.
 * Liste figée volontairement (n'importe pas src/content, trop lourd pour le démarrage) : ne pas la faire évoluer.
 */
export const V2_SEED_FLAGS: Readonly<Record<string, 'finisher' | 'learnUnloaded'>> = {
  'two-hand-swing': 'finisher',
  'one-hand-swing': 'finisher',
  'farmer-carry': 'finisher',
  'suitcase-carry': 'finisher',
  'rack-carry': 'finisher',
  'turkish-get-up': 'learnUnloaded',
}

/** Pose le drapeau v2 manquant sur une ligne `exercises` de source `seed` ; renvoie `true` si elle a changé. */
export function applyV2SeedFlag(row: unknown): boolean {
  if (typeof row !== 'object' || row === null) return false
  const r = row as Record<string, unknown>
  if (r.source !== 'seed' || typeof r.id !== 'string') return false
  const flag = Object.hasOwn(V2_SEED_FLAGS, r.id) ? V2_SEED_FLAGS[r.id] : undefined
  if (flag === undefined || r[flag] !== undefined) return false
  r[flag] = true
  return true
}

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
    // Version 2 (J4 + J5) : ajoute la table `ciqual`. Les nouveaux champs de Session, Settings et NutritionParams
    // sont optionnels. Seule transformation : les surcharges `seed` d'exercices à drapeau (V2_SEED_FLAGS) reçoivent
    // le drapeau manquant. Dexie reprend les tables de la version 1 ; seules celles qui changent sont listées.
    this.version(2)
      .stores({
        ciqual: 'id',
      })
      .upgrade((tx) =>
        tx
          .table('exercises')
          .toCollection()
          .modify((row: unknown) => {
            applyV2SeedFlag(row)
          }),
      )
  }
}

/** Singleton utilisé par les repositories. */
export const db = new AppDB()

/** Base isolée (nom distinct) pour les tests. */
export function openTestDb(name: string): AppDB {
  return new AppDB(name)
}
