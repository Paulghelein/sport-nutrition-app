// Accès typés aux données. L'UI n'importe jamais Dexie ni `db` : elle passe par ces fonctions.
// Convention : les fonctions qui horodatent prennent `now` en dernier paramètre (défaut : instant courant).
import { liveQuery } from 'dexie'
import { SINGLETON_ID } from '../types'
import type {
  EngineSettings,
  Equipment,
  EquipmentId,
  Exercise,
  ExerciseInput,
  ExerciseState,
  ExercisePref,
  ExercisePreference,
  Id,
  IsoDateTime,
  LocalDate,
  Measurement,
  Profile,
  Session,
  Settings,
  WeekStart,
  WeighIn,
} from '../types'
import { db } from './database'
import { ValidationError } from './helpers'
import { defaultEquipment, defaultSettings } from './defaults'
import { toLocalDate } from '../domain/shared/dates'
import { weekStartOf } from '../domain/progress/regularity'
import { equipmentSchema, exerciseSchema, exerciseStateSchema, profileSchema } from './schemas'
import {
  checkCoachUrl,
  checkEngineSettings,
  checkEquipment,
  checkExercise,
  checkMeasurement,
  checkProfile,
  checkWeekStart,
  checkWeighIn,
} from './validation'

export { ValidationError }

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

/** Le moteur se modifie par `updateEngineSettings` (fusion transactionnelle + validation). */
export type SettingsPatch = Partial<Omit<Settings, 'id' | 'updatedAt' | 'engine'>>

export async function updateSettings(patch: SettingsPatch, now: IsoDateTime = nowIso()): Promise<Settings> {
  if (patch.coachUrl !== undefined) fail(checkCoachUrl(patch.coachUrl))
  return db.transaction('rw', db.settings, async () => {
    const current = (await db.settings.get(SINGLETON_ID)) ?? defaultSettings(now)
    const next: Settings = { ...current, ...patch, id: SINGLETON_ID, updatedAt: now }
    await db.settings.put(next)
    return next
  })
}

/**
 * Ferme la carte du lundi pour la semaine évaluée `weekStart` (un lundi). Ne recule jamais :
 * on garde la plus récente des deux valeurs.
 */
export async function dismissReview(weekStart: WeekStart, now: IsoDateTime = nowIso()): Promise<void> {
  fail(checkWeekStart(weekStart))
  if (weekStart > weekStartOf(todayOf(now)))
    throw new ValidationError('La semaine ne peut pas être dans le futur.')
  await db.transaction('rw', db.settings, async () => {
    const current = (await db.settings.get(SINGLETON_ID)) ?? defaultSettings(now)
    if (current.reviewDismissedWeek !== undefined && current.reviewDismissedWeek >= weekStart) return
    await db.settings.put({ ...current, reviewDismissedWeek: weekStart, id: SINGLETON_ID, updatedAt: now })
  })
}

/**
 * Met à jour les réglages du moteur en une transaction : `update` reçoit les réglages en base au moment
 * de l'écriture (pas une copie lue plus tôt), ce qui évite qu'une action en efface une autre.
 */
