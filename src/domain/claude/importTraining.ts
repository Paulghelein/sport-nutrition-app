// Import J9 : éléments `exercise`, `exercisePreference` et `sessionPlan` d'une réponse de Claude.
// Validation à la main (messages français précis, pas de Zod ici) ; appelé par parseImport (import.ts) seulement
// quand `ImportContext.exercises` est fourni.
import type { Id, Range } from '../../types/common'
import type { EquipmentId, KettlebellSpec, TrainingLevel } from '../../types/profile'
import type {
  ExercisePreference,
  LoadType,
  MovementPattern,
  MuscleGroup,
  SessionDuration,
  TemplateBlock,
} from '../../types/training'
import type { ExerciseInput } from '../../types/training'
import type { ImportedPlanBlock, ImportedSessionPlan } from '../../types/claude'
import type { ImportPreviewItem } from '../../types/recipes'
import { normalizeFoodSearch } from '../nutrition/search'
import { resolvePlanBlocks } from './plan'
import { SESSION_FORMATS } from '../training/generate'
import { defaultLoadStep } from '../training/library'

/** Exercice de l'app tel que l'import le voit (un `LibraryExercise` convient). */
export interface ImportExerciseRef {
  id: Id
  name: string
  pattern: MovementPattern
  level: TrainingLevel
  loadType: LoadType
  restSec: number
  repRange?: Range
  durationRange?: Range
}

export interface TrainingImportContext {
  exercises: readonly ImportExerciseRef[]
  validateExercise?: (e: ExerciseInput) => string | null
  /** Kettlebell réglable de l'utilisateur (`Equipment.kettlebell`) : charges ramenées dans la plage et au pas réel. */
  kettlebell?: KettlebellSpec
  /** Raison pour laquelle un exercice créé par la réponse ne serait pas proposé (niveau du schéma, matériel) ; `null` = ok. */
  newExerciseIssue?: (e: ExerciseInput) => string | null
  /** Lignes que `planFromTemplate` écarterait (niveau non atteint, matériel manquant, masqué) : `templateIssues`. */
  planIssues?: (blocks: TemplateBlock[]) => { exerciseId: Id; message: string }[]
}

const key = (s: string): string => normalizeFoodSearch(s).replace(/ /g, '')
const norm = (s: string): string => normalizeFoodSearch(s)

// ---------- Valeurs ----------

const PATTERNS: Record<string, MovementPattern> = {
  hinge: 'hinge',
  charniere: 'hinge',
  hanche: 'hinge',
  souleve: 'hinge',
  soulevedeterre: 'hinge',
  squat: 'squat',
  flexion: 'squat',
  flexiondejambes: 'squat',
  accroupissement: 'squat',
  lunge: 'lunge',
  fente: 'lunge',
  fentes: 'lunge',
  pushh: 'push_h',
  pushhorizontal: 'push_h',
  poussee: 'push_h',
  pousseehorizontale: 'push_h',
  pompe: 'push_h',
  pompes: 'push_h',
  pushv: 'push_v',
  pushvertical: 'push_v',
  pousseeverticale: 'push_v',
  pull: 'pull',
  tirage: 'pull',
  traction: 'pull',
  core: 'core',
  gainage: 'core',
  abdos: 'core',
  abdominaux: 'core',
  sangle: 'core',
  carry: 'carry',
  porte: 'carry',
  portes: 'carry',
  marche: 'carry',
  arms: 'arms',
  bras: 'arms',
  biceps: 'arms',
  triceps: 'arms',
  calves: 'calves',
  mollet: 'calves',
  mollets: 'calves',
}

const MUSCLES: Record<string, MuscleGroup> = {
  chest: 'chest',
  pectoraux: 'chest',
  pecs: 'chest',
  pectoral: 'chest',
  back: 'back',
  dos: 'back',
  dorsaux: 'back',
  grandsdorsaux: 'back',
  shoulders: 'shoulders',
  epaules: 'shoulders',
  epaule: 'shoulders',
  deltoides: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearms',
  avantbras: 'forearms',
  traps: 'traps',
  trapezes: 'traps',
  trapeze: 'traps',
  abs: 'abs',
  abdos: 'abs',
  abdominaux: 'abs',
  lowerback: 'lower_back',
  lombaires: 'lower_back',
  lombaire: 'lower_back',
  basdudos: 'lower_back',
  glutes: 'glutes',
  fessiers: 'glutes',
  fessier: 'glutes',
  quads: 'quads',
  quadriceps: 'quads',
  cuisses: 'quads',
  hamstrings: 'hamstrings',
  ischios: 'hamstrings',
  ischiojambiers: 'hamstrings',
  ischio: 'hamstrings',
  calves: 'calves',
  mollets: 'calves',
  mollet: 'calves',
}

