// Séance guidée (SPEC §3.4) et édition avant départ (SPEC §3.2, §3.5) : fonctions pures sur `Session` /
// `SessionBlock[]`. Rien n'est lu ici (ni horloge ni base) : `now` et `id` arrivent en paramètre ; chaque
// fonction rend une copie, l'entrée n'est jamais modifiée.
//
// Ordre de passage (contrat GuidedStep, src/types/guided.ts) :
// - bloc `single` / `finisher` : exercice après exercice, toutes ses séries dans l'ordre ;
// - bloc `superset` : tour par tour (série 1 de A, série 1 de B, série 2 de A…).
//   Exception : un exercice inséré par un remplacement en cours d'exercice (`replacedFrom` = l'exercice qui le
//   précède dans le bloc) reprend les tours restants de l'exercice remplacé au lieu de repartir du tour 1
//   (A1 B1 | A2 C1 | A3 C2 plutôt que A1 B1 C1 | A2 C2 | A3).
import type { IsoDateTime } from '../../types/common'
import type { SessionPlan } from '../../types/engine'
import type { GuidedStep, RestPlan, SetInput } from '../../types/guided'
import type { Equipment } from '../../types/profile'
import type {
  Exercise,
  ExerciseState,
  Id,
  Session,
  SessionBlock,
  SessionCursor,
  SessionExercise,
  SetEntry,
} from '../../types'
import { deloadSets } from './deload'
import { SUPERSET_TRANSITION_SEC, estimateMinutes } from './estimate'
import { buildSessionExercise } from './sets'

// ---------------------------------------------------------------------------------------------------------------
// Ordre des séries

interface Slot {
  cursor: SessionCursor
  /** Tour dans un superset ; numéro d'ordre sans importance ailleurs. */
  round: number
}

function sameCursor(a: SessionCursor, b: SessionCursor): boolean {
  return a.block === b.block && a.exercise === b.exercise && a.set === b.set
}

function isPending(set: SetEntry | undefined): boolean {
  return set !== undefined && set.status === undefined
}

/**
 * L'exercice `k` du bloc a été inséré par un remplacement en cours d'exercice : il remplace l'exercice qui le
 * précède (`replacedFrom` = cet exercice, qui a des séries faites et des séries passées).
 */
export function isMidReplacement(block: SessionBlock, k: number): boolean {
  const se = block.exercises[k]
  const prev = block.exercises[k - 1]
  return (
    se !== undefined &&
    prev !== undefined &&
    se.replacedFrom === prev.exerciseId &&
    prev.sets.some((s) => s.status === 'done') &&
    prev.sets.some((s) => s.status === 'skipped')
  )
}

/** Décalage de tour d'un exercice inséré par remplacement en cours d'exercice (voir l'en-tête). */
function roundOffset(block: SessionBlock, k: number): number {
  let offset = 0
  for (let i = k; i > 0 && isMidReplacement(block, i); i--) {
    const se = block.exercises[i] as SessionExercise
    const prev = block.exercises[i - 1] as SessionExercise
    offset += Math.max(0, prev.sets.length - se.sets.length)
  }
  return offset
}

function blockSlots(block: SessionBlock, b: number): Slot[] {
  const slots: Slot[] = []
  block.exercises.forEach((se, e) => {
    const offset = block.kind === 'superset' ? roundOffset(block, e) : 0
    se.sets.forEach((_, s) => slots.push({ cursor: { block: b, exercise: e, set: s }, round: offset + s }))
  })
  if (block.kind === 'superset') {
    slots.sort((x, y) => x.round - y.round || x.cursor.exercise - y.cursor.exercise)
  }
  return slots
}

function allSlots(blocks: readonly SessionBlock[]): Slot[] {
  return blocks.flatMap((block, b) => blockSlots(block, b))
}

function blocksOf(target: Session | readonly SessionBlock[]): readonly SessionBlock[] {
  return isSession(target) ? target.blocks : target
}

function isSession(target: Session | readonly SessionBlock[]): target is Session {
  return !Array.isArray(target)
}

/** Toutes les séries de la séance dans l'ordre de passage (faites, passées ou à faire). */
export function sessionSteps(target: Session | readonly SessionBlock[]): SessionCursor[] {
  return allSlots(blocksOf(target)).map((s) => s.cursor)
}

/** Série visée par un curseur ; `undefined` si le curseur ne désigne aucune série. */
export function setAt(
  target: Session | readonly SessionBlock[],
  cursor: SessionCursor,
): SetEntry | undefined {
  return blocksOf(target)[cursor.block]?.exercises[cursor.exercise]?.sets[cursor.set]
}

