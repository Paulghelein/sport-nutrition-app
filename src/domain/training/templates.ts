// Modèles de séance (SPEC §3.5 « Enregistrer comme modèle ») : fonctions pures.
import type { Id, Range } from '../../types/common'
import type { EngineInput, SessionPlan } from '../../types/engine'
import type { Equipment } from '../../types/profile'
import type {
  ExerciseState,
  LibraryExercise,
  Session,
  SessionBlock,
  SessionDuration,
  SessionExercise,
  SessionTemplate,
  SetEntry,
  TemplateBlock,
} from '../../types/training'
import { deloadSets, deloadStatus } from './deload'
import { estimateSeconds } from './estimate'
import { SESSION_FORMATS, buildWarmup, planFocus } from './generate'
import { patternLevels } from './levels'
import { isAvailable } from './library'
import { isMidReplacement } from './guided'
import { snapLoadDown } from './loads'
import { buildSessionExercise, buildTargetSets, isLearningUnloaded } from './sets'

export type TemplateDraft = Omit<SessionTemplate, 'id' | 'createdAt' | 'updatedAt'>

/**
 * Nombre de séries d'avant le deload, pour qu'un modèle enregistré pendant un deload ne fige pas le volume
 * réduit. `deloadSets` n'est pas inversible (3 et 4 → 2) : on retient la plus petite valeur ≥ 3 qui redonne
 * `n` (2 → 3, 3 → 5), choix prudent pour un débutant. 1 série reste 1. Un finisher (2 séries, non réduit par le
 * deload) garde son nombre.
 */
export function setsBeforeDeload(n: number, kind: SessionBlock['kind']): number {
  if (kind === 'finisher' || n <= 1) return n
  for (let m = 3; m <= 2 * n + 1; m++) if (deloadSets(m) === n) return m
  return n
}

/**
 * Modèle tiré d'une séance (ou de blocs en cours d'édition) : un `TemplateBlock` par exercice, dans l'ordre,
 * avec `group` = index du bloc d'origine et `kind` = sa nature (superset, finisher conservés).
 * - Séries = séries non passées (un exercice entièrement passé est omis) ; cibles, charge et repos de la première
 *   de ces séries.
 * - Remplacement en cours d'exercice (`isMidReplacement`) : l'exercice remplacé est omis, le remplaçant reçoit
 *   le nombre total de séries prévu pour l'exercice remplacé (y compris en chaîne).
 * - Deload (`session.deload`, ou `opts.deload` pour des blocs) : nombre de séries d'avant le deload
 *   (`setsBeforeDeload`), le modèle décrit une séance normale ; `planFromTemplate` réapplique le deload si besoin.
 */
export function templateFromSession(
  source: Session | readonly SessionBlock[],
  name: string,
  durationMin: SessionDuration,
  opts: { deload?: boolean } = {},
): TemplateDraft {
  const isSessionSource = 'blocks' in source
  const blocks: readonly SessionBlock[] = isSessionSource ? source.blocks : source
  const deload = isSessionSource ? source.deload : opts.deload === true
  const out: TemplateBlock[] = []
  blocks.forEach((b, group) => {
    // Total prévu hérité de l'exercice remplacé en cours d'exercice.
    let carried: number | undefined
    b.exercises.forEach((se, k) => {
      const inherited = isMidReplacement(b, k) ? carried : undefined
      if (isMidReplacement(b, k + 1)) {
        carried = inherited ?? se.sets.length
        return
      }
      carried = undefined
      const kept = se.sets.filter((s) => s.status !== 'skipped')
      const first = kept[0] ?? (inherited !== undefined ? se.sets[0] : undefined)
      if (first === undefined) return
      const count = inherited ?? kept.length
      const tb: TemplateBlock = {
        group,
        kind: b.kind,
        exerciseId: se.exerciseId,
        sets: deload ? setsBeforeDeload(count, b.kind) : count,
        restSec: se.restSec,
      }
      if (first.targetReps !== undefined) tb.reps = [first.targetReps[0], first.targetReps[1]]
      if (first.targetDurationSec !== undefined) tb.durationSec = first.targetDurationSec
      if (first.loadKg !== undefined) tb.loadKg = first.loadKg
      out.push(tb)
    })
  })
  return { name: name.trim(), durationMin, blocks: out }
}

/**
 * Lignes du modèle regroupées en blocs : lignes consécutives de même `group` ; une ligne sans `group`
 * (modèle antérieur à J4) forme un bloc à elle seule.
 */
