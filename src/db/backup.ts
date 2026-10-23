// Export / import de la sauvegarde JSON (SPEC §5).
import { addDays, toLocalDate } from '../domain/shared/dates'
import { SINGLETON_ID, TABLE_NAMES } from '../types'
import { z } from 'zod'
import type {
  BackupFile,
  BackupPhoto,
  ImportMode,
  ImportReport,
  IsoDateTime,
  LocalDate,
  PhotoMime,
  TableName,
  TableRows,
} from '../types'
import { shoppingKey } from '../domain/nutrition/shopping'
import { MAX_PHOTO_BYTES, PHOTO_MIMES } from '../domain/nutrition/limits'
import { DB_SCHEMA_VERSION, applyV2SeedFlag, db } from './database'
import { weekStartOf } from '../domain/progress/regularity'
import { defaultSettings } from './defaults'
import { updateSettings } from './repositories'
import { primaryKeys, rowSchemas } from './schemas'
import {
  checkEquipment,
  checkExercise,
  checkFoodInput,
  checkLogEntry,
  checkMeasurement,
  checkProfile,
  checkSessionRow,
  checkSettings,
  checkWeekStart,
  checkWeighIn,
  validateFridgeItem,
  validateRecipeInput,
  validateShoppingList,
} from './validation'

const MAX_ERRORS = 10

export type TableCounts = Record<TableName, number>

/** Tables sauvegardées (la table de référence `ciqual` n'en fait pas partie). */
function backupTables() {
  return TABLE_NAMES.map((name) => db.table(name))
}

function emptyCounts(): TableCounts {
  return Object.fromEntries(TABLE_NAMES.map((t) => [t, 0])) as TableCounts
}

// ---------- Photos (v3) : ArrayBuffer <-> base64 portable (navigateur, jsdom, Node) ----------

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

/** Copie dans un `ArrayBuffer` autonome (la vue peut partager un tampon plus grand). */
function bytesToBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

/** Taille décodée d'une chaîne base64 valide (sans la décoder). */
function decodedSize(base64: string): number {
  const pad = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return (base64.length / 4) * 3 - pad
}

const backupPhotoSchema = z.strictObject({
  foodId: z.string().min(1),
  mime: z.custom<PhotoMime>((v) => (PHOTO_MIMES as readonly unknown[]).includes(v), {
    error: 'format non pris en charge',
  }),
  base64: z
    .string()
    .min(4)
    .refine((b) => BASE64_PATTERN.test(b), { error: 'base64 invalide' })
    .refine((b) => decodedSize(b) <= MAX_PHOTO_BYTES, { error: 'photo trop lourde (300 ko maximum)' }),
  fetchedAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)) && /^\d{4}-\d{2}-\d{2}T/.test(s), {
    error: 'date-heure invalide',
  }),
})

/**
 * Lit toutes les tables (et les photos) dans une transaction de lecture cohérente. Seules des lectures Dexie ont lieu
 * dans la transaction (aucun await non-Dexie) ; l'encodage base64 se fait après. Les photos dont l'aliment n'existe plus sont ignorées (le fichier reste réimportable).
 */
export async function exportBackup(now: IsoDateTime): Promise<BackupFile> {
  const { entries, photoRows } = await db.transaction('r', [...backupTables(), db.foodPhotos], async () => {
    const entries = await Promise.all(
      TABLE_NAMES.map(async (name) => [name, await db.table(name).toArray()] as const),
    )
    const photoRows = await db.foodPhotos.toArray()
    return { entries, photoRows }
  })
  const tables = Object.fromEntries(entries) as BackupFile['tables']
  const foodIds = new Set(tables.foods.map((f) => f.id))
  const photos: BackupPhoto[] = []
  for (const p of photoRows) {
    if (!foodIds.has(p.foodId)) continue
    photos.push({
      foodId: p.foodId,
      mime: p.mime,
      base64: bytesToBase64(new Uint8Array(p.bytes)),
      fetchedAt: p.fetchedAt,
    })
  }
  return { app: 'forge', schemaVersion: DB_SCHEMA_VERSION, exportedAt: now, tables, photos }
}

/** À appeler par l'UI après un partage réussi (met à jour le rappel hebdomadaire). */
export async function markExported(now: IsoDateTime): Promise<void> {
  await updateSettings({ lastExportAt: now }, now)
}

/** Nom du fichier, daté du jour local de l'export. */
export function backupFileName(now: IsoDateTime): string {
  return `forge-sauvegarde-${toLocalDate(new Date(now))}.json`
}

/** Contenu brut d'une sauvegarde avant validation des lignes. */
export interface RawBackup {
  app: string
  schemaVersion: number
  exportedAt: string
  tables: Record<string, unknown>
  /** v3 : photos (validées par `parseBackup`). */
  photos?: unknown
}