function firstPending(
  blocks: readonly SessionBlock[],
  slots: readonly Slot[],
  from: number,
  to = slots.length,
): Slot | undefined {
  for (let i = Math.max(0, from); i < Math.min(to, slots.length); i++) {
    const slot = slots[i] as Slot
    if (isPending(setAt(blocks, slot.cursor))) return slot
  }
  return undefined
}

function toStep(slot: Slot | undefined): GuidedStep {
  return slot === undefined ? { kind: 'finished' } : { kind: 'set', cursor: slot.cursor }
}

/**
 * Pas courant (reprise) : première série à faire à partir de `session.cursor` (inclus), puis depuis le début
 * s'il reste des séries avant (séries passées puis rendues, remplacement). Curseur absent ou invalide → depuis
 * le début. Plus rien à faire → `finished`.
 */
export function currentStep(session: Session): GuidedStep {
  const slots = allSlots(session.blocks)
  const cursor = session.cursor
  const at = cursor === undefined ? -1 : slots.findIndex((s) => sameCursor(s.cursor, cursor))
  if (at < 0) return toStep(firstPending(session.blocks, slots, 0))
  return toStep(firstPending(session.blocks, slots, at) ?? firstPending(session.blocks, slots, 0, at))
}

/**
 * Pas suivant `from` : première série à faire après `from`, puis depuis le début ; `from` lui-même seulement
 * s'il est la dernière série à faire. Plus rien → `finished`.
 */
export function nextStep(session: Session, from: SessionCursor): GuidedStep {
  const slots = allSlots(session.blocks)
  const at = slots.findIndex((s) => sameCursor(s.cursor, from))
  if (at < 0) return toStep(firstPending(session.blocks, slots, 0))
  return toStep(
    firstPending(session.blocks, slots, at + 1) ??
      firstPending(session.blocks, slots, 0, at) ??
      firstPending(session.blocks, slots, at, at + 1),
  )
}

// ---------------------------------------------------------------------------------------------------------------
// Repos

function validRest(sec: number, fallback: number | undefined): number {
  if (Number.isFinite(sec) && sec >= 0) return Math.round(sec)
  return fallback !== undefined && Number.isFinite(fallback) && fallback >= 0 ? Math.round(fallback) : 0
}

/**
 * Repos après le tour d'un superset : le plus long des exercices encore actifs du bloc (au moins une série non
 * passée), comme l'estimation de durée.
 */
function roundRest(block: SessionBlock, index: ReadonlyMap<Id, Exercise>): number {
  const active = block.exercises.filter((se) => se.sets.some((s) => s.status !== 'skipped'))
  const members = active.length > 0 ? active : block.exercises
  return Math.max(0, ...members.map((se) => validRest(se.restSec, index.get(se.exerciseId)?.restSec)))
}

/**
 * Repos à lancer après la série `cursor` (vers la prochaine série à faire, les séries faites ou passées étant
 * sautées) :
 * - même exercice (ou exercice suivant d'un bloc simple) → `set`, repos ajusté du plan (`SessionExercise.restSec`) ;
 * - superset, même tour → `transition` (`SUPERSET_TRANSITION_SEC`) ; tour suivant → `round` (le plus long) ;
 * - bloc suivant → `block` : repos de l'exercice fait (superset : repos du tour, celui compté par l'estimation) ;
 * - plus rien à faire → `none` (0 s).
 * La bibliothèque sert de repli si le repos du plan est invalide. Curseur invalide → `none`.
 */
export function restAfter(session: Session, cursor: SessionCursor, library: readonly Exercise[]): RestPlan {
  const index = new Map(library.map((e) => [e.id, e]))
  const blocks = session.blocks
  const slots = allSlots(blocks)
  const at = slots.findIndex((s) => sameCursor(s.cursor, cursor))
  const block = blocks[cursor.block]
  const se = block?.exercises[cursor.exercise]
  if (at < 0 || block === undefined || se === undefined) return { kind: 'none', seconds: 0 }

  const own = validRest(se.restSec, index.get(se.exerciseId)?.restSec)
  const blockRest = block.kind === 'superset' ? roundRest(block, index) : own
  const next = firstPending(blocks, slots, at + 1)
  if (next === undefined) {
    // Des séries restent avant (passées puis rendues) : on y revient après un repos normal.
    return firstPending(blocks, slots, 0, at) === undefined
      ? { kind: 'none', seconds: 0 }
      : { kind: 'block', seconds: blockRest }
  }
  if (next.cursor.block !== cursor.block) return { kind: 'block', seconds: blockRest }
  if (block.kind === 'superset') {
    const current = slots[at] as Slot
    return next.round === current.round
      ? { kind: 'transition', seconds: SUPERSET_TRANSITION_SEC }
      : { kind: 'round', seconds: blockRest }
  }
  return { kind: 'set', seconds: own }
}