function groupRuns(rows: readonly TemplateBlock[]): TemplateBlock[][] {
  const runs: TemplateBlock[][] = []
  let prev: TemplateBlock | undefined
  for (const tb of rows) {
    const last = runs.at(-1)
    if (last !== undefined && prev?.group !== undefined && tb.group === prev.group) last.push(tb)
    else runs.push([tb])
    prev = tb
  }
  return runs
}

export type TemplateIssueReason = 'missing' | 'equipment' | 'hidden' | 'level' | 'no_target'

export interface TemplateIssue {
  exerciseId: Id
  reason: TemplateIssueReason
}

function issueOf(
  ex: LibraryExercise | undefined,
  input: EngineInput,
  levels: ReturnType<typeof patternLevels>,
  stateIds: ReadonlySet<Id>,
): TemplateIssueReason | undefined {
  if (ex === undefined || ex.deleted === true) return 'missing'
  if (!isAvailable(ex, input.equipment)) return 'equipment'
  if (ex.preference === 'hidden') return 'hidden'
  if (ex.repRange === undefined && ex.durationRange === undefined) return 'no_target'
  // Pas de déblocage implicite : un exercice au-dessus du niveau atteint (profil abaissé…) est écarté.
  if (!stateIds.has(ex.id) && ex.level > levels[ex.pattern]) return 'level'
  return undefined
}

/**
 * Exercices du modèle qui seront ignorés par `planFromTemplate`, avec la raison (à signaler à l'utilisateur) :
 * disparu ou supprimé, matériel manquant, masqué, sans cible, niveau non atteint.
 */
export function templateIssues(
  template: Pick<SessionTemplate, 'blocks'>,
  input: EngineInput,
): TemplateIssue[] {
  const index = new Map(input.library.map((e) => [e.id, e]))
  const levels = patternLevels(input.library, input.states, input.profileLevel)
  const stateIds = new Set(input.states.map((s) => s.exerciseId))
  const issues: TemplateIssue[] = []
  for (const tb of template.blocks) {
    const reason = issueOf(index.get(tb.exerciseId), input, levels, stateIds)
    if (reason !== undefined) issues.push({ exerciseId: tb.exerciseId, reason })
  }
  return issues
}

// ---------------------------------------------------------------------------------------------------------------
// Cibles du modèle (séance proposée par Claude, J9)

export interface PlanFromTemplateOptions {
  /**
   * Utiliser les cibles enregistrées dans le modèle (`reps`, `durationSec`, `loadKg`) au lieu de les recalculer
   * depuis les états. Défaut `false` (modèles de l'utilisateur : la progression continue). Voir `templateTargets`.
   */
  useTemplateTargets?: boolean
}

/** Pourquoi la charge retenue diffère de la charge demandée par le modèle. */
type LoadNote = 'progression' | 'adjustable' | 'min' | 'unloaded' | 'not_kettlebell'

interface TemplateTargets {
  entry: SetEntry
  /** Charge demandée par le modèle (valide), absente si aucune. */
  requestedKg?: number
  loadNote?: LoadNote
  ignoredReps: boolean
  ignoredDuration: boolean
}

const EPS = 1e-9

/**
 * Fourchette de répétitions valide (entiers, 1 ≤ min ≤ max), le haut plafonné au haut de la fourchette de
 * l'exercice (`maxReps`) et le bas ramené sous ce haut. `undefined` si invalide.
 */
function validReps(r: Range | undefined, maxReps: number): Range | undefined {
  if (r === undefined || !Array.isArray(r) || r.length !== 2) return undefined
  const lo = Math.round(r[0])
  const hi = Math.round(r[1])
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < 1 || hi < lo) return undefined
  const cappedHi = Math.min(hi, maxReps)
  return [Math.min(lo, cappedHi), cappedHi]
}

/**
 * Cibles d'un exercice d'après la ligne du modèle (`useTemplateTargets`), en partant de ce que le moteur aurait
 * mis (`buildTargetSets`) :
 * - `reps` valide (entiers, 1 ≤ min ≤ max) sur un exercice en répétitions → cible de répétitions, haut plafonné
 *   au haut de la fourchette de l'exercice ;
 *   `durationSec` > 0 sur un exercice en durée → cible de durée, plafonnée au haut de la fourchette de
 *   l'exercice (garde-fou contre une faute de frappe). Cible incompatible (reps pour un exercice en durée…) ou
 *   invalide : ignorée, la cible du moteur reste.
 * - `loadKg` (> 0) sur un exercice kettlebell → min(charge demandée, charge du moteur), arrondie vers le bas à
 *   une charge réglable (plancher : la plus petite charge réglable). Le modèle peut baisser la charge, jamais
 *   dépasser la progression. Exercice en apprentissage sans charge : aucune charge.
 */
