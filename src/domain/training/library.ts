// Bibliothèque d'exercices (SPEC §3.1, §3.5, §9) : fusion contenu de départ + base, tri, filtres, variantes.
// Fonctions pures : les données (seeds, lignes en base, préférences, matériel) arrivent en paramètre.
import type { Equipment, EquipmentId, TrainingLevel } from '../../types/profile'
import type {
  Exercise,
  ExerciseInput,
  ExercisePref,
  ExercisePreference,
  LibraryExercise,
  MovementPattern,
} from '../../types/training'

/** Ordre des schémas de mouvement, celui du tableau SPEC §3.1. */
export const PATTERN_ORDER: readonly MovementPattern[] = [
  'hinge',
  'squat',
  'lunge',
  'push_h',
  'push_v',
  'pull',
  'core',
  'carry',
  'arms',
  'calves',
]

const PATTERN_RANK: Record<MovementPattern, number> = Object.fromEntries(
  PATTERN_ORDER.map((p, i) => [p, i]),
) as Record<MovementPattern, number>

const collator = new Intl.Collator('fr')

function compareExercises(a: Exercise, b: Exercise): number {
  return (
    PATTERN_RANK[a.pattern] - PATTERN_RANK[b.pattern] ||
    a.level - b.level ||
    collator.compare(a.name, b.name) ||
    // Départage par id : ordre identique quel que soit l'ordre d'entrée (déterminisme du moteur).
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )
}

/** Trie par schéma (PATTERN_ORDER), puis niveau, puis nom (fr), puis id. Ne modifie pas l'entrée. */
export function sortLibrary<T extends Exercise>(list: readonly T[]): T[] {
  return [...list].sort(compareExercises)
}

/**
 * Bibliothèque présentée par l'app.
 * - Ligne `seed` de même id qu'un exercice de départ = surcharge (remplace l'original, `overridden: true`) ;
 *   si `deleted`, l'exercice disparaît. Surcharge orpheline (id absent des seeds) ignorée.
 * - Lignes `user` ajoutées (ignorées si `deleted`, ou si leur id entre en collision avec un exercice de départ).
 * - Préférence par `exerciseId`, défaut `neutral`.
 */
export function mergeLibrary(
  seeds: readonly Exercise[],
  rows: readonly Exercise[],
  prefs: readonly ExercisePref[],
): LibraryExercise[] {
  const prefById = new Map<string, ExercisePreference>(prefs.map((p) => [p.exerciseId, p.preference]))
  const seedIds = new Set(seeds.map((s) => s.id))
  const overrides = new Map<string, Exercise>()
  const users: Exercise[] = []
  for (const row of rows) {
    if (row.source === 'seed') {
      if (seedIds.has(row.id)) overrides.set(row.id, row)
    } else if (!row.deleted && !seedIds.has(row.id)) {
      users.push(row)
    }
  }

  const toLibrary = (ex: Exercise, overridden: boolean): LibraryExercise => ({
    ...ex,
    overridden,
    preference: prefById.get(ex.id) ?? 'neutral',
  })

  const result: LibraryExercise[] = []
  for (const seed of seeds) {
    const override = overrides.get(seed.id)
    if (override === undefined) result.push(toLibrary(seed, false))
    else if (!override.deleted) result.push(toLibrary(override, true))
  }
  for (const user of users) result.push(toLibrary(user, false))
  return sortLibrary(result)
}

/** Exercices de départ masqués par une surcharge `deleted` (originaux, pour la restauration), triés. */
export function deletedSeedExercises(seeds: readonly Exercise[], rows: readonly Exercise[]): Exercise[] {
  const deletedIds = new Set(rows.filter((r) => r.source === 'seed' && r.deleted === true).map((r) => r.id))
  return sortLibrary(seeds.filter((s) => deletedIds.has(s.id)))
}

/**
 * Matériel requis par l'exercice mais non possédé, dans l'ordre de `ex.equipment`, sans doublon.
 * La kettlebell est toujours considérée comme possédée.
 */
export function missingEquipment(ex: Exercise, equipment: Equipment): EquipmentId[] {
  const missing: EquipmentId[] = []
  for (const e of ex.equipment) {
    if (e !== 'kettlebell' && !equipment.owned.includes(e) && !missing.includes(e)) missing.push(e)
  }
  return missing
}

/** Tout le matériel requis est possédé ; la kettlebell est toujours possédée. */
export function isAvailable(ex: Exercise, equipment: Equipment): boolean {
  return missingEquipment(ex, equipment).length === 0
}