const LOAD_TYPES: Record<string, LoadType> = {
  kettlebell: 'kettlebell',
  kb: 'kettlebell',
  charge: 'kettlebell',
  bodyweight: 'bodyweight',
  poidsducorps: 'bodyweight',
  pdc: 'bodyweight',
  timed: 'timed',
  chronometre: 'timed',
  chronometree: 'timed',
  duree: 'timed',
  tenu: 'timed',
  tenue: 'timed',
}

const EQUIPMENT: Record<string, EquipmentId> = {
  kettlebell: 'kettlebell',
  kb: 'kettlebell',
  mat: 'mat',
  tapis: 'mat',
  pullupbar: 'pullup_bar',
  barredetraction: 'pullup_bar',
  barre: 'pullup_bar',
  bands: 'bands',
  elastiques: 'bands',
  elastique: 'bands',
  bench: 'bench',
  banc: 'bench',
  chaise: 'bench',
  table: 'table',
}

const LEVELS: Record<string, TrainingLevel> = {
  '1': 1,
  debutant: 1,
  beginner: 1,
  '2': 2,
  intermediaire: 2,
  intermediate: 2,
  '3': 3,
  avance: 3,
  advanced: 3,
}

const PREFERENCES: Record<string, ExercisePreference> = {
  liked: 'liked',
  like: 'liked',
  aime: 'liked',
  aimee: 'liked',
  neutral: 'neutral',
  neutre: 'neutral',
  disliked: 'disliked',
  dislike: 'disliked',
  pasaime: 'disliked',
  pasaimee: 'disliked',
  nonaime: 'disliked',
  hidden: 'hidden',
  masque: 'hidden',
  masquee: 'hidden',
  cache: 'hidden',
}

const COMPOUND_PATTERNS: readonly MovementPattern[] = ['hinge', 'squat', 'lunge', 'push_h', 'push_v', 'pull']
const DURATIONS: readonly SessionDuration[] = [20, 30, 45, 60]

export const PLAN_MAX_SETS = 10
const MAX_REPS = 100
const MAX_DURATION_SEC = 600
const MAX_REST_SEC = 600
/** Borne de sûreté des charges quand la kettlebell de l'utilisateur n'est pas fournie. */
const SAFE_MAX_LOAD_KG = 48
export const PLAN_MAX_LINES = 12
export const PLAN_MAX_TOTAL_SETS = 30
const MAX_ID_LENGTH = 80
const MAX_GROUP_LENGTH = 20
const MAX_UNKNOWN_IDS = 10
const MAX_REASON_LENGTH = 200
/** Exercices par superset ou circuit (le moteur et le mode guidé acceptent jusqu'à 3). */
export const SUPERSET_MAX = 3

// ---------- Utilitaires ----------

type Raw = Record<string, unknown>

const absent = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

function toNum(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string') {
    const t = v.trim().replace(',', '.')
    return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : undefined
  }
  return undefined
}

/** `[8, 12]`, `8`, `"8-12"`, `"8 à 12"`, `{min, max}` → intervalle, ou undefined si illisible. */
function toRange(v: unknown): Range | undefined {
  if (Array.isArray(v)) {
    if (v.length === 1) {
      const n = toNum(v[0])
      return n === undefined ? undefined : [n, n]
    }
    if (v.length !== 2) return undefined
    const a = toNum(v[0])
    const b = toNum(v[1])
    return a === undefined || b === undefined ? undefined : [a, b]
  }
  if (typeof v === 'string') {
    const m = /^\s*(\d+(?:[.,]\d+)?)\s*(?:-|–|à|a|to)\s*(\d+(?:[.,]\d+)?)\s*$/i.exec(v)
    if (m) return [Number(m[1]?.replace(',', '.')), Number(m[2]?.replace(',', '.'))]
  }
  const n = toNum(v)
  return n === undefined ? undefined : [n, n]
}

