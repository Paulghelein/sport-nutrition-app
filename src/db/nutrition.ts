// Alimentation (J5) : table Ciqual de référence, aliments, journal, objectifs.
// Les macros d'une entrée du journal sont figées : cette couche ne les recalcule jamais.
import { SINGLETON_ID } from '../types'
import type {
  CiqualFood,
  Food,
  FoodInput,
  FoodLogEntry,
  Id,
  IsoDateTime,
  LocalDate,
  NutritionParams,
  Profile,
} from '../types'
import { daysBetween, isValidLocalDate } from '../domain/shared/dates'
import { db } from './database'
import { defaultSettings } from './defaults'
import { fail, newId, nowIso } from './helpers'
import { ValidationError, getSettings } from './repositories'
import { foodLogEntrySchema, foodSchema, profileSchema } from './schemas'
import { checkFoodInput, checkLogEntry, checkNutritionParams } from './validation'

// ---------- Ciqual (données de référence, hors sauvegarde) ----------

export async function getCiqualVersion(): Promise<string | undefined> {
  return (await getSettings()).ciqualVersion
}

/**
 * Remplace toute la table `ciqual` et note la version dans les réglages, en une transaction.
 * Les lignes ne sont pas revalidées une à une (fichier généré et embarqué) : `bulkPut` seul reste rapide pour ~3 000 lignes.
 */
export async function replaceCiqual(
  version: string,
  foods: CiqualFood[],
  now: IsoDateTime = nowIso(),
): Promise<void> {
  if (version.trim().length === 0) throw new ValidationError('Version Ciqual invalide.')
  await db.transaction('rw', [db.ciqual, db.settings], async () => {
    await db.ciqual.clear()
    await db.ciqual.bulkPut(foods)
    const settings = (await db.settings.get(SINGLETON_ID)) ?? defaultSettings(now)
    await db.settings.put({ ...settings, ciqualVersion: version, updatedAt: now })
  })
}

/** Nombre de lignes de la table `ciqual` (0 alors qu'une version est enregistrée = table à recharger). */
export async function countCiqualFoods(): Promise<number> {
  return db.ciqual.count()
}

export async function listCiqualFoods(): Promise<CiqualFood[]> {
  return db.ciqual.toArray()
}

export async function getCiqualFood(id: Id): Promise<CiqualFood | undefined> {
  return db.ciqual.get(id)
}

// ---------- Aliments ----------

/** Lignes de la table `foods` : aliments perso, OFF et surcharges Ciqual (même id que la table `ciqual`). */
export async function listFoodRows(): Promise<Food[]> {
  return db.foods.toArray()
}

export async function getFoodRow(id: Id): Promise<Food | undefined> {
  return db.foods.get(id)
}

/** Applique les champs saisis (chaînes trimées, champs vides retirés) sur un aliment. */
function applyFoodInput(base: Food, input: FoodInput, now: IsoDateTime): Food {
  fail(checkFoodInput(input))
  const row: Food = {
    ...base,
    name: input.name.trim(),
    per100g: { ...input.per100g },
    updatedAt: now,
  }
  delete row.brand
  delete row.defaultPortionG
  delete row.aisle
  const brand = input.brand?.trim()
  if (brand) row.brand = brand
  if (input.defaultPortionG !== undefined) row.defaultPortionG = input.defaultPortionG
  if (input.aisle !== undefined) row.aisle = input.aisle
  if (!foodSchema.safeParse(row).success)
    throw new ValidationError('Aliment invalide : vérifie les champs saisis.')
  return row
}

function sameFoodContent(a: Food, b: Food): boolean {
  const key = (f: Food) =>
    JSON.stringify([
      f.name,
      f.brand ?? null,
      f.defaultPortionG ?? null,
      f.aisle ?? null,
      [f.per100g.kcal, f.per100g.protein, f.per100g.carbs, f.per100g.fat, f.per100g.fiber ?? null],
    ])
  return key(a) === key(b)
}

