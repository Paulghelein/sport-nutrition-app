// Modèles de séance (SPEC §3.5 « Enregistrer comme modèle ») : fonctions pures.
import type { Id } from '../../types/common'
import type { EngineInput, SessionPlan } from '../../types/engine'
import type {
  LibraryExercise,
  Session,
  SessionBlock,
  SessionDuration,
  SessionExercise,
  SessionTemplate,
  TemplateBlock,
} from '../../types/training'
import { deloadSets, deloadStatus } from './deload'
import { estimateSeconds } from './estimate'
import { SESSION_FORMATS, buildWarmup, planFocus } from './generate'
import { patternLevels } from './levels'
import { isAvailable } from './library'
import { isMidReplacement } from './guided'
import { buildSessionExercise } from './sets'

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

/**
 * Séance du jour tirée d'un modèle : blocs reconstruits depuis `group` / `kind` (supersets, finisher ; sans
 * `group` : un bloc simple par exercice), nombre de séries et repos du modèle,
 * cibles et charges recalculées depuis les états actuels (le modèle ne fige pas la charge : la progression
 * continue), échauffement généré (durée par défaut du format), deload appliqué comme pour une séance générée.
 * Exercices ignorés : voir `templateIssues`. Date, matériel, états et historique viennent de `input`
 * (`input.durationMin` est remplacé par celui du modèle).
 */
export function planFromTemplate(
  template: Pick<SessionTemplate, 'blocks' | 'durationMin'>,
  input: EngineInput,
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
      exercises.push(buildSessionExercise(ex, stateById.get(ex.id), input.equipment, sets, rest))
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