function intRangeError(r: Range, lo: number, hi: number): boolean {
  return !(Number.isInteger(r[0]) && Number.isInteger(r[1]) && r[0] >= lo && r[0] <= r[1] && r[1] <= hi)
}

function strList(v: unknown): string[] | undefined {
  if (absent(v)) return []
  const arr = Array.isArray(v) ? v : [v]
  if (!arr.every((x) => typeof x === 'string')) return undefined
  return arr.map((x) => (x as string).trim()).filter((x) => x !== '')
}

function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

function asRaw(v: unknown): Raw {
  return v as Raw
}

// ---------- exercise ----------

export function parseExerciseElement(
  raw: unknown,
  index: number,
  ctx: TrainingImportContext,
): ImportPreviewItem {
  const o = asRaw(raw)
  const errors: string[] = []
  const warnings: string[] = []

  const name = typeof o.name === 'string' ? o.name.trim() : ''
  if (name === '') errors.push(absent(o.name) ? 'nom manquant' : 'nom invalide')

  let pattern: MovementPattern | undefined
  if (absent(o.pattern)) errors.push('schéma de mouvement manquant (pattern)')
  else {
    pattern = typeof o.pattern === 'string' ? PATTERNS[key(o.pattern)] : undefined
    if (pattern === undefined) errors.push(`schéma de mouvement inconnu « ${String(o.pattern)} »`)
  }

  let level: TrainingLevel = 1
  if (absent(o.level)) warnings.push('niveau absent : niveau 1 (débutant) retenu')
  else {
    const l = LEVELS[key(String(o.level))]
    if (l === undefined) errors.push(`niveau inconnu « ${String(o.level)} » (1, 2 ou 3)`)
    else level = l
  }

  // Muscles
  const primary: MuscleGroup[] = []
  const secondary: MuscleGroup[] = []
  const muscles =
    typeof o.muscles === 'object' && o.muscles !== null && !Array.isArray(o.muscles) ? asRaw(o.muscles) : null
  if (muscles === null)
    errors.push(absent(o.muscles) ? 'muscles manquants' : 'muscles invalides (primary / secondary)')
  else {
    const read = (v: unknown, label: string, out: MuscleGroup[]): void => {
      if (absent(v)) return
      const arr = Array.isArray(v) ? v : [v]
      for (const m of arr) {
        const g = typeof m === 'string' ? MUSCLES[key(m)] : undefined
        if (g === undefined) errors.push(`muscle inconnu « ${String(m)} » (${label})`)
        else if (!out.includes(g)) out.push(g)
      }
    }
    read(muscles.primary, 'principal', primary)
    read(muscles.secondary, 'secondaire', secondary)
    if (primary.length === 0 && absent(muscles.primary))
      errors.push('au moins un muscle principal est requis')
    for (const g of primary) {
      const k = secondary.indexOf(g)
      if (k !== -1) {
        secondary.splice(k, 1)
        warnings.push('un muscle principal était aussi secondaire : retiré des secondaires')
      }
    }
  }

  // Type de charge et cible
  let loadType: LoadType | undefined
  if (absent(o.loadType)) errors.push('type de charge manquant (loadType : kettlebell, bodyweight ou timed)')
  else {
    loadType = typeof o.loadType === 'string' ? LOAD_TYPES[key(o.loadType)] : undefined
    if (loadType === undefined) errors.push(`type de charge inconnu « ${String(o.loadType)} »`)
  }
  let repRange = absent(o.repRange) ? undefined : toRange(o.repRange)
  let durationRange = absent(o.durationRange) ? undefined : toRange(o.durationRange)
  const illegible =
    (!absent(o.repRange) && repRange === undefined) ||
    (!absent(o.durationRange) && durationRange === undefined)
  if (!absent(o.repRange) && repRange === undefined)
    errors.push('répétitions visées illisibles (repRange : [min, max])')
  if (!absent(o.durationRange) && durationRange === undefined) {
    errors.push('durée visée illisible (durationRange : [min, max] en secondes)')
  }
  if (loadType === 'timed' && repRange !== undefined && durationRange !== undefined) {
    repRange = undefined
    warnings.push('exercice chronométré : repRange ignoré')
  } else if (loadType === 'bodyweight' && repRange !== undefined && durationRange !== undefined) {
    durationRange = undefined
    warnings.push('exercice au poids du corps : durationRange ignoré')
  } else if (repRange !== undefined && durationRange !== undefined) {
    errors.push('indique des répétitions (repRange) ou une durée (durationRange), pas les deux')
  }
  if (loadType !== undefined && !illegible) {
    if (loadType === 'timed' && durationRange === undefined)
      errors.push('un exercice chronométré a besoin de durationRange')
    else if (loadType === 'bodyweight' && repRange === undefined)
      errors.push('un exercice au poids du corps a besoin de repRange')
    else if (repRange === undefined && durationRange === undefined)
      errors.push('cible manquante (repRange ou durationRange)')
  }
  if (repRange !== undefined && intRangeError(repRange, 1, MAX_REPS)) {
    errors.push(`repRange doit être deux entiers entre 1 et ${MAX_REPS} (min ≤ max)`)
  }
  if (durationRange !== undefined && intRangeError(durationRange, 5, MAX_DURATION_SEC)) {
    errors.push(`durationRange doit être deux entiers (secondes) entre 5 et ${MAX_DURATION_SEC} (min ≤ max)`)
  }

  // Repos
  const defaultRest = loadType === 'kettlebell' ? 90 : loadType === 'timed' ? 45 : 60
  let restSec = defaultRest
  if (absent(o.restSec)) warnings.push(`repos absent : ${defaultRest} s retenus`)
  else {
    const n = toNum(o.restSec)
    if (n === undefined || !Number.isInteger(n) || n < 0 || n > MAX_REST_SEC) {
      errors.push(`repos invalide (restSec : entier de 0 à ${MAX_REST_SEC} s)`)
    } else restSec = n
  }

  // Matériel
  let equipment: EquipmentId[] = []
  if (!absent(o.equipment)) {
    const arr = Array.isArray(o.equipment) ? o.equipment : [o.equipment]
    for (const e of arr) {
      const id = typeof e === 'string' ? EQUIPMENT[key(e)] : undefined
      if (id === undefined) errors.push(`matériel inconnu « ${String(e)} »`)
      else if (!equipment.includes(id)) equipment.push(id)
    }
  }
  if (loadType === 'kettlebell' && !equipment.includes('kettlebell')) equipment = ['kettlebell', ...equipment]

  const bool = (v: unknown, label: string): boolean | undefined => {
    if (absent(v)) return undefined
    if (typeof v !== 'boolean') {
      errors.push(`${label} doit être true ou false`)
      return undefined
    }
    return v
  }
  const compound = bool(o.compound, 'compound')
  const unilateral = bool(o.unilateral, 'unilateral')

  let loadStepKg: 1 | 2 | undefined
  if (!absent(o.loadStepKg)) {
    const n = toNum(o.loadStepKg)
    if (n === 1 || n === 2) loadStepKg = n
    else errors.push('loadStepKg doit valoir 1 ou 2')
  }

  // Technique
  const t =
    typeof o.technique === 'object' && o.technique !== null && !Array.isArray(o.technique)
      ? asRaw(o.technique)
      : null
  if (!absent(o.technique) && t === null) errors.push('technique invalide (setup, steps, cues, mistakes)')
  const steps = strList(t?.steps)
  const cues = strList(t?.cues)
  const mistakes = strList(t?.mistakes)
  if (steps === undefined || cues === undefined || mistakes === undefined)
    errors.push('technique : steps, cues et mistakes sont des listes de textes')
  const setupRaw = t?.setup
  if (!absent(setupRaw) && typeof setupRaw !== 'string') errors.push('technique : setup doit être un texte')

  let progressionCriteria = typeof o.progressionCriteria === 'string' ? o.progressionCriteria.trim() : ''
  if (progressionCriteria === '') {
    progressionCriteria =
      loadType === 'kettlebell'
        ? `Atteins ${repRange ? `${repRange[1]} répétitions` : durationRange ? `${durationRange[1]} s` : 'le haut de la fourchette'} propres sur toutes les séries, puis augmente la charge d’un palier.`
        : loadType === 'timed'
          ? `Atteins ${durationRange ? durationRange[1] : 'la durée maximale'} s propres sur toutes les séries, puis passe à une variante plus difficile.`
          : `Atteins ${repRange ? repRange[1] : 'le haut de la fourchette'} répétitions propres sur toutes les séries, puis passe à une variante plus difficile.`
  }

  if (errors.length > 0 || pattern === undefined || loadType === undefined || muscles === null) {
    return { kind: 'invalid', index, errors }
  }

  const setup =
    typeof setupRaw === 'string' && setupRaw.trim() !== ''
      ? setupRaw.trim()
      : 'Fiche créée depuis une réponse de Claude : à compléter (mise en place, étapes, conseils).'
  if (t === null || (steps ?? []).length === 0) warnings.push('fiche technique à compléter')

  const exercise: ExerciseInput = clean({
    name,
    pattern,
    level,
    muscles: { primary, secondary },
    equipment,
    loadType,
    repRange,
    durationRange,
    restSec,
    compound: compound ?? COMPOUND_PATTERNS.includes(pattern),
    unilateral: unilateral ?? false,
    loadStepKg: loadStepKg ?? defaultLoadStep(pattern),
    progressionCriteria,
    technique: { setup, steps: steps ?? [], cues: cues ?? [], mistakes: mistakes ?? [] },
  })
  const bad = ctx.validateExercise?.(exercise) ?? null
  if (bad !== null) return { kind: 'invalid', index, errors: [bad] }
  const same = ctx.exercises.find((e) => norm(e.name) === norm(name))
  if (same)
    warnings.push(
      `« ${same.name} » existe déjà : le plan utilisera l’existant (ne coche pas cet exercice pour éviter un doublon)`,
    )
  const issue = ctx.newExerciseIssue?.(exercise) ?? null
  if (issue !== null) warnings.push(`« ${name} » ne serait pas proposé dans une séance : ${issue}`)
  return { kind: 'exercise', index, exercise, warnings, ...(same ? { duplicateOf: same.id } : {}) }
}