/**
 * Sauvegardes écrites avant J6 : les articles de courses n'avaient pas de `key`. Elle est recalculée comme à la
 * génération (`shoppingKey`) pour que « régénérer » conserve les coches ; un article ajouté à la main reçoit `manual:<id>`.
 */
function fillShoppingKeys(raw: RawBackup): RawBackup {
  const lists = raw.tables.shoppingLists
  if (!Array.isArray(lists)) return raw
  const fix = (list: unknown): unknown => {
    if (typeof list !== 'object' || list === null) return list
    const l = list as Record<string, unknown>
    if (!Array.isArray(l.items)) return list
    const items = l.items.map((item: unknown) => {
      if (typeof item !== 'object' || item === null) return item
      const i = item as Record<string, unknown>
      if (i.key !== undefined || typeof i.name !== 'string') return item
      const foodId = typeof i.foodId === 'string' ? i.foodId : undefined
      const key =
        i.manual === true && typeof i.id === 'string'
          ? `manual:${i.id}`
          : shoppingKey({ name: i.name, foodId })
      return { ...i, key }
    })
    return { ...l, items }
  }
  return { ...raw, tables: { ...raw.tables, shoppingLists: lists.map(fix) } }
}

/**
 * Point d'extension : met à niveau une sauvegarde créée par une version antérieure du schéma
 * (appelée AVANT la validation des lignes, avec `schemaVersion` = version du fichier).
 * v2 → v3 : rien à transformer (photos optionnelles, champs optionnels) ; une v1/v2 n'a pas de `photos`.
 * v1 → v2 : pose les drapeaux `finisher` / `learnUnloaded` manquants sur les surcharges `seed` (`V2_SEED_FLAGS`) ;
 * le reste (table `ciqual` hors sauvegarde, champs optionnels) ne demande rien.
 */
export function migrateBackup(input: RawBackup): RawBackup {
  const raw = fillShoppingKeys(input)
  if (raw.schemaVersion >= 2 || !Array.isArray(raw.tables.exercises)) return raw
  // Même règle que l'`upgrade()` Dexie v2 : drapeaux manquants des surcharges `seed` (copie, l'entrée n'est pas modifiée).
  const exercises = raw.tables.exercises.map((row: unknown) => {
    if (typeof row !== 'object' || row === null) return row
    const copy = { ...(row as Record<string, unknown>) }
    return applyV2SeedFlag(copy) ? copy : row
  })
  return { ...raw, tables: { ...raw.tables, exercises } }
}