function templateTargets(
  ex: LibraryExercise,
  state: ExerciseState | undefined,
  equipment: Equipment,
  tb: TemplateBlock,
): TemplateTargets {
  const engine = buildTargetSets(ex, state, equipment, 1)[0] ?? {}
  const entry: SetEntry = { ...engine }
  const out: TemplateTargets = { entry, ignoredReps: false, ignoredDuration: false }

  if (tb.reps !== undefined) {
    const reps = ex.repRange !== undefined ? validReps(tb.reps, ex.repRange[1]) : undefined
    if (reps !== undefined) entry.targetReps = reps
    else out.ignoredReps = true
  }
  if (tb.durationSec !== undefined) {
    const d = Math.round(tb.durationSec)
    if (ex.durationRange !== undefined && ex.repRange === undefined && Number.isFinite(d) && d > 0) {
      entry.targetDurationSec = Math.min(d, ex.durationRange[1])
    } else out.ignoredDuration = true
  }

  const asked = tb.loadKg
  if (asked !== undefined && Number.isFinite(asked) && asked > 0) {
    out.requestedKg = asked
    if (ex.loadType !== 'kettlebell') out.loadNote = 'not_kettlebell'
    else if (isLearningUnloaded(ex, state)) out.loadNote = 'unloaded'
    else {
      const engineKg = engine.loadKg ?? snapLoadDown(equipment.kettlebell.minKg, equipment.kettlebell)
      const kept = snapLoadDown(Math.min(asked, engineKg), equipment.kettlebell)
      entry.loadKg = kept
      if (asked > engineKg + EPS) out.loadNote = 'progression'
      else if (kept > asked + EPS) out.loadNote = 'min'
      else if (kept < asked - EPS) out.loadNote = 'adjustable'
    }
  }
  return out
}

/** Nombre en français : 12,5 ; 16. */
function kg(x: number): string {
  return `${String(Math.round(x * 100) / 100).replace('.', ',')} kg`
}

/**
 * Écarts entre les cibles demandées par le modèle et celles que `planFromTemplate(…, { useTemplateTargets: true })`
 * retiendra, en messages courts à afficher dans l'aperçu (un par écart, dans l'ordre du modèle). Les exercices
 * écartés (`templateIssues`) ne sont pas repris ici. Exemple :
 * « Goblet squat : 20 kg demandé, 16 kg retenu (ta progression) ».
 */
export function templateTargetNotes(template: Pick<SessionTemplate, 'blocks'>, input: EngineInput): string[] {
  const index = new Map(input.library.map((e) => [e.id, e]))
  const levels = patternLevels(input.library, input.states, input.profileLevel)
  const stateById = new Map(input.states.map((s) => [s.exerciseId, s]))
  const stateIds = new Set(stateById.keys())
  const notes: string[] = []
  for (const tb of template.blocks) {
    const ex = index.get(tb.exerciseId)
    if (ex === undefined || issueOf(ex, input, levels, stateIds) !== undefined) continue
    const t = templateTargets(ex, stateById.get(ex.id), input.equipment, tb)
    if (t.ignoredReps) {
      notes.push(
        ex.repRange === undefined
          ? `${ex.name} : répétitions demandées ignorées (exercice en durée)`
          : `${ex.name} : répétitions demandées invalides, fourchette habituelle retenue`,
      )
    } else if (
      tb.reps !== undefined &&
      t.entry.targetReps !== undefined &&
      t.entry.targetReps[1] < Math.round(tb.reps[1])
    ) {
      notes.push(
        `${ex.name} : ${Math.round(tb.reps[0])}-${Math.round(tb.reps[1])} répétitions demandées, ${t.entry.targetReps[0]}-${t.entry.targetReps[1]} retenues (maximum de l’exercice)`,
      )
    }
    if (t.ignoredDuration) {
      notes.push(
        ex.durationRange === undefined || ex.repRange !== undefined
          ? `${ex.name} : durée demandée ignorée (exercice en répétitions)`
          : `${ex.name} : durée demandée invalide, durée habituelle retenue`,
      )
    } else if (
      tb.durationSec !== undefined &&
      t.entry.targetDurationSec !== undefined &&
      t.entry.targetDurationSec < Math.round(tb.durationSec)
    ) {
      notes.push(
        `${ex.name} : ${Math.round(tb.durationSec)} s demandées, ${t.entry.targetDurationSec} s retenues (maximum de l’exercice)`,
      )
    }
    const asked = t.requestedKg
    if (asked === undefined || t.loadNote === undefined) continue
    const kept = t.entry.loadKg
    switch (t.loadNote) {
      case 'not_kettlebell':
        notes.push(`${ex.name} : charge demandée ignorée (exercice sans kettlebell)`)
        break
      case 'unloaded':
        notes.push(`${ex.name} : charge demandée ignorée (apprentissage sans charge)`)
        break
      case 'progression':
        notes.push(`${ex.name} : ${kg(asked)} demandé, ${kg(kept ?? 0)} retenu (ta progression)`)
        break
      case 'min':
        notes.push(`${ex.name} : ${kg(asked)} demandé, ${kg(kept ?? 0)} retenu (minimum de ta kettlebell)`)
        break
      case 'adjustable':
        notes.push(`${ex.name} : ${kg(asked)} demandé, ${kg(kept ?? 0)} retenu (charge réglable)`)
        break
    }
  }
  return notes
}