// ---------------------------------------------------------------------------------------------------------------
// Saisie

function invalidCursor(cursor: SessionCursor): RangeError {
  return new RangeError(
    `Série introuvable : bloc ${cursor.block}, exercice ${cursor.exercise}, série ${cursor.set}`,
  )
}

/** Copie de la séance avec la série `cursor` transformée (chemin copié, reste partagé). Curseur invalide → erreur. */
function mapSet(session: Session, cursor: SessionCursor, fn: (set: SetEntry) => SetEntry): Session {
  if (setAt(session, cursor) === undefined) throw invalidCursor(cursor)
  return {
    ...session,
    blocks: session.blocks.map((b, bi) =>
      bi !== cursor.block
        ? b
        : {
            ...b,
            exercises: b.exercises.map((se, ei) =>
              ei !== cursor.exercise
                ? se
                : { ...se, sets: se.sets.map((s, si) => (si === cursor.set ? fn(s) : s)) },
            ),
          },
    ),
  }
}

function clearResult(set: SetEntry): SetEntry {
  const { actualReps, actualDurationSec, feeling, status, ...rest } = set
  void [actualReps, actualDurationSec, feeling, status]
  return rest
}

/** Entier ≥ 0, ou `undefined` si la valeur n'est pas un nombre fini. */
function count(x: number | undefined): number | undefined {
  return x !== undefined && Number.isFinite(x) ? Math.max(0, Math.round(x)) : undefined
}

function withCursorAfter(session: Session, from: SessionCursor): Session {
  const step = nextStep(session, from)
  return { ...session, cursor: step.kind === 'set' ? step.cursor : from }
}

/**
 * Enregistre une série faite : `done`, reps ou durée réelles (entiers ≥ 0 ; valeur non finie ignorée), ressenti,
 * charge réellement utilisée si fournie (> 0). Une saisie précédente de la série est remplacée. Curseur avancé
 * à la prochaine série à faire (laissé sur la série si c'était la dernière). `restEndsAt` et `updatedAt` sont
 * gérés par l'appelant (horloge).
 */
export function recordSet(session: Session, cursor: SessionCursor, input: SetInput): Session {
  const reps = count(input.reps)
  const duration = count(input.durationSec)
  const updated = mapSet(session, cursor, (set) => {
    const next: SetEntry = { ...clearResult(set), status: 'done', feeling: input.feeling }
    if (reps !== undefined) next.actualReps = reps
    if (duration !== undefined) next.actualDurationSec = duration
    if (input.loadKg !== undefined && Number.isFinite(input.loadKg) && input.loadKg > 0) {
      next.loadKg = input.loadKg
    }
    return next
  })
  return withCursorAfter(updated, cursor)
}

/** Passe une série (`skipped`, résultat effacé) et avance le curseur. */
export function skipSet(session: Session, cursor: SessionCursor): Session {
  const updated = mapSet(session, cursor, (set) => ({ ...clearResult(set), status: 'skipped' }))
  return withCursorAfter(updated, cursor)
}

/** Passe toutes les séries restantes (à faire) d'un exercice ; le curseur va à la prochaine série à faire. */
export function skipExercise(session: Session, block: number, exercise: number): Session {
  const se = session.blocks[block]?.exercises[exercise]
  if (se === undefined) throw invalidCursor({ block, exercise, set: 0 })
  let updated = session
  se.sets.forEach((s, set) => {
    if (isPending(s))
      updated = mapSet(updated, { block, exercise, set }, (x) => ({ ...x, status: 'skipped' }))
  })
  const step = currentStep(updated)
  return step.kind === 'set' ? { ...updated, cursor: step.cursor } : updated
}

/**
 * Rend une série à faire (correction d'une erreur de saisie) : statut, reps, durée et ressenti effacés ;
 * la charge reste celle saisie (elle sera redemandée). Le curseur revient sur cette série.
 * Limite connue : si la charge saisie différait de la charge prévue, la charge prévue n'est pas rétablie
 * (`SetEntry` ne garde pas la charge prévue à part) ; l'écran de saisie la repropose telle quelle.
 */