/** Crée un aliment personnel (UUID, `source: 'user'`, non favori). */
export async function createFood(input: FoodInput, now: IsoDateTime = nowIso()): Promise<Food> {
  const row = applyFoodInput(
    { id: newId(), name: '', source: 'user', per100g: input.per100g, favorite: false, updatedAt: now },
    input,
    now,
  )
  await db.foods.add(row)
  return row
}

/**
 * Aliment personnel ou OFF : met à jour la ligne. Aliment Ciqual : écrit ou met à jour la surcharge (même id).
 * Sans changement de contenu, n'écrit rien et renvoie `current`.
 */
export async function updateFood(
  current: Food,
  input: FoodInput,
  now: IsoDateTime = nowIso(),
): Promise<Food> {
  const row = applyFoodInput(current, input, now)
  if (sameFoodContent(current, row)) return current
  return db.transaction('rw', db.foods, async () => {
    if (current.source !== 'ciqual' && !(await db.foods.get(current.id))) {
      throw new ValidationError('Aliment introuvable.')
    }
    await db.foods.put(row)
    return row
  })
}

/**
 * Change le favori ; un aliment Ciqual sans surcharge en reçoit une (copie complète de l'aliment).
 * Conséquence acceptée : la surcharge fige les valeurs Ciqual de l'aliment (une mise à jour ultérieure de la table
 * Ciqual ne les modifie plus ; `restoreCiqualFood` rétablit l'original).
 */
export async function setFoodFavorite(
  food: Food,
  favorite: boolean,
  now: IsoDateTime = nowIso(),
): Promise<Food> {
  return db.transaction('rw', db.foods, async () => {
    const existing = await db.foods.get(food.id)
    if (existing) {
      if (existing.favorite === favorite) return existing
      const next = { ...existing, favorite, updatedAt: now }
      await db.foods.put(next)
      return next
    }
    if (food.source !== 'ciqual') throw new ValidationError('Aliment introuvable.')
    // Pas de surcharge à créer pour retirer un favori qui n'existe pas.
    if (food.favorite === favorite) return food
    const next: Food = { ...food, favorite, updatedAt: now }
    await db.foods.put(next)
    return next
  })
}

/**
 * Supprime un aliment personnel ou OFF. Les entrées du journal gardent leurs macros figées.
 * Un aliment Ciqual ne se supprime pas : `restoreCiqualFood` retire sa surcharge.
 */
export async function deleteFood(food: Food): Promise<void> {
  if (food.source === 'ciqual') {
    throw new ValidationError('Un aliment Ciqual ne peut pas être supprimé ; rétablis l’original à la place.')
  }
  await db.foods.delete(food.id)
}

/**
 * Supprime la surcharge d'un aliment Ciqual (rétablit l'original). Avec `keepFavorite`, si la surcharge était
 * favorite et que l'aliment existe dans la table `ciqual`, une ligne minimale favorite (valeurs Ciqual d'origine) est réécrite.
 */
export async function restoreCiqualFood(
  id: Id,
  opts: { keepFavorite?: boolean } = {},
  now: IsoDateTime = nowIso(),
): Promise<void> {
  await db.transaction('rw', [db.foods, db.ciqual], async () => {
    const row = await db.foods.get(id)
    if (row?.source !== 'ciqual') return
    await db.foods.delete(id)
    if (opts.keepFavorite === true && row.favorite) {
      const original = await db.ciqual.get(id)
      if (original) {
        await db.foods.put({
          id,
          name: original.name,
          source: 'ciqual',
          ciqualCode: original.code,
          per100g: { ...original.per100g },
          favorite: true,
          updatedAt: now,
        })
      }
    }
  })
}

// ---------- Journal ----------

function sortLog(rows: FoodLogEntry[]): FoodLogEntry[] {
  return rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )
}

export async function listLogForDate(date: LocalDate): Promise<FoodLogEntry[]> {
  return sortLog(await db.foodLog.where('date').equals(date).toArray())
}