export type ParseResult =
  { ok: true; backup: BackupFile; summary: TableCounts; photoCount: number } | { ok: false; errors: string[] }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Réglages + semaine de la carte du lundi (lundi valide, pas dans le futur, tolérance d'un jour). */
function checkSettingsRow(s: TableRows['settings'], today: LocalDate): string | null {
  const base = checkSettings(s)
  if (base !== null || s.reviewDismissedWeek === undefined) return base
  const week = checkWeekStart(s.reviewDismissedWeek)
  if (week !== null) return week
  return s.reviewDismissedWeek > weekStartOf(addDays(today, 1))
    ? 'La semaine ne peut pas être dans le futur.'
    : null
}

/** Règles métier (validation.ts) appliquées après la validation structurelle. */
function businessCheck(name: TableName, data: unknown, today: LocalDate): string | null {
  switch (name) {
    case 'profile':
      return checkProfile(data as TableRows['profile'], today)
    case 'weighIns':
      // Tolérance d'un jour : fuseau en avance (voyage). La saisie reste stricte.
      return checkWeighIn(data as TableRows['weighIns'], addDays(today, 1))
    case 'measurements':
      return checkMeasurement(data as TableRows['measurements'], addDays(today, 1))
    case 'equipment':
      return checkEquipment(data as TableRows['equipment'])
    case 'settings':
      return checkSettingsRow(data as TableRows['settings'], today)
    case 'foods':
      return checkFoodInput(data as TableRows['foods'])
    case 'foodLog':
      return checkLogEntry(data as TableRows['foodLog'])
    case 'recipes': {
      // Même exception que les exercices : une surcharge de suppression n'est pas rejouée contre les règles de saisie.
      const row = data as TableRows['recipes']
      return row.deleted === true ? null : validateRecipeInput(row)
    }
    case 'fridge':
      return validateFridgeItem(data as TableRows['fridge'])
    case 'shoppingLists':
      return validateShoppingList(data as TableRows['shoppingLists'])
    case 'sessions':
      return checkSessionRow(data as TableRows['sessions'])
    case 'exercises': {
      // Une surcharge de suppression est une copie de l'original : elle n'est pas rejouée contre les règles de saisie.
      const row = data as TableRows['exercises']
      return row.deleted === true ? null : checkExercise(row)
    }
    default:
      return null
  }
}

/** `today` sert à refuser les pesées et mensurations futures et à calculer l'âge (défaut : jour local courant). */
export function parseBackup(text: string, today: LocalDate = toLocalDate(new Date())): ParseResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['Le fichier n’est pas un JSON valide.'] }
  }
  if (!isRecord(json) || json.app !== 'forge') {
    return { ok: false, errors: ['Ce fichier n’est pas une sauvegarde de Forge.'] }
  }
  const { schemaVersion, exportedAt } = json
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    return { ok: false, errors: ['Version de sauvegarde absente ou invalide.'] }
  }
  if (schemaVersion > DB_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: ['Cette sauvegarde a été créée par une version plus récente de l’app.'],
    }
  }
  if (typeof exportedAt !== 'string' || Number.isNaN(Date.parse(exportedAt))) {
    return { ok: false, errors: ['Date d’export absente ou invalide.'] }
  }
  const rawTables = json.tables === undefined ? {} : json.tables
  if (!isRecord(rawTables)) {
    return { ok: false, errors: ['Le champ « tables » est invalide.'] }
  }

  if (json.photos !== undefined && (schemaVersion < 3 || !Array.isArray(json.photos))) {
    return { ok: false, errors: ['Le champ « photos » est invalide.'] }
  }
  const raw = migrateBackup({
    app: 'forge',
    schemaVersion,
    exportedAt,
    tables: rawTables,
    ...(json.photos !== undefined ? { photos: json.photos } : {}),
  })

  const errors: string[] = []
  const push = (message: string) => {
    if (errors.length < MAX_ERRORS) errors.push(message)
  }
  const tables: Record<string, unknown[]> = {}
  const summary = emptyCounts()

  for (const key of Object.keys(raw.tables)) {
    if (!(TABLE_NAMES as readonly string[]).includes(key)) push(`Table « ${key} » inconnue.`)
  }

  for (const name of TABLE_NAMES) {
    const rows = raw.tables[name]
    if (rows === undefined) {
      tables[name] = []
      continue
    }
    if (!Array.isArray(rows)) {
      push(`Table « ${name} » : une liste est attendue.`)
      continue
    }
    const schema = rowSchemas[name]
    const key = primaryKeys[name]
    const seenKeys = new Set<unknown>()
    const seenDates = new Set<string>()
    const valid: unknown[] = []
    rows.forEach((row, index) => {
      const parsed = schema.safeParse(row)
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          push(`Table « ${name} », ligne ${index + 1}${describeIssue(issue)}.`)
        }
        return
      }
      const rule = businessCheck(name, parsed.data, today)
      if (rule !== null) {
        push(`Table « ${name} », ligne ${index + 1} : ${rule}`)
        return
      }
      const data = parsed.data as unknown as Record<string, unknown>
      const pk = data[key]
      if (seenKeys.has(pk)) {
        push(`Table « ${name} », ligne ${index + 1} : identifiant en double (« ${String(pk)} »).`)
        return
      }
      seenKeys.add(pk)
      if (name === 'weighIns') {
        const date = String(data.date)
        if (seenDates.has(date)) {
          push(`Table « weighIns », ligne ${index + 1} : deux pesées à la même date (${date}).`)
          return
        }
        seenDates.add(date)
      }
      valid.push(data)
    })
    tables[name] = valid
    summary[name] = valid.length
  }

  // Photos : chacune doit se rattacher à un aliment du fichier (un export contient toujours tous les aliments) ;
  // une photo orpheline est une erreur, pas ignorée en silence. Un foodId en double est refusé.
  const photos: BackupPhoto[] = []
  if (Array.isArray(raw.photos)) {
    const foodIds = new Set((tables.foods ?? []).map((f) => (f as { id: string }).id))
    const seenPhotos = new Set<string>()
    raw.photos.forEach((p: unknown, index: number) => {
      const parsed = backupPhotoSchema.safeParse(p)
      if (!parsed.success) {
        for (const issue of parsed.error.issues) push(`Photos, ligne ${index + 1}${describeIssue(issue)}.`)
        return
      }
      if (!foodIds.has(parsed.data.foodId)) {
        push(`Photos, ligne ${index + 1} : aucun aliment du fichier (« ${parsed.data.foodId} »).`)
        return
      }
      if (seenPhotos.has(parsed.data.foodId)) {
        push(`Photos, ligne ${index + 1} : photo en double (« ${parsed.data.foodId} »).`)
        return
      }
      seenPhotos.add(parsed.data.foodId)
      photos.push(parsed.data)
    })
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    backup: {
      app: 'forge',
      schemaVersion: raw.schemaVersion,
      exportedAt: raw.exportedAt,
      tables: tables as unknown as BackupFile['tables'],
      ...(raw.photos !== undefined ? { photos } : {}),
    },
    summary,
    photoCount: photos.length,
  }
}