/**
 * Normalise un texte pour la recherche : minuscules, sans accents (NFD), ligatures œ/æ développées,
 * ponctuation remplacée par des espaces, espaces fusionnés.
 */
export function normalizeSearch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

export interface LibraryFilter {
  /** Recherche sur le nom ; plusieurs mots = tous présents (ordre libre). */
  query?: string
  pattern?: MovementPattern
  level?: TrainingLevel
  /** Seulement les exercices dont tout le matériel est possédé. */
  availableOnly?: boolean
  /** Inclure les exercices de préférence `hidden` (exclus par défaut). */
  includeHidden?: boolean
}

export function filterLibrary(
  list: readonly LibraryExercise[],
  filter: LibraryFilter,
  equipment: Equipment,
): LibraryExercise[] {
  const words = normalizeSearch(filter.query ?? '')
    .split(' ')
    .filter((w) => w !== '')
  return list.filter((ex) => {
    if (!filter.includeHidden && ex.preference === 'hidden') return false
    if (filter.pattern !== undefined && ex.pattern !== filter.pattern) return false
    if (filter.level !== undefined && ex.level !== filter.level) return false
    if (filter.availableOnly && !isAvailable(ex, equipment)) return false
    if (words.length > 0) {
      const name = normalizeSearch(ex.name)
      if (!words.every((w) => name.includes(w))) return false
    }
    return true
  })
}

export interface PatternGroup {
  pattern: MovementPattern
  exercises: LibraryExercise[]
}

/** Regroupe par schéma dans PATTERN_ORDER ; groupes vides omis ; ordre interne de l'entrée conservé. */
export function groupByPattern(list: readonly LibraryExercise[]): PatternGroup[] {
  return PATTERN_ORDER.map((pattern) => ({
    pattern,
    exercises: list.filter((ex) => ex.pattern === pattern),
  })).filter((g) => g.exercises.length > 0)
}

/**
 * Autres exercices du même schéma, triés par niveau puis nom (fiche : variantes plus faciles / difficiles).
 * Les exercices `hidden` sont exclus sauf `includeHidden`.
 */
export function variantsOf(
  list: readonly LibraryExercise[],
  ex: Exercise,
  options: { includeHidden?: boolean } = {},
): LibraryExercise[] {
  return sortLibrary(
    list.filter(
      (other) =>
        other.pattern === ex.pattern &&
        other.id !== ex.id &&
        (options.includeHidden === true || other.preference !== 'hidden'),
    ),
  )
}

const HEAVY_STEP_PATTERNS: readonly MovementPattern[] = ['hinge', 'squat', 'lunge']
const COMPOUND_PATTERNS: readonly MovementPattern[] = ['hinge', 'squat', 'lunge', 'push_h', 'push_v', 'pull']

/** Palier de charge par défaut (SPEC §3.3) : 2 kg pour hinge/squat/lunge, 1 kg sinon. */
export function defaultLoadStep(pattern: MovementPattern): 1 | 2 {
  return HEAVY_STEP_PATTERNS.includes(pattern) ? 2 : 1
}

/** Champs éditables d'un exercice (retire id, source, deleted, updatedAt, overridden, preference). */
export function toExerciseInput(ex: Exercise | LibraryExercise): ExerciseInput {
  const { id, source, deleted, updatedAt, ...rest } = ex as Exercise &
    Partial<Pick<LibraryExercise, 'overridden' | 'preference'>>
  const { overridden, preference, ...input } = rest
  // Champs retirés volontairement (déstructuration pour exclure sans transtypage).
  void [id, source, deleted, updatedAt, overridden, preference]
  return input
}

/** Valeurs par défaut d'un nouvel exercice personnel (schéma par défaut : `hinge`, premier de PATTERN_ORDER). */
export function emptyExerciseInput(pattern: MovementPattern = 'hinge'): ExerciseInput {
  return {
    name: '',
    pattern,
    level: 1,
    muscles: { primary: [], secondary: [] },
    equipment: ['kettlebell'],
    loadType: 'kettlebell',
    repRange: [8, 12],
    restSec: 90,
    compound: COMPOUND_PATTERNS.includes(pattern),
    unilateral: false,
    loadStepKg: defaultLoadStep(pattern),
    progressionCriteria: '',
    technique: { setup: '', steps: [], cues: [], mistakes: [] },
  }
}