export async function updateEngineSettings(
  update: (current: EngineSettings) => EngineSettings,
  now: IsoDateTime = nowIso(),
): Promise<Settings> {
  return db.transaction('rw', db.settings, async () => {
    const current = (await db.settings.get(SINGLETON_ID)) ?? defaultSettings(now)
    const engine = update(current.engine)
    fail(checkEngineSettings(engine))
    const next: Settings = { ...current, engine, id: SINGLETON_ID, updatedAt: now }
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
  fail(checkMeasurement(input, todayOf(now)))
  const row: Measurement = { ...input, id: newId(), createdAt: now }
  await db.measurements.add(row)
  return row
}

export type MeasurementPatch = Partial<MeasurementInput>

export async function updateMeasurement(
  id: string,
  patch: MeasurementPatch,
  now: IsoDateTime = nowIso(),
): Promise<Measurement> {
  return db.transaction('rw', db.measurements, async () => {
    const current = await db.measurements.get(id)
    if (!current) throw new ValidationError('Mensuration introuvable.')
    // Une valeur `undefined` dans le patch efface le champ.
    const next = Object.fromEntries(
      Object.entries({ ...current, ...patch }).filter(([, v]) => v !== undefined),
    ) as unknown as Measurement
    fail(checkMeasurement(next, todayOf(now)))
    await db.measurements.put(next)
    return next
  })
}

export async function deleteMeasurement(id: string): Promise<void> {
  await db.measurements.delete(id)
}

// ---------- Exercices ----------

export async function listExerciseRows(): Promise<Exercise[]> {
  return db.exercises.toArray()
}

export async function listExercisePrefs(): Promise<ExercisePref[]> {
  return db.exercisePrefs.toArray()
}

/** Ligne persistable : sans les champs de `LibraryExercise`, chaînes trimées, champs optionnels vides retirés. */
function buildExerciseRow(
  id: Id,
  source: Exercise['source'],
  input: ExerciseInput,
  now: IsoDateTime,
  validate = true,
): Exercise {
  const t = input.technique
  const clean = (list: string[]) => list.map((s) => s.trim())
  const row: Exercise = {
    id,
    name: input.name.trim(),
    pattern: input.pattern,
    level: input.level,
    muscles: { primary: [...input.muscles.primary], secondary: [...input.muscles.secondary] },
    equipment: [...input.equipment],
    loadType: input.loadType,
    restSec: input.restSec,
    compound: input.compound,
    unilateral: input.unilateral,
    loadStepKg: input.loadStepKg,
    progressionCriteria: input.progressionCriteria.trim(),
    technique: {
      setup: t.setup.trim(),
      steps: clean(t.steps),
      cues: clean(t.cues),
      mistakes: clean(t.mistakes),
    },
    source,
    updatedAt: now,
  }
  if (input.repRange !== undefined) row.repRange = [input.repRange[0], input.repRange[1]]
  if (input.durationRange !== undefined) row.durationRange = [input.durationRange[0], input.durationRange[1]]
  const illustration = input.illustration?.trim()
  if (illustration) row.illustration = illustration
  const videoUrl = input.videoUrl?.trim()
  if (videoUrl) row.videoUrl = videoUrl
  if (validate) fail(checkExercise(row))
  if (!exerciseSchema.safeParse(row).success) {
    throw new ValidationError('Exercice invalide : vérifie les champs saisis.')
  }
  return row
}

/** Valide et ajoute un exercice personnel ; utilisable dans une transaction englobante (J9 : `applyClaudeSelection`). */
export async function insertUserExercise(input: ExerciseInput, now: IsoDateTime): Promise<Exercise> {
  const row = buildExerciseRow(newId(), 'user', input, now)
  await db.exercises.add(row)
  return row
}

export async function createExercise(input: ExerciseInput, now: IsoDateTime = nowIso()): Promise<Exercise> {
  return insertUserExercise(input, now)
}

/** Exercice personnel : met à jour la ligne. Exercice de départ : écrit (ou remplace) la surcharge. */
export async function updateExercise(
  current: Exercise,
  input: ExerciseInput,
  now: IsoDateTime = nowIso(),
): Promise<Exercise> {
  const row = buildExerciseRow(current.id, current.source, input, now)
  if (current.source === 'user') {
    return db.transaction('rw', db.exercises, async () => {
      const existing = await db.exercises.get(current.id)
      if (!existing || existing.deleted === true) throw new ValidationError('Exercice introuvable.')
      await db.exercises.put(row)
      return row
    })
  }
  await db.exercises.put(row)
  return row
}

/**
 * Exercice personnel : suppression logique (`deleted: true`), la ligne, la préférence et l'état sont conservés
 * pour que l'historique garde un nom à afficher. Exercice de départ : écrit une surcharge `deleted`.
 */
export async function deleteExercise(current: Exercise, now: IsoDateTime = nowIso()): Promise<void> {
  if (current.source === 'user') {
    await db.transaction('rw', db.exercises, async () => {
      const row = await db.exercises.get(current.id)
      if (!row || row.source !== 'user') return
      await db.exercises.put({ ...row, deleted: true, updatedAt: now })
    })
    return
  }
  // `buildExerciseRow` ne copie que les champs de `Exercise` : `overridden` et `preference` sont écartés.
  // Pas de revalidation : la ligne reprend `current` (original ou version modifiée) ; « Restaurer » ramène l'original.
  const row = buildExerciseRow(current.id, 'seed', current, now, false)
  row.deleted = true
  await db.exercises.put(row)
}

/** Supprime la surcharge d'un exercice de départ (rétablit l'original ou annule une suppression). */
export async function restoreExercise(id: Id): Promise<void> {
  await db.transaction('rw', db.exercises, async () => {
    const row = await db.exercises.get(id)
    if (row?.source === 'seed') await db.exercises.delete(id)
  })
}

/**
 * `neutral` supprime la ligne ; sinon upsert. `reason` fourni : remplace l'ancien ; absent : l'éventuel `reason`
 * existant est conservé. Utilisable dans une transaction englobante.
 */
export async function putExercisePreference(
  exerciseId: Id,
  preference: ExercisePreference,
  now: IsoDateTime,
  reason?: string,
): Promise<void> {
  if (preference === 'neutral') {
    await db.exercisePrefs.delete(exerciseId)
    return
  }
  const existing = await db.exercisePrefs.get(exerciseId)
  const row: ExercisePref = { exerciseId, preference, updatedAt: now }
  const r = reason?.trim()
  if (r) row.reason = r
  else if (existing?.reason !== undefined) row.reason = existing.reason
  await db.exercisePrefs.put(row)
}

export async function setExercisePreference(
  exerciseId: Id,
  preference: ExercisePreference,
  now: IsoDateTime = nowIso(),
): Promise<void> {
  await db.transaction('rw', db.exercisePrefs, () => putExercisePreference(exerciseId, preference, now))
}

// ---------- Séances et états de progression ----------

/** Séances par date croissante, puis `startedAt`, puis id (ordre stable). Tri en mémoire : pas d'index composite. */
export async function listSessions(): Promise<Session[]> {
  return sortSessions(await db.sessions.toArray())
}

/** Tri en place de `listSessions` (réutilisé pour les lectures filtrées). */
export function sortSessions(rows: Session[]): Session[] {
  return rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.startedAt ?? '').localeCompare(b.startedAt ?? '') ||
      a.id.localeCompare(b.id),
  )
}

export async function listExerciseStates(): Promise<ExerciseState[]> {
  return db.exerciseState.toArray()
}

/** Upsert de plusieurs états en une transaction ; `updatedAt` = `now`. Renvoie les lignes écrites. */
export async function saveExerciseStates(
  states: ExerciseState[],
  now: IsoDateTime = nowIso(),
): Promise<ExerciseState[]> {
  const rows = states.map((s) => ({ ...s, updatedAt: now }))
  for (const row of rows) {
    if (!exerciseStateSchema.safeParse(row).success) {
      throw new ValidationError('État de progression invalide.')
    }
  }
  await db.transaction('rw', db.exerciseState, async () => {
    await db.exerciseState.bulkPut(rows)
  })
  return rows
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