interface Issue {
  code: string
  path: PropertyKey[]
  message: string
  keys?: string[]
}

function describeIssue(issue: Issue): string {
  const path = issue.path.map(String).join('.')
  const where = path ? ` : champ « ${path} »` : ''
  switch (issue.code) {
    case 'invalid_type':
      return `${where || ' :'} type invalide`
    case 'invalid_value':
    case 'invalid_union':
      return `${where || ' :'} valeur non autorisée`
    case 'unrecognized_keys':
      return `${where || ' :'} champ(s) inconnu(s) « ${(issue.keys ?? []).join(', ')} »`
    case 'too_small':
    case 'too_big':
      return `${where || ' :'} valeur hors limites`
    default:
      return `${where || ' :'} ${issue.message}`
  }
}

/**
 * Importe une sauvegarde déjà validée (`parseBackup`), en une seule transaction.
 * Règle unique (replace et merge) : après écriture, `settings.onboardingCompleted` = « un profil est présent en
 * base ». Des réglages par défaut sont écrits si absents et nécessaires.
 */
export async function importBackup(
  backup: BackupFile,
  mode: ImportMode,
  now: IsoDateTime = new Date().toISOString(),
): Promise<ImportReport> {
  const counts = emptyCounts()
  await db.transaction('rw', [...backupTables(), db.foodPhotos], async () => {
    // La version Ciqual locale décrit la table `ciqual` de CET appareil : jamais reprise du fichier.
    const localSettings = await db.settings.get(SINGLETON_ID)
    const localCiqualVersion = localSettings?.ciqualVersion
    const localReviewWeek = localSettings?.reviewDismissedWeek
    if (mode === 'replace') {
      // La table `ciqual` n'est pas vidée (données de référence).
      await Promise.all([...backupTables(), db.foodPhotos].map((t) => t.clear()))
    } else {
      // weighIns a un index unique sur `date` : une pesée importée à une date déjà prise
      // sous un autre id remplace l'existante.
      const incoming = new Map(backup.tables.weighIns.map((w) => [w.date, w.id]))
      if (incoming.size > 0) {
        const clashes = await db.weighIns
          .where('date')
          .anyOf([...incoming.keys()])
          .toArray()
        const toDelete = clashes.filter((w) => incoming.get(w.date) !== w.id).map((w) => w.id)
        await db.weighIns.bulkDelete(toDelete)
      }
    }
    for (const name of TABLE_NAMES) {
      let rows: unknown[] = backup.tables[name]
      if (name === 'settings') {
        rows = backup.tables.settings.map((row) => {
          const next = { ...row }
          delete next.ciqualVersion
          if (localCiqualVersion !== undefined) next.ciqualVersion = localCiqualVersion
          // Merge : la carte du lundi ne « revient » pas ; on garde la semaine fermée la plus récente.
          if (mode === 'merge' && localReviewWeek !== undefined) {
            const incoming = next.reviewDismissedWeek
            if (incoming === undefined || incoming < localReviewWeek)
              next.reviewDismissedWeek = localReviewWeek
          }
          return next
        })
      }
      if (rows.length > 0) await db.table(name).bulkPut(rows)
      counts[name] = rows.length
    }
    // Photos : un fichier sans `photos` (v1/v2) vide les photos en replace (tous les aliments sont remplacés) et n'y
    // touche pas en merge ; avec `photos`, chaque foodId du fichier est écrit (remplace la photo locale en merge).
    if (backup.photos && backup.photos.length > 0) {
      await db.foodPhotos.bulkPut(
        backup.photos.map((p) => ({
          foodId: p.foodId,
          mime: p.mime,
          bytes: bytesToBuffer(base64ToBytes(p.base64)),
          fetchedAt: p.fetchedAt,
        })),
      )
    }
    const hasProfile = (await db.profile.count()) > 0
    const settings = await db.settings.get(SINGLETON_ID)
    if (settings) {
      if (settings.onboardingCompleted !== hasProfile) {
        await db.settings.put({ ...settings, onboardingCompleted: hasProfile })
      }
    } else if (hasProfile) {
      await db.settings.put({ ...defaultSettings(now), onboardingCompleted: true })
      counts.settings = 1
    }
  })
  return { mode, counts }
}