// ---------- exercisePreference ----------

/** Id exact, sinon nom (sans casse ni accents) ; `byName` signale que l'id vient d'un nom. */
export function findExercise(
  ref: string,
  exercises: readonly ImportExerciseRef[],
): { exercise: ImportExerciseRef; byName: boolean } | null {
  const t = ref.trim()
  const byId = exercises.find((e) => e.id === t)
  if (byId) return { exercise: byId, byName: false }
  const n = norm(t)
  if (n === '') return null
  const byName = exercises.find((e) => norm(e.name) === n)
  if (byName) return { exercise: byName, byName: true }
  const lower = t.toLowerCase()
  const byLowerId = exercises.find((e) => e.id.toLowerCase() === lower)
  return byLowerId ? { exercise: byLowerId, byName: false } : null
}

export function parsePreferenceElement(
  raw: unknown,
  index: number,
  ctx: TrainingImportContext,
): ImportPreviewItem {
  const o = asRaw(raw)
  const errors: string[] = []
  const warnings: string[] = []
  let exerciseId: Id | undefined
  if (absent(o.exerciseId)) errors.push('exerciseId manquant')
  else if (typeof o.exerciseId !== 'string' || o.exerciseId.length > MAX_ID_LENGTH)
    errors.push('exerciseId invalide')
  else {
    const found = findExercise(o.exerciseId, ctx.exercises)
    if (!found)
      errors.push(
        `exercice inconnu « ${o.exerciseId} » : l’app ne le connaît pas (utilise un exerciseId fourni)`,
      )
    else {
      exerciseId = found.exercise.id
      if (found.byName)
        warnings.push(`« ${o.exerciseId} » reconnu comme « ${found.exercise.name} » (${found.exercise.id})`)
    }
  }
  let preference: ExercisePreference | undefined
  if (absent(o.preference)) errors.push('preference manquante (liked, neutral, disliked ou hidden)')
  else {
    preference = typeof o.preference === 'string' ? PREFERENCES[key(o.preference)] : undefined
    if (preference === undefined)
      errors.push(`preference inconnue « ${String(o.preference)} » (liked, neutral, disliked ou hidden)`)
  }
  let reason = typeof o.reason === 'string' && o.reason.trim() !== '' ? o.reason.trim() : undefined
  if (reason !== undefined && reason.length > MAX_REASON_LENGTH) {
    reason = reason.slice(0, MAX_REASON_LENGTH - 1) + '…'
    warnings.push(`raison tronquée à ${String(MAX_REASON_LENGTH)} caractères`)
  }
  if (!absent(o.reason) && typeof o.reason !== 'string') errors.push('reason doit être un texte')
  if (errors.length > 0 || exerciseId === undefined || preference === undefined)
    return { kind: 'invalid', index, errors }
  return {
    kind: 'exercisePreference',
    index,
    preference: clean({ exerciseId, preference, reason }),
    warnings,
  }
}