export function undoSet(session: Session, cursor: SessionCursor): Session {
  return { ...mapSet(session, cursor, clearResult), cursor }
}

// ---------------------------------------------------------------------------------------------------------------
// Création, remplacement, édition

/** Séance `in_progress` créée au départ (« Commencer ») : `startedAt = now`, curseur sur la première série. */
export function sessionFromPlan(
  plan: SessionPlan,
  opts: { id: Id; now: IsoDateTime; templateId?: Id },
): Session {
  const blocks: SessionBlock[] = plan.blocks.map((b) => ({
    ...b,
    exercises: b.exercises.map((se) => ({ ...se, sets: se.sets.map((s) => ({ ...s })) })),
  }))
  const session: Session = {
    id: opts.id,
    date: plan.date,
    durationMin: plan.durationMin,
    status: 'in_progress',
    warmup: [...plan.warmup],
    blocks,
    deload: plan.deload,
    estimatedMin: plan.estimatedMin,
    warmupMin: plan.warmupMin,
    startedAt: opts.now,
    updatedAt: opts.now,
  }
  if (opts.templateId !== undefined) session.templateId = opts.templateId
  const first = firstPending(blocks, allSlots(blocks), 0)
  if (first !== undefined) session.cursor = first.cursor
  return session
}

/**
 * Durée estimée d'une séance enregistrée (après remplacement, ajout…), échauffement compris
 * (`session.warmupMin`, 0 si absent pour une séance antérieure à J4).
 */
export function sessionEstimateMinutes(session: Session, library: readonly Exercise[]): number {
  return estimateMinutes(session.blocks, library, session.warmupMin ?? 0)
}

/** Contexte de construction des séries d'un exercice remplacé ou ajouté. */
export interface ExerciseContext {
  /** État de progression de l'exercice remplaçant / ajouté (absent : charge minimale, durée minimale). */
  state: ExerciseState | undefined
  equipment: Equipment
  /** Séance en deload : nombre de séries par défaut réduit (`addExercise`). */
  deload: boolean
}

function exerciseAt(blocks: readonly SessionBlock[], b: number, e: number): SessionExercise {
  const se = blocks[b]?.exercises[e]
  if (se === undefined) throw invalidCursor({ block: b, exercise: e, set: 0 })
  return se
}

function replaceInBlocks(
  blocks: readonly SessionBlock[],
  b: number,
  e: number,
  replacement: Exercise,
  ctx: ExerciseContext,
): SessionBlock[] {
  const old = exerciseAt(blocks, b, e)
  const copy = blocks.map((x) => ({ ...x, exercises: [...x.exercises] }))
  const block = copy[b] as SessionBlock
  if (replacement.id === old.exerciseId) return copy

  const done = old.sets.filter((s) => s.status === 'done').length
  const pending = old.sets.filter(isPending).length
  if (done === 0) {
    // Sur place : autant de séries que l'exercice en avait à faire (toutes s'il était entièrement passé).
    const n = pending > 0 ? pending : old.sets.length
    const se = buildSessionExercise(replacement, ctx.state, ctx.equipment, n)
    se.replacedFrom = old.replacedFrom ?? old.exerciseId
    block.exercises[e] = se
    return copy
  }
  if (pending === 0) return copy // exercice terminé : rien à remplacer
  // En cours d'exercice : les séries restantes de l'ancien sont passées, le nouveau les reprend juste après.
  block.exercises[e] = {
    ...old,
    sets: old.sets.map((s) => (isPending(s) ? { ...s, status: 'skipped' as const } : s)),
  }
  const se = buildSessionExercise(replacement, ctx.state, ctx.equipment, pending)
  se.replacedFrom = old.exerciseId
  block.exercises.splice(e + 1, 0, se)
  return copy
}

/**
 * Remplace un exercice (SPEC §3.2, §3.4) ; les candidats viennent de `replacementCandidates` (garde de niveau).
 * - Aucune série faite : remplacé sur place (`replacedFrom` = exercice proposé à l'origine), séries cibles et
 *   charge recalculées depuis l'état du remplaçant (`buildSessionExercise`), autant de séries à faire, repos de
 *   l'exercice remplaçant.
 * - Des séries faites : les séries restantes de l'ancien passent `skipped`, le remplaçant est inséré juste après
 *   dans le même bloc avec ce nombre de séries (`replacedFrom` = l'ancien).
 * - Exercice terminé ou remplaçant identique : inchangé.
 * Sur une `Session`, le curseur va à la prochaine série à faire. `estimatedMin` n'est pas recalculé ici
 * (pas de bibliothèque) : `sessionEstimateMinutes` (séance) ou `estimateMinutes` (blocs) côté appelant.
 */