/**
 * Séance du jour tirée d'un modèle : blocs reconstruits depuis `group` / `kind` (supersets, finisher ; sans
 * `group` : un bloc simple par exercice), nombre de séries et repos du modèle,
 * cibles et charges recalculées depuis les états actuels (le modèle ne fige pas la charge : la progression
 * continue), échauffement généré (durée par défaut du format), deload appliqué comme pour une séance générée.
 * Exercices ignorés : voir `templateIssues`. Date, matériel, états et historique viennent de `input`
 * (`input.durationMin` est remplacé par celui du modèle).
 * `opts.useTemplateTargets` (séance proposée par Claude) : cibles et charge du modèle retenues avec garde-fous
 * (voir `templateTargets` ; écarts décrits par `templateTargetNotes`) ; séries, repos et deload inchangés.
 */
export function planFromTemplate(
  template: Pick<SessionTemplate, 'blocks' | 'durationMin'>,
  input: EngineInput,
  opts: PlanFromTemplateOptions = {},
): SessionPlan {
  const index = new Map(input.library.map((e) => [e.id, e]))
  const levels = patternLevels(input.library, input.states, input.profileLevel)
  const stateById = new Map(input.states.map((s) => [s.exerciseId, s]))
  const stateIds = new Set(stateById.keys())
  const deloadState = deloadStatus(input.sessions, input.date, input.settings)
  const deload = deloadState.active

  const blocks: SessionBlock[] = []
  for (const run of groupRuns(template.blocks)) {
    const exercises: SessionExercise[] = []
    for (const tb of run) {
      const ex = index.get(tb.exerciseId)
      if (ex === undefined || issueOf(ex, input, levels, stateIds) !== undefined) continue
      const n = Math.max(1, Math.floor(Number.isFinite(tb.sets) ? tb.sets : 1))
      const sets = deload ? deloadSets(n) : n
      const rest = Number.isFinite(tb.restSec) && tb.restSec >= 0 ? tb.restSec : ex.restSec
      const state = stateById.get(ex.id)
      const se = buildSessionExercise(ex, state, input.equipment, sets, rest)
      if (opts.useTemplateTargets === true) {
        const { entry } = templateTargets(ex, state, input.equipment, tb)
        se.sets = se.sets.map(() => ({ ...entry }))
      }
      exercises.push(se)
    }
    if (exercises.length === 0) continue
    const kind = run[0]?.kind ?? 'single'
    // Superset réduit à un exercice (l'autre a été écarté) : bloc simple.
    blocks.push({
      id: `b${blocks.length + 1}`,
      kind: kind === 'superset' && exercises.length < 2 ? 'single' : kind,
      exercises,
    })
  }

  const warmupMin = SESSION_FORMATS[template.durationMin].defaultWarmup
  const engineInput: EngineInput = { ...input, durationMin: template.durationMin }
  return {
    date: input.date,
    durationMin: template.durationMin,
    warmup: buildWarmup(blocks, index, warmupMin, input.equipment.kettlebell),
    warmupMin,
    blocks,
    deload,
    ...(deload && deloadState.reason !== undefined ? { deloadReason: deloadState.reason } : {}),
    estimatedMin: Math.round(estimateSeconds(blocks, input.library, warmupMin) / 60),
    focus: planFocus(engineInput, blocks),
  }
}
