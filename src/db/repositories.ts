// Accès typés aux données. L'UI n'importe jamais Dexie ni `db` : elle passe par ces fonctions.
// Convention : les fonctions qui horodatent prennent `now` en dernier paramètre (défaut : instant courant).
import { liveQuery } from 'dexie'
import { SINGLETON_ID } from '../types'
import type {
  Equipment,
  EquipmentId,
  IsoDateTime,
  LocalDate,
  Measurement,
  Profile,
  Settings,
  WeighIn,
} from '../types'
import { db } from './database'
import { defaultEquipment, defaultSettings } from './defaults'
import { toLocalDate } from '../domain/shared/dates'
import { equipmentSchema, profileSchema } from './schemas'
import { checkCoachUrl, checkEquipment, checkMeasurement, checkProfile, checkWeighIn } from './validation'

/** Erreur de validation dont le message (français) est affichable tel quel. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

const nowIso = (): IsoDateTime => new Date().toISOString()
/** Jour local correspondant à l'instant `now`. */
const todayOf = (now: IsoDateTime): LocalDate => toLocalDate(new Date(now))
/** `updatedAt` des valeurs par défaut non écrites : stable, pour ne pas relancer les formulaires à chaque lecture. */
const EPOCH: IsoDateTime = '1970-01-01T00:00:00.000Z'

function fail(message: string | null): void {
  if (message !== null) throw new ValidationError(message)
}

// ---------- Profil ----------

export async function getProfile(): Promise<Profile | undefined> {
  return db.profile.get(SINGLETON_ID)
}

function validateProfile(profile: Profile, now: IsoDateTime): Profile {
  const next: Profile = { ...profile, updatedAt: now }
  if (!profileSchema.safeParse(next).success) {
    throw new ValidationError('Profil invalide : vérifie les champs saisis.')
  }
  fail(checkProfile(next, todayOf(now)))
  return next
}

export async function saveProfile(profile: Profile, now: IsoDateTime = nowIso()): Promise<Profile> {
  const next = validateProfile(profile, now)
  await db.profile.put(next)
  return next
}

// ---------- Matériel ----------

function validateEquipment(eq: Equipment, now: IsoDateTime): Equipment {
  fail(checkEquipment(eq))
  // La kettlebell est toujours possédée : elle ne figure jamais dans `owned`.
  const owned = [...new Set(eq.owned)].filter((e): e is EquipmentId => e !== 'kettlebell')
  const next: Equipment = { ...eq, id: SINGLETON_ID, owned, updatedAt: now }
  if (!equipmentSchema.safeParse(next).success) {
    throw new ValidationError('Matériel invalide : vérifie les champs saisis.')
  }
  return next
}

/** Matériel enregistré, ou défaut non écrit (`updatedAt` = epoch, stable d'une lecture à l'autre). */
export async function getEquipment(): Promise<Equipment> {
  return (await db.equipment.get(SINGLETON_ID)) ?? defaultEquipment(EPOCH)
}

export async function saveEquipment(eq: Equipment, now: IsoDateTime = nowIso()): Promise<Equipment> {
  const next = validateEquipment(eq, now)
  await db.equipment.put(next)
  return next
}

// ---------- Réglages ----------

/** Réglages enregistrés, ou défaut non écrit (`updatedAt` = epoch, stable d'une lecture à l'autre). */
export async function getSettings(): Promise<Settings> {
  return (await db.settings.get(SINGLETON_ID)) ?? defaultSettings(EPOCH)
}

export type SettingsPatch = Partial<Omit<Settings, 'id' | 'updatedAt'>>

export async function updateSettings(patch: SettingsPatch, now: IsoDateTime = nowIso()): Promise<Settings> {
  if (patch.coachUrl !== undefined) fail(checkCoachUrl(patch.coachUrl))
  return db.transaction('rw', db.settings, async () => {
    const current = (await db.settings.get(SINGLETON_ID)) ?? defaultSettings(now)
    const next: Settings = { ...current, ...patch, id: SINGLETON_ID, updatedAt: now }
    await db.settings.put(next)
    return next
  })
}

// ---------- Pesées ----------

function newId(): string {
  return crypto.randomUUID()
}

export async function listWeighIns(): Promise<WeighIn[]> {
  return db.weighIns.orderBy('date').toArray()
}

export interface WeighInInput {
  date: LocalDate
  weightKg: number
  note?: string
}