export function replaceExercise(
  target: Session,
  blockIdx: number,
  exIdx: number,
  replacement: Exercise,
  ctx: ExerciseContext,
): Session
export function replaceExercise(
  target: readonly SessionBlock[],
  blockIdx: number,
  exIdx: number,
  replacement: Exercise,
  ctx: ExerciseContext,
): SessionBlock[]
export function replaceExercise(
  target: Session | readonly SessionBlock[],
  blockIdx: number,
  exIdx: number,
  replacement: Exercise,
  ctx: ExerciseContext,
): Session | SessionBlock[] {
  const blocks = replaceInBlocks(blocksOf(target), blockIdx, exIdx, replacement, ctx)
  if (!isSession(target)) return blocks
  const updated: Session = { ...target, blocks }
  const step = currentStep(updated)
  return step.kind === 'set' ? { ...updated, cursor: step.cursor } : updated
}

/** Retire un exercice ; un bloc vide disparaît, un superset réduit à un exercice devient un bloc simple. */
export function removeExercise(
  blocks: readonly SessionBlock[],
  blockIdx: number,
  exIdx: number,
): SessionBlock[] {
  exerciseAt(blocks, blockIdx, exIdx)
  const out: SessionBlock[] = []
  blocks.forEach((b, i) => {
    if (i !== blockIdx) {
      out.push(b)
      return
    }
    const exercises = b.exercises.filter((_, k) => k !== exIdx)
    if (exercises.length === 0) return
    out.push({ ...b, kind: b.kind === 'superset' && exercises.length === 1 ? 'single' : b.kind, exercises })
  })
  return out
}

/** Séries d'un exercice ajouté à la main quand le nombre n'est pas précisé (deload : `deloadSets`). */
export const ADDED_EXERCISE_SETS = 3

/** Id de bloc libre : `b<n>` avec n = nombre de blocs + 1, augmenté jusqu'à ne plus entrer en collision. */
export function newBlockId(blocks: readonly SessionBlock[]): Id {
  const ids = new Set(blocks.map((b) => b.id))
  let n = blocks.length + 1
  while (ids.has(`b${n}`)) n++
  return `b${n}`
}

/**
 * Ajoute un exercice dans un nouveau bloc simple, à la fin ou juste avant un finisher final. Les candidats
 * viennent de `addCandidates` (garde de niveau). `sets` absent : 3 séries (deload : `deloadSets(3)` = 2).
 */
export function addExercise(
  blocks: readonly SessionBlock[],
  ex: Exercise,
  ctx: ExerciseContext,
  sets?: number,
): SessionBlock[] {
  const n = sets ?? (ctx.deload ? deloadSets(ADDED_EXERCISE_SETS) : ADDED_EXERCISE_SETS)
  const block: SessionBlock = {
    id: newBlockId(blocks),
    kind: 'single',
    exercises: [buildSessionExercise(ex, ctx.state, ctx.equipment, n)],
  }
  const out = [...blocks]
  const at = out.at(-1)?.kind === 'finisher' ? out.length - 1 : out.length
  out.splice(at, 0, block)
  return out
}

/**
 * Déplace un bloc de `from` à `to` (borné à la liste). Le finisher reste en dernier :
 * - déplacer un bloc `finisher` ailleurs qu'en dernière position → `RangeError` (l'UI ne doit pas le proposer) ;
 * - un autre bloc visé après le finisher final est placé juste avant lui (borné, pas d'erreur).
 * `from` invalide → `RangeError`.
 */
export function moveBlock(blocks: readonly SessionBlock[], from: number, to: number): SessionBlock[] {
  const moved = blocks[from]
  if (moved === undefined) throw new RangeError(`Bloc introuvable : ${from}`)
  const out = blocks.filter((_, i) => i !== from)
  let dest = Math.max(0, Math.min(out.length, Math.trunc(to)))
  if (moved.kind === 'finisher') {
    if (dest !== out.length) throw new RangeError('Le finisher reste en fin de séance')
  } else if (out.at(-1)?.kind === 'finisher') {
    dest = Math.min(dest, out.length - 1)
  }
  out.splice(dest, 0, moved)
  return out
}
