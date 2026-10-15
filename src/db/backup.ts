// Export / import de la sauvegarde JSON (SPEC §5).
import { addDays, toLocalDate } from '../domain/shared/dates'
import { SINGLETON_ID, TABLE_NAMES } from '../types'
import type {
  BackupFile,
  ImportMode,
  ImportReport,
  IsoDateTime,
  LocalDate,
  TableName,
  TableRows,
} from '../types'
import { DB_SCHEMA_VERSION, db } from './database'
import { defaultSettings } from './defaults'
import { updateSettings } from './repositories'
import { primaryKeys, rowSchemas } from './schemas'
import {
  checkEquipment,
  checkExercise,
  checkMeasurement,
  checkProfile,
  checkSettings,
  checkWeighIn,
} from './validation'

const MAX_ERRORS = 10

export type TableCounts = Record<TableName, number>

function emptyCounts(): TableCounts {
  return Object.fromEntries(TABLE_NAMES.map((t) => [t, 0])) as TableCounts
}

/** Lit toutes les tables dans une transaction de lecture cohérente. */
export async function exportBackup(now: IsoDateTime): Promise<BackupFile> {
  return db.transaction('r', db.tables, async () => {
    const entries = await Promise.all(
      TABLE_NAMES.map(async (name) => [name, await db.table(name).toArray()] as const),
    )
    return {
      app: 'forge',
      schemaVersion: DB_SCHEMA_VERSION,
      exportedAt: now,
      tables: Object.fromEntries(entries) as BackupFile['tables'],
    }
  })
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
}

/**
 * Point d'extension : met à niveau une sauvegarde créée par une version antérieure du schéma
 * (appelée AVANT la validation des lignes, avec `schemaVersion` = version du fichier).
 * Identité tant que la seule version est la 1.
 */
export function migrateBackup(raw: RawBackup): RawBackup {
  return raw
}

export type ParseResult =
  { ok: true; backup: BackupFile; summary: TableCounts } | { ok: false; errors: string[] }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
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
      return checkMeasurement(data as TableRows['measurements'])
    case 'equipment':
      return checkEquipment(data as TableRows['equipment'])
    case 'settings':
      return checkSettings(data as TableRows['settings'])
    case 'exercises': {
      // Une surcharge de suppression est une copie de l'original : elle n'est pas rejouée contre les règles de saisie.
      const row = data as TableRows['exercises']
      return row.deleted === true ? null : checkExercise(row)
    }
    default:
      return null
  }
}

/** `today` sert à refuser les pesées futures et à calculer l'âge (défaut : jour local courant). */
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

  const raw = migrateBackup({ app: 'forge', schemaVersion, exportedAt, tables: rawTables })

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

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    backup: {
      app: 'forge',
      schemaVersion: raw.schemaVersion,
      exportedAt: raw.exportedAt,
      tables: tables as unknown as BackupFile['tables'],
    },
    summary,
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
  await db.transaction('rw', db.tables, async () => {
    if (mode === 'replace') {
      await Promise.all(db.tables.map((t) => t.clear()))
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
      const rows = backup.tables[name]
      if (rows.length > 0) await db.table(name).bulkPut(rows)
      counts[name] = rows.length
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