// ---------- sessionPlan ----------

function nearestDuration(n: number): SessionDuration {
  let best: SessionDuration = 20
  for (const d of DURATIONS) if (Math.abs(d - n) < Math.abs(best - n)) best = d
  return best
}

/** Cible de l'exercice : en durée si `durationRange` seul, sinon en répétitions. */
interface Target {
  loadType: LoadType
  restSec: number
  repRange?: Range
  durationRange?: Range
}

export function parsePlanElement(
  raw: unknown,
  index: number,
  ctx: TrainingImportContext,
  /** Éléments `exercise` valides de la même réponse (index source → exercice). */
  created: ReadonlyMap<number, ExerciseInput>,
): ImportPreviewItem {
  const o = asRaw(raw)
  const errors: string[] = []
  const warnings: string[] = []

  let durationMin: SessionDuration = 30
  const dn = toNum(o.durationMin)
  if (absent(o.durationMin)) errors.push('durée de la séance manquante (durationMin : 20, 30, 45 ou 60)')
  else if (dn === undefined || dn <= 0 || dn > 240)
    errors.push(`durée invalide « ${String(o.durationMin)} » (20, 30, 45 ou 60)`)
  else {
    durationMin = nearestDuration(dn)
    if (durationMin !== dn) warnings.push(`durée ${String(dn)} min arrondie à ${durationMin} min`)
  }

  if (!Array.isArray(o.blocks) || o.blocks.length === 0) {
    errors.push(absent(o.blocks) ? 'blocks manquants' : 'blocks doit être une liste non vide')
    return { kind: 'invalid', index, errors }
  }

  if (o.blocks.length > PLAN_MAX_LINES) {
    return {
      kind: 'invalid',
      index,
      errors: [`trop de lignes (${String(o.blocks.length)}) : ${String(PLAN_MAX_LINES)} au maximum`],
    }
  }

  const byName = new Map<string, number>()
  for (const [i, e] of created) if (!byName.has(norm(e.name))) byName.set(norm(e.name), i)

  interface Line {
    block: ImportedPlanBlock
    rawGroup: string | null
  }
  const lines: Line[] = []
  const unknown: string[] = []

  o.blocks.forEach((b: unknown, k: number) => {
    const label = `ligne ${k + 1}`
    if (typeof b !== 'object' || b === null || Array.isArray(b)) {
      errors.push(`${label} : ce n’est pas un objet`)
      return
    }
    const r = asRaw(b)
    if (absent(r.exerciseId) || typeof r.exerciseId !== 'string') {
      errors.push(`${label} : exerciseId manquant`)
      return
    }
    const ref = r.exerciseId.trim()
    if (ref.length > MAX_ID_LENGTH) {
      errors.push(`${label} : exerciseId trop long (${String(MAX_ID_LENGTH)} caractères au maximum)`)
      return
    }
    let exerciseId: Id
    let newIdx: number | undefined
    let target: Target
    const found = findExercise(ref, ctx.exercises)
    if (found) {
      exerciseId = found.exercise.id
      target = found.exercise
      if (found.byName)
        warnings.push(`« ${ref} » reconnu comme « ${found.exercise.name} » (${found.exercise.id})`)
    } else {
      const ni = byName.get(norm(ref))
      const ex = ni === undefined ? undefined : created.get(ni)
      if (ni === undefined || ex === undefined) {
        if (!unknown.includes(ref)) {
          if (unknown.length < MAX_UNKNOWN_IDS) unknown.push(ref)
          warnings.push(
            `exercice inconnu « ${ref} » : ligne écartée (utilise un exerciseId fourni ou ajoute un objet exercise)`,
          )
        }
        return
      }
      exerciseId = ref
      newIdx = ni
      target = ex
    }

    // Séries
    const sets = toNum(r.sets)
    if (sets === undefined || !Number.isInteger(sets) || sets < 1 || sets > PLAN_MAX_SETS) {
      errors.push(`${label} (${ref}) : sets doit être un entier entre 1 et ${PLAN_MAX_SETS}`)
      return
    }

    // Cible : durée si l'exercice se mesure en durée, sinon répétitions.
    const timedTarget = target.durationRange !== undefined && target.repRange === undefined
    let reps: Range | undefined
    let durationSec: number | undefined
    const hasReps = !absent(r.reps)
    const hasDur = !absent(r.durationSec)
    if (hasReps) {
      const rg = toRange(r.reps)
      if (rg === undefined || intRangeError(rg, 1, MAX_REPS)) {
        errors.push(`${label} (${ref}) : reps doit être [min, max] (entiers entre 1 et ${MAX_REPS})`)
        return
      }
      reps = rg
    }
    if (hasDur) {
      const d = toNum(r.durationSec)
      if (d === undefined || !Number.isInteger(d) || d < 5 || d > MAX_DURATION_SEC) {
        errors.push(`${label} (${ref}) : durationSec doit être un entier de 5 à ${MAX_DURATION_SEC}`)
        return
      }
      durationSec = d
    }
    if (timedTarget && reps !== undefined) {
      reps = undefined
      warnings.push(`${ref} se mesure en durée : reps ignoré`)
    }
    if (!timedTarget && durationSec !== undefined) {
      durationSec = undefined
      warnings.push(`${ref} se mesure en répétitions : durationSec ignoré`)
    }
    if (timedTarget && durationSec === undefined) durationSec = target.durationRange?.[0]
    if (!timedTarget && reps === undefined) reps = target.repRange ? [...target.repRange] : [8, 12]

    // Charge
    let loadKg: number | undefined
    if (!absent(r.loadKg)) {
      const l = toNum(r.loadKg)
      if (l === undefined || l < 0) {
        errors.push(`${label} (${ref}) : loadKg invalide`)
        return
      }
      if (target.loadType !== 'kettlebell') {
        if (l > 0) warnings.push(`${ref} : pas de kettlebell sur cet exercice, charge ignorée`)
      } else if (l > 0) {
        const kb = ctx.kettlebell
        if (kb === undefined) {
          loadKg = Math.min(Math.round(l), SAFE_MAX_LOAD_KG)
        } else {
          const step = kb.stepKg > 0 ? kb.stepKg : 1
          const clamped = Math.min(Math.max(l, kb.minKg), kb.maxKg)
          const snapped = kb.minKg + Math.floor((clamped - kb.minKg) / step + 1e-9) * step
          loadKg = Math.min(Math.round(snapped * 100) / 100, kb.maxKg)
        }
        if (loadKg !== l)
          warnings.push(
            `${ref} : charge ${String(l)} kg ramenée à ${String(loadKg)} kg (plage et pas de ta kettlebell)`,
          )
      }
    }

    // Repos
    let restSec = target.restSec
    if (!absent(r.restSec)) {
      const n = toNum(r.restSec)
      if (n === undefined || !Number.isInteger(n) || n < 0 || n > MAX_REST_SEC) {
        errors.push(`${label} (${ref}) : restSec doit être un entier de 0 à ${MAX_REST_SEC}`)
        return
      }
      restSec = n
    }

    let group: string | null = null
    if (!absent(r.group)) {
      if (
        (typeof r.group !== 'number' && typeof r.group !== 'string') ||
        String(r.group).length > MAX_GROUP_LENGTH
      ) {
        errors.push(
          `${label} (${ref}) : group doit être un nombre ou un texte de ${String(MAX_GROUP_LENGTH)} caractères au plus`,
        )
        return
      }
      group = String(r.group)
    }
    const block: ImportedPlanBlock = clean({
      exerciseId,
      sets,
      reps,
      durationSec,
      loadKg,
      restSec,
      newExerciseIndex: newIdx,
    })
    lines.push({ block, rawGroup: group })
  })

  if (errors.length > 0) return { kind: 'invalid', index, errors }
  if (lines.length === 0) {
    return {
      kind: 'invalid',
      index,
      errors: [
        unknown.length > 0
          ? `aucun exercice reconnu (inconnus : ${unknown.join(', ')})`
          : 'la séance ne contient aucune ligne',
      ],
    }
  }

  const totalSets = lines.reduce((a, l) => a + l.block.sets, 0)
  if (totalSets > PLAN_MAX_TOTAL_SETS) {
    return {
      kind: 'invalid',
      index,
      errors: [`trop de séries au total (${String(totalSets)}) : ${String(PLAN_MAX_TOTAL_SETS)} au maximum`],
    }
  }
  const fmt = SESSION_FORMATS[durationMin]
  if (lines.length > fmt.exercises[1] + 1 || totalSets > fmt.exercises[1] * fmt.sets[1] + 3) {
    warnings.push(
      `séance chargée pour ${String(durationMin)} min (${String(lines.length)} exercices, ${String(totalSets)} séries) : le format habituel est de ${String(fmt.exercises[1])} exercices et ${String(fmt.sets[1])} séries chacun au plus`,
    )
  }

  // Blocs : lignes consécutives de même group → superset, par paires au plus (le reste d'un groupe de 3 ou plus
  // devient un nouveau bloc, avec avertissement).
  const blocks: ImportedPlanBlock[] = []
  let g = -1
  let prev: string | null | undefined
  let inRun = 0
  let split = false
  const runLength = new Map<number, number>()
  lines.forEach((l, i) => {
    let sameRun = i > 0 && l.rawGroup !== null && l.rawGroup === prev
    if (sameRun && inRun >= SUPERSET_MAX) {
      sameRun = false
      split = true
    }
    if (!sameRun) {
      g++
      inRun = 0
    }
    inRun++
    prev = l.rawGroup
    runLength.set(g, (runLength.get(g) ?? 0) + 1)
    blocks.push({ ...l.block, group: g })
  })
  if (split)
    warnings.push(
      `un groupe de plus de ${String(SUPERSET_MAX)} exercices a été découpé en supersets de ${String(SUPERSET_MAX)}`,
    )
  const plan: ImportedSessionPlan = {
    durationMin,
    blocks: blocks.map((b) => ({
      ...b,
      kind: (runLength.get(b.group ?? 0) ?? 1) > 1 ? ('superset' as const) : ('single' as const),
    })),
    unknownExerciseIds: unknown,
  }
  if (ctx.planIssues) {
    const names = new Map(ctx.exercises.map((e) => [e.id, e.name]))
    const template = resolvePlanBlocks(
      { ...plan, blocks: plan.blocks.filter((b) => b.newExerciseIndex === undefined) },
      new Map(),
    )
    for (const issue of ctx.planIssues(template)) {
      warnings.push(
        `« ${names.get(issue.exerciseId) ?? issue.exerciseId} » sera écartée de la séance : ${issue.message}`,
      )
    }
  }
  if (ctx.newExerciseIssue) {
    for (const b of plan.blocks) {
      const ex = b.newExerciseIndex === undefined ? undefined : created.get(b.newExerciseIndex)
      const issue = ex === undefined ? null : ctx.newExerciseIssue(ex)
      if (issue !== null) warnings.push(`« ${b.exerciseId} » sera écartée de la séance : ${issue}`)
    }
  }
  if (plan.blocks.some((b) => b.loadKg !== undefined)) {
    warnings.push('Charges plafonnées à ta progression : l’app ne monte jamais au-delà.')
  }
  return { kind: 'sessionPlan', index, plan, warnings }
}

// Réexporté pour les appelants existants ; la définition vit dans ./plan (sans dépendance, importable par src/db).
export { resolvePlanBlocks }