/** Entrées entre `from` et `to`, bornes incluses. */
export async function listLogBetween(from: LocalDate, to: LocalDate): Promise<FoodLogEntry[]> {
  return sortLog(await db.foodLog.where('date').between(from, to, true, true).toArray())
}

function validateLogEntry(entry: FoodLogEntry): FoodLogEntry {
  const row: FoodLogEntry = { ...entry, name: entry.name.trim() }
  if (!foodLogEntrySchema.safeParse(row).success) {
    throw new ValidationError('Entrée du journal invalide : vérifie les champs saisis.')
  }
  fail(checkLogEntry(row))
  return row
}

/** Ajoute les entrées en une transaction (tout ou rien). Les macros sont enregistrées telles quelles. */
export async function addLogEntries(entries: FoodLogEntry[]): Promise<FoodLogEntry[]> {
  const rows = entries.map(validateLogEntry)
  if (new Set(rows.map((r) => r.id)).size !== rows.length) {
    throw new ValidationError('Identifiant d’entrée en double.')
  }
  await db.transaction('rw', db.foodLog, async () => {
    const existing = await db.foodLog.bulkGet(rows.map((r) => r.id))
    if (existing.some((e) => e !== undefined)) throw new ValidationError('Cette entrée existe déjà.')
    await db.foodLog.bulkAdd(rows)
  })
  return rows
}

/** Remplace l'entrée (quantité, repas, macros éditées par l'utilisateur) ; `createdAt` d'origine conservé. */
export async function updateLogEntry(entry: FoodLogEntry): Promise<FoodLogEntry> {
  const row = validateLogEntry(entry)
  return db.transaction('rw', db.foodLog, async () => {
    const current = await db.foodLog.get(row.id)
    if (!current) throw new ValidationError('Entrée introuvable.')
    const next = { ...row, createdAt: current.createdAt }
    await db.foodLog.put(next)
    return next
  })
}

export async function deleteLogEntry(id: Id): Promise<void> {
  await db.foodLog.delete(id)
}

// ---------- Objectifs ----------

function writeNutrition(profile: Profile, nutrition: NutritionParams, now: IsoDateTime): Profile {
  fail(checkNutritionParams(nutrition))
  const next: Profile = { ...profile, nutrition, updatedAt: now }
  if (!profileSchema.safeParse(next).success) throw new ValidationError('Objectifs invalides.')
  return next
}

/** Modifie les paramètres d'objectifs (fusion transactionnelle + bornes). Une valeur `undefined` est ignorée. */
export async function updateNutritionParams(
  patch: Partial<NutritionParams>,
  now: IsoDateTime = nowIso(),
): Promise<Profile> {
  return db.transaction('rw', db.profile, async () => {
    const profile = await db.profile.get(SINGLETON_ID)
    if (!profile) throw new ValidationError('Profil introuvable.')
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
    const next = writeNutrition(profile, { ...profile.nutrition, ...defined }, now)
    await db.profile.put(next)
    return next
  })
}

/** Accepte la proposition d'ajustement : `kcalAdjustment += kcal`, `kcalAdjustedOn = on`. */
export async function acceptKcalSuggestion(
  kcal: number,
  on: LocalDate,
  now: IsoDateTime = nowIso(),
): Promise<Profile> {
  if (!Number.isFinite(kcal)) throw new ValidationError('Ajustement invalide.')
  return db.transaction('rw', db.profile, async () => {
    const profile = await db.profile.get(SINGLETON_ID)
    if (!profile) throw new ValidationError('Profil introuvable.')
    const last = profile.nutrition.kcalAdjustedOn
    if (last !== undefined && isValidLocalDate(last) && daysBetween(last, on) < 21) {
      throw new ValidationError('Ajustement déjà appliqué récemment.')
    }
    const next = writeNutrition(
      profile,
      {
        ...profile.nutrition,
        kcalAdjustment: profile.nutrition.kcalAdjustment + kcal,
        kcalAdjustedOn: on,
      },
      now,
    )
    await db.profile.put(next)
    return next
  })
}