/** Ajoute la pesée ; si la date existe déjà, remplace cette pesée en gardant son id. */
export async function upsertWeighIn(input: WeighInInput, now: IsoDateTime = nowIso()): Promise<WeighIn> {
  fail(checkWeighIn(input, todayOf(now)))
  return db.transaction('rw', db.weighIns, async () => {
    const existing = await db.weighIns.where('date').equals(input.date).first()
    const row: WeighIn = {
      id: existing?.id ?? newId(),
      date: input.date,
      weightKg: input.weightKg,
      createdAt: existing?.createdAt ?? now,
    }
    if (input.note !== undefined) row.note = input.note
    await db.weighIns.put(row)
    return row
  })
}

export type WeighInPatch = Partial<Pick<WeighIn, 'date' | 'weightKg' | 'note'>>

export async function updateWeighIn(
  id: string,
  patch: WeighInPatch,
  now: IsoDateTime = nowIso(),
): Promise<WeighIn> {
  return db.transaction('rw', db.weighIns, async () => {
    const current = await db.weighIns.get(id)
    if (!current) throw new ValidationError('Pesée introuvable.')
    if (patch.date !== undefined && patch.date !== current.date) {
      const clash = await db.weighIns.where('date').equals(patch.date).first()
      if (clash) throw new ValidationError('Une pesée existe déjà à cette date.')
    }
    const next: WeighIn = { ...current, ...patch }
    if (next.note === undefined) delete next.note
    fail(checkWeighIn(next, todayOf(now)))
    await db.weighIns.put(next)
    return next
  })
}

export async function deleteWeighIn(id: string): Promise<void> {
  await db.weighIns.delete(id)
}

// ---------- Mensurations ----------

export async function listMeasurements(): Promise<Measurement[]> {
  return db.measurements.orderBy('date').toArray()
}

export type MeasurementInput = Omit<Measurement, 'id' | 'createdAt'>

export async function addMeasurement(
  input: MeasurementInput,
  now: IsoDateTime = nowIso(),
): Promise<Measurement> {
  fail(checkMeasurement(input))
  const row: Measurement = { ...input, id: newId(), createdAt: now }
  await db.measurements.add(row)
  return row
}

export type MeasurementPatch = Partial<MeasurementInput>

export async function updateMeasurement(id: string, patch: MeasurementPatch): Promise<Measurement> {
  return db.transaction('rw', db.measurements, async () => {
    const current = await db.measurements.get(id)
    if (!current) throw new ValidationError('Mensuration introuvable.')
    // Une valeur `undefined` dans le patch efface le champ.
    const next = Object.fromEntries(
      Object.entries({ ...current, ...patch }).filter(([, v]) => v !== undefined),
    ) as unknown as Measurement
    fail(checkMeasurement(next))
    await db.measurements.put(next)
    return next
  })
}

export async function deleteMeasurement(id: string): Promise<void> {
  await db.measurements.delete(id)
}

// ---------- Onboarding ----------

export interface OnboardingInput {
  profile: Profile
  equipment: Equipment
  weighIn: { date: LocalDate; weightKg: number }
}

/** Écrit profil, matériel, première pesée et `onboardingCompleted = true` en une seule transaction. */
export async function completeOnboarding(input: OnboardingInput, now: IsoDateTime = nowIso()): Promise<void> {
  const profile = validateProfile(input.profile, now)
  const equipment = validateEquipment(input.equipment, now)
  fail(checkWeighIn(input.weighIn, todayOf(now)))
  await db.transaction('rw', [db.profile, db.equipment, db.weighIns, db.settings], async () => {
    await db.profile.put(profile)
    await db.equipment.put(equipment)
    const existing = await db.weighIns.where('date').equals(input.weighIn.date).first()
    await db.weighIns.put({
      id: existing?.id ?? newId(),
      date: input.weighIn.date,
      weightKg: input.weighIn.weightKg,
      createdAt: existing?.createdAt ?? now,
    })
    const settings = (await db.settings.get(SINGLETON_ID)) ?? defaultSettings(now)
    await db.settings.put({ ...settings, onboardingCompleted: true, updatedAt: now })
  })
}

// ---------- Réactivité et stockage ----------

/** Observe une requête (Dexie `liveQuery`). Renvoie la fonction de désinscription. */
export function observe<T>(
  query: () => Promise<T>,
  onValue: (value: T) => void,
  onError?: (error: unknown) => void,
): () => void {
  const subscription = liveQuery(query).subscribe({
    next: onValue,
    error: (e: unknown) => onError?.(e),
  })
  return () => subscription.unsubscribe()
}

/** Demande le stockage persistant (évite l'éviction iOS). Ne plante jamais. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const result = await navigator.storage?.persist?.()
    return result === true
  } catch {
    return false
  }
}
