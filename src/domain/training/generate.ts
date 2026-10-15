// Génération d'une séance (SPEC §3.2, §3.5) : fonction pure et déterministe (graine = date).
//
// Étapes :
// 1. volume des 7 jours, cibles, groupes fatigués (< 48 h), niveau atteint par schéma ;
// 2. sélection gloutonne : on prend le groupe au plus grand déficit (en séries) et le meilleur exercice qui le
//    travaille en primaire ; le volume prévu est ajouté au fur et à mesure (pas deux exercices pour le même
//    déficit) ; un schéma n'est utilisé qu'une fois (≤ 30 min : strict ; au-delà : réutilisation pénalisée) ;
// 3. ajustement au temps : nombre d'exercices et de séries dans le format, échauffement de 3 à 6 min et repos
//    allongé jusqu'à × 1,5 si besoin, en retenant la combinaison dont l'estimation est la plus proche de la durée ;
// 4. deload : séries divisées par deux (au moins 2), charge inchangée (séance plus courte, volontairement).
import type { LocalDate } from '../../types/common'
import type { EngineInput, MuscleVolume, PatternLevels, SessionPlan } from '../../types/engine'
import type { Equipment, KettlebellSpec } from '../../types/profile'
import type {
  ExerciseState,
  LibraryExercise,
  MovementPattern,
  MuscleGroup,
  Range,
  Session,
  SessionBlock,
  SessionDuration,
  SessionExercise,
} from '../../types'
import { daysBetween } from '../shared/dates'
import { deloadSets, deloadStatus } from './deload'
import { estimateSeconds } from './estimate'
import { patternLevels } from './levels'
import { PATTERN_ORDER, isAvailable, sortLibrary } from './library'
import { snapLoadDown } from './loads'
import { seededUnit } from './random'
import { buildSessionExercise, isBallistic, isFinisherExercise } from './sets'
import {
  MUSCLE_GROUPS,
  addExerciseVolume,
  emptyVolume,
  fatiguedGroups,
  volumeTargets,
  weeklyVolume,
} from './volume'

// ---------------------------------------------------------------------------------------------------------------
// Paramètres

interface Format {
  exercises: Range
  sets: Range
  /** Exercices groupés par deux (agoniste / antagoniste) ; sinon blocs simples. */
  supersets: boolean
  finisher: boolean
  /** Bornes de l'échauffement en minutes et valeur préférée. */
  warmup: Range
  defaultWarmup: number
}

/** Formats SPEC §3.2 étape 5. */
export const SESSION_FORMATS: Readonly<Record<SessionDuration, Format>> = {
  20: { exercises: [3, 3], sets: [3, 3], supersets: true, finisher: false, warmup: [3, 4], defaultWarmup: 3 },
  30: { exercises: [4, 4], sets: [3, 3], supersets: true, finisher: false, warmup: [3, 5], defaultWarmup: 4 },
  45: {
    exercises: [5, 6],
    sets: [3, 4],
    supersets: false,
    finisher: false,
    warmup: [4, 6],
    defaultWarmup: 5,
  },
  60: { exercises: [6, 7], sets: [3, 4], supersets: false, finisher: true, warmup: [5, 6], defaultWarmup: 6 },
}

export const PREFERENCE_FACTOR = { liked: 1.5, neutral: 1, disliked: 0.3 } as const
/** Pénalité retirée au poids d'un groupe fatigué (≥ 4 séries primaires en < 48 h). */
export const FATIGUE_PENALTY = 2
/** Bonus des polyarticulaires (« polyarticulaires d'abord »). */
const COMPOUND_FACTOR = 1.3
/** Facteur par niveau en dessous du niveau atteint (on préfère le niveau atteint). */
const LOWER_LEVEL_FACTOR = 0.7
/** Malus de variété : exercice fait lors de la dernière séance. */
const RECENT_EXERCISE_FACTOR = 0.85
/** Réutilisation d'un schéma déjà présent (séances > 30 min seulement). */
const REPEAT_PATTERN_FACTOR = 0.5
/** Amplitude du départage pseudo-aléatoire (± 5 %). */
const JITTER = 0.1
/** Allongement des repos pour remplir le temps (débutant : plus de repos ne nuit pas), jusqu'à × 1,5. */
const REST_SCALES_UP = [1, 1.1, 1.2, 1.3, 1.4, 1.5] as const
/**
 * Superset agoniste / antagoniste : le repos après le tour peut descendre à × 0,7, car chaque muscle se repose
 * déjà pendant la série de l'autre exercice (repos effectif d'un muscle = repos du tour + travail de l'autre).
 */
const REST_SCALES_SUPERSET = [0.7, 0.8, 0.9, ...REST_SCALES_UP] as const
/** Coût (en secondes d'écart équivalentes) d'un exercice de dernier recours retenu dans la séance. */
const LAST_RESORT_COST = 240
/** Séries du finisher (60 min). */
const FINISHER_SETS = 2

const MAIN_LIFT_EXCLUDED: readonly MovementPattern[] = ['core', 'carry']

// ---------------------------------------------------------------------------------------------------------------
// Contexte de génération

interface Context {
  date: LocalDate
  format: Format
  durationMin: SessionDuration
  equipment: Equipment
  kb: KettlebellSpec
  levels: PatternLevels
  targetMid: Record<MuscleGroup, number>
  volume: MuscleVolume
  fatigued: Set<MuscleGroup>
  recentIds: Set<string>
  states: Map<string, ExerciseState>
  candidates: LibraryExercise[]
}

function hasTarget(ex: LibraryExercise): boolean {
  return ex.repRange !== undefined || ex.durationRange !== undefined
}

/** Exercice proposable : matériel possédé, non masqué, niveau ≤ niveau atteint du schéma, cible définie. */
function isEligible(ex: LibraryExercise, input: EngineInput, levels: PatternLevels): boolean {
  return (
    ex.preference !== 'hidden' &&
    !ex.deleted &&
    hasTarget(ex) &&
    ex.level <= levels[ex.pattern] &&
    isAvailable(ex, input.equipment)
  )
}

/** Ordre chronologique des séances : date, puis `startedAt`, puis id (indépendant de l'ordre du tableau). */
function compareSessions(a: Session, b: Session): number {
  const key = (s: Session): [string, string, string] => [s.date, s.startedAt ?? '', s.id]
  const [ka, kb] = [key(a), key(b)]
  for (let i = 0; i < 3; i++) {
    const x = ka[i] as string
    const y = kb[i] as string
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

function lastDoneSessionIds(input: EngineInput): Set<string> {
  let last: Session | undefined
  for (const s of input.sessions) {
    if (s.status !== 'done' || daysBetween(s.date, input.date) < 0) continue
    if (last === undefined || compareSessions(s, last) > 0) last = s
  }
  return new Set(last?.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId)) ?? [])
}

function buildContext(input: EngineInput): Context {
  const library = sortLibrary(input.library)
  const levels = patternLevels(library, input.states, input.profileLevel)
  const targets = volumeTargets(input.settings, input.equipment)
  const targetMid = {} as Record<MuscleGroup, number>
  for (const g of MUSCLE_GROUPS) targetMid[g] = Math.max(0, (targets[g][0] + targets[g][1]) / 2)
  return {
    date: input.date,
    format: SESSION_FORMATS[input.durationMin],
    durationMin: input.durationMin,
    equipment: input.equipment,
    kb: input.equipment.kettlebell,
    levels,
    targetMid,
    volume: weeklyVolume(input.sessions, library, input.date),
    fatigued: fatiguedGroups(input.sessions, library, input.date),
    recentIds: lastDoneSessionIds(input),
    states: new Map(input.states.map((s) => [s.exerciseId, s])),
    candidates: library.filter((ex) => isEligible(ex, input, levels)),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Priorités et scores

/** Déficit en séries d'un groupe (cible médiane − volume fait − volume déjà prévu). */
function deficit(ctx: Context, g: MuscleGroup, projected: MuscleVolume): number {
  return ctx.targetMid[g] - ctx.volume[g] - projected[g]
}

/**
 * Poids d'un groupe dans [−3, 1] : déficit relatif (1 = rien fait, 0 = cible atteinte, négatif = au-delà),
 * moins la pénalité de fatigue. Groupe sans cible : 0. La borne basse large répartit l'excédent quand le temps
 * disponible dépasse les cibles (ex. 5 × 60 min) au lieu de toujours charger les mêmes groupes.
 */
function groupWeight(ctx: Context, g: MuscleGroup, projected: MuscleVolume): number {
  const mid = ctx.targetMid[g]
  const base = mid > 0 ? Math.max(-3, Math.min(1, deficit(ctx, g, projected) / mid)) : 0
  return ctx.fatigued.has(g) ? base - FATIGUE_PENALTY : base
}

function exerciseScore(ctx: Context, ex: LibraryExercise, projected: MuscleVolume, extraFactor = 1): number {
  const primary = new Set(ex.muscles.primary)
  let base = 0
  for (const g of primary) base += groupWeight(ctx, g, projected)
  for (const g of new Set(ex.muscles.secondary))
    if (!primary.has(g)) base += 0.5 * groupWeight(ctx, g, projected)

  const pref = ex.preference === 'hidden' ? 0 : PREFERENCE_FACTOR[ex.preference]
  const levelGap = Math.max(0, ctx.levels[ex.pattern] - ex.level)
  const factor =
    pref *
    LOWER_LEVEL_FACTOR ** levelGap *
    (ex.compound ? COMPOUND_FACTOR : 1) *
    (ctx.recentIds.has(ex.id) ? RECENT_EXERCISE_FACTOR : 1) *
    (1 + JITTER * (seededUnit(`${ctx.date}|${ex.id}`) - 0.5)) *
    extraFactor
  if (factor <= 0) return Number.NEGATIVE_INFINITY
  // Un facteur favorable améliore un score négatif, un facteur défavorable l'aggrave.
  return base >= 0 ? base * factor : base / factor
}

function hitsFatigued(ctx: Context, ex: LibraryExercise): boolean {
  return ex.muscles.primary.some((g) => ctx.fatigued.has(g))
}

function isMainLift(ex: LibraryExercise): boolean {
  return ex.compound && !MAIN_LIFT_EXCLUDED.includes(ex.pattern)
}

function argmax<T>(items: readonly T[], score: (t: T) => number): { item: T; score: number } | undefined {
  let best: { item: T; score: number } | undefined
  for (const item of items) {
    const s = score(item)
    if (best === undefined || s > best.score) best = { item, score: s }
  }
  return best
}

interface Selection {
  /** Ordre de la séance : polyarticulaires principaux, accessoires, puis exercices de dernier recours. */
  ordered: LibraryExercise[]
  /** Exercices qui sollicitent en primaire un groupe fatigué (< 48 h) : seulement si le temps l'exige. */
  lastResort: Set<string>
}

/**
 * Sélection gloutonne de `count` exercices au plus, dans l'ordre de priorité :
 * 1. groupe au plus grand déficit → meilleur exercice qui le travaille en primaire sans solliciter en primaire
 *    un groupe fatigué (un exercice `disliked` reste choisi s'il est le seul à couvrir ce groupe) ;
 * 2. plus de déficit couvrable → meilleur exercice restant hors groupes fatigués ;
 * 3. dernier recours → meilleur exercice restant (la pénalité de fatigue le classe après les autres).
 */
function selectExercises(ctx: Context, count: number): Selection {
  const chosen: LibraryExercise[] = []
  const lastResort = new Set<string>()
  const projected = emptyVolume()
  const usedPatterns = new Set<MovementPattern>()
  const allowRepeat = ctx.durationMin > 30
  const nominalSets = ctx.format.sets[0]

  for (let k = 0; k < count; k++) {
    const pool = ctx.candidates.filter(
      (ex) => !chosen.includes(ex) && (allowRepeat || !usedPatterns.has(ex.pattern)),
    )
    if (pool.length === 0) break
    const rested = pool.filter((ex) => !hitsFatigued(ctx, ex))
    const score = (ex: LibraryExercise): number =>
      exerciseScore(ctx, ex, projected, usedPatterns.has(ex.pattern) ? REPEAT_PATTERN_FACTOR : 1)

    const drivers = MUSCLE_GROUPS.filter(
      (g) => ctx.targetMid[g] > 0 && !ctx.fatigued.has(g) && deficit(ctx, g, projected) > 0,
    ).sort(
      (a, b) =>
        deficit(ctx, b, projected) - deficit(ctx, a, projected) ||
        seededUnit(`${ctx.date}|${b}`) - seededUnit(`${ctx.date}|${a}`),
    )

    let pick: LibraryExercise | undefined
    for (const g of drivers) {
      const best = argmax(
        rested.filter((ex) => ex.muscles.primary.includes(g)),
        score,
      )
      if (best !== undefined && best.score > 0) {
        pick = best.item
        break
      }
    }
    pick ??= argmax(rested, score)?.item
    if (pick === undefined) {
      pick = argmax(pool, score)?.item
      if (pick !== undefined) lastResort.add(pick.id)
    }
    if (pick === undefined) break
    chosen.push(pick)
    usedPatterns.add(pick.pattern)
    addExerciseVolume(projected, pick, nominalSets)
  }
  const normal = chosen.filter((ex) => !lastResort.has(ex.id))
  return {
    ordered: [
      ...normal.filter(isMainLift),
      ...normal.filter((ex) => !isMainLift(ex)),
      ...chosen.filter((ex) => lastResort.has(ex.id)),
    ],
    lastResort,
  }
}

function selectFinisher(ctx: Context, chosen: readonly LibraryExercise[]): LibraryExercise | undefined {
  const pool = ctx.candidates.filter(
    (ex) => !chosen.includes(ex) && isFinisherExercise(ex) && !hitsFatigued(ctx, ex),
  )
  return argmax(pool, (ex) => exerciseScore(ctx, ex, emptyVolume()))?.item
}

// ---------------------------------------------------------------------------------------------------------------
// Séries et blocs

function scaledRest(restSec: number, scale: number): number {
  return Math.round((restSec * scale) / 5) * 5
}

type Family = 'push' | 'pull' | 'lower' | 'other'

function family(ex: LibraryExercise): Family {
  switch (ex.pattern) {
    case 'push_h':
    case 'push_v':
      return 'push'
    case 'pull':
      return 'pull'
    case 'hinge':
    case 'squat':
    case 'lunge':
    case 'calves':
      return 'lower'
    case 'arms':
      return ex.muscles.primary.includes('biceps') ? 'pull' : 'push'
    default:
      return 'other'
  }
}

/** Compatibilité de deux exercices en superset : 0 = interdit (même schéma ou groupe primaire commun). */
function pairCompat(a: LibraryExercise, b: LibraryExercise): number {
  if (a.pattern === b.pattern) return 0
  if (a.muscles.primary.some((g) => b.muscles.primary.includes(g))) return 0
  const fa = family(a)
  const fb = family(b)
  if ((fa === 'push' && fb === 'pull') || (fa === 'pull' && fb === 'push')) return 3
  if ((fa === 'lower') !== (fb === 'lower') && fa !== 'other' && fb !== 'other') return 2
  return 1
}

/** Meilleur appariement (somme des compatibilités maximale) ; indices non appariés = blocs simples. */
function bestPairing(list: readonly LibraryExercise[]): number[][] {
  let best: { groups: number[][]; score: number } | undefined
  const rec = (remaining: number[], groups: number[][], score: number, singles: number): void => {
    if (remaining.length === 0) {
      if (best === undefined || score > best.score) best = { groups, score }
      return
    }
    const [first, ...rest] = remaining as [number, ...number[]]
    // Bloc simple : gratuit pour le seul exercice impair, pénalisé au-delà (dernier recours sans partenaire).
    for (let j = 0; j < rest.length; j++) {
      const other = rest[j] as number
      const c = pairCompat(list[first] as LibraryExercise, list[other] as LibraryExercise)
      if (c > 0) {
        rec(
          rest.filter((_, k) => k !== j),
          [...groups, [first, other]],
          score + c,
          singles,
        )
      }
    }
    const penalty = singles >= list.length % 2 ? 10 : 0
    rec(rest, [...groups, [first]], score - penalty, singles + 1)
  }
  rec(
    list.map((_, i) => i),
    [],
    0,
    0,
  )
  const groups = (best as { groups: number[][] } | undefined)?.groups ?? list.map((_, i) => [i])
  return [...groups].sort((a, b) => Math.min(...a) - Math.min(...b))
}

/**
 * Fait entrer l'unique bloc simple dans le premier superset dont tous les membres lui sont compatibles
 * (circuit de 3 exercices). Modifie `groups`, qui reste trié par premier indice.
 */
function mergeLoneExercise(groups: number[][], list: readonly LibraryExercise[]): void {
  const singles = groups.filter((g) => g.length === 1)
  const lone = singles[0]
  if (singles.length !== 1 || lone === undefined) return
  const loneEx = list[lone[0] as number] as LibraryExercise
  const host = groups.find(
    (g) => g.length >= 2 && g.every((k) => pairCompat(list[k] as LibraryExercise, loneEx) > 0),
  )
  if (host === undefined) return
  host.push(lone[0] as number)
  groups.splice(groups.indexOf(lone), 1)
}

interface Config {
  count: number
  mainSets: number
  accessorySets: number
  warmupMin: number
  restScale: number
  /** Nombre impair en supersets : l'exercice resté seul rejoint un superset (circuit de 3), si compatible. */
  mergeSingle: boolean
}

function buildBlocks(
  ctx: Context,
  ordered: readonly LibraryExercise[],
  finisher: LibraryExercise | undefined,
  cfg: Config,
): SessionBlock[] {
  const list = ordered.slice(0, cfg.count)
  const setsOf = (ex: LibraryExercise): number => (isMainLift(ex) ? cfg.mainSets : cfg.accessorySets)
  // Tempo accepté (ExerciseState.tempo) : seulement pour un exercice en répétitions (voir buildSessionExercise).
  const toSe = (ex: LibraryExercise, sets: number, rest: number): SessionExercise =>
    buildSessionExercise(ex, ctx.states.get(ex.id), ctx.equipment, sets, rest)

  const groups = ctx.format.supersets ? bestPairing(list) : list.map((_, i) => [i])
  if (cfg.mergeSingle) mergeLoneExercise(groups, list)
  const blocks: SessionBlock[] = groups.map((g, i) => {
    const members = g.map((k) => list[k] as LibraryExercise)
    if (members.length === 1) {
      const ex = members[0] as LibraryExercise
      // Repos raccourci réservé aux supersets : un bloc simple garde au moins son repos de base.
      const rest = scaledRest(ex.restSec, Math.max(1, cfg.restScale))
      return { id: `b${i + 1}`, kind: 'single', exercises: [toSe(ex, setsOf(ex), rest)] }
    }
    // Superset : même nombre de tours pour tous, repos (le plus long) après le tour.
    const sets = Math.max(...members.map(setsOf))
    const rest = scaledRest(Math.max(...members.map((m) => m.restSec)), cfg.restScale)
    return { id: `b${i + 1}`, kind: 'superset', exercises: members.map((m) => toSe(m, sets, rest)) }
  })
  if (finisher !== undefined) {
    blocks.push({
      id: `b${blocks.length + 1}`,
      kind: 'finisher',
      exercises: [toSe(finisher, FINISHER_SETS, finisher.restSec)],
    })
  }
  return blocks
}

function range(lo: number, hi: number, step = 1): number[] {
  const out: number[] = []
  for (let x = lo; x <= hi; x += step) out.push(x)
  return out
}

/** Pénalité d'un circuit de 3 (forme de repli pour 20 min). */
const MERGE_SINGLE_COST = 120

/**
 * Coût de l'écart à la durée choisie (secondes) : faible jusqu'à ± 5 % (on préfère alors un format naturel :
 * repos de base, superset + bloc simple), fort au-delà, prohibitif près de ± 10 %.
 */
function deviationCost(diff: number, target: number): number {
  return 0.25 * diff + 2 * Math.max(0, diff - 0.05 * target) + 10 * Math.max(0, diff - 0.09 * target)
}

/**
 * Choisit la configuration dont l'estimation est la plus proche de la durée choisie.
 * Petites pénalités (en secondes) pour départager : repos allongé, échauffement hors valeur préférée,
 * accessoires à moins de séries que le format (si la séance déborde), exercice de dernier recours (groupe fatigué),
 * circuit de 3 au lieu de superset + bloc simple.
 */
function fitConfig(
  ctx: Context,
  selection: Selection,
  finisher: LibraryExercise | undefined,
  library: readonly LibraryExercise[],
): { config: Config; blocks: SessionBlock[] } {
  const f = ctx.format
  const { ordered, lastResort } = selection
  const target = ctx.durationMin * 60
  const maxCount = Math.min(f.exercises[1], ordered.length)
  const minCount = Math.min(f.exercises[0], maxCount)
  let best: { config: Config; blocks: SessionBlock[]; cost: number } | undefined
  for (const count of range(minCount, maxCount)) {
    for (const mainSets of range(f.sets[0], f.sets[1])) {
      // Supersets (20 / 30 min) : jamais moins de séries que le format ; sinon 1 de moins en dernier recours.
      const minAccessory = f.supersets ? f.sets[0] : Math.max(2, f.sets[0] - 1)
      for (const accessorySets of range(minAccessory, mainSets)) {
        for (const warmupMin of range(f.warmup[0], f.warmup[1])) {
          for (const restScale of f.supersets ? REST_SCALES_SUPERSET : REST_SCALES_UP) {
            for (const mergeSingle of f.supersets && count % 2 === 1 ? [false, true] : [false]) {
              const config: Config = { count, mainSets, accessorySets, warmupMin, restScale, mergeSingle }
              const blocks = buildBlocks(ctx, ordered, finisher, config)
              const est = estimateSeconds(blocks, library, warmupMin)
              const cost =
                deviationCost(Math.abs(est - target), target) +
                Math.round(Math.abs(restScale - 1) * 200) +
                15 * Math.abs(warmupMin - f.defaultWarmup) +
                (accessorySets < f.sets[0] ? 90 : 0) +
                LAST_RESORT_COST * ordered.slice(0, count).filter((ex) => lastResort.has(ex.id)).length +
                (mergeSingle ? MERGE_SINGLE_COST : 0)
              if (best === undefined || cost < best.cost) best = { config, blocks, cost }
            }
          }
        }
      }
    }
  }
  if (best === undefined) {
    const config: Config = {
      count: 0,
      mainSets: 0,
      accessorySets: 0,
      warmupMin: f.defaultWarmup,
      restScale: 1,
      mergeSingle: false,
    }
    return { config, blocks: [] }
  }
  return { config: best.config, blocks: best.blocks }
}

// ---------------------------------------------------------------------------------------------------------------
// Échauffement

const MOBILITY: Record<Family | 'general', string[]> = {
  general: [
    'Marche active ou montées de genoux légères, 1 minute.',
    '8 « chat-vache » à quatre pattes, lentement.',
  ],
  lower: [
    '10 cercles de hanches de chaque côté.',
    '8 squats lents au poids du corps, amplitude confortable.',
    '8 charnières de hanche à vide, mains sur les hanches.',
    '6 fentes arrière alternées sans charge.',
  ],
  push: [
    '10 cercles de bras vers l’avant puis vers l’arrière.',
    '8 pompes inclinées faciles, mains sur une table.',
  ],
  pull: [
    '10 rotations d’épaules, omoplates serrées en arrière.',
    '8 tirages « Y-T » debout, bras tendus, sans charge.',
  ],
  other: ['20 secondes de planche facile, respiration calme.'],
}

/** Ligne « séries légères » du premier mouvement de l'échauffement. */
export function lightSetsLine(ex: LibraryExercise, first: SessionExercise, kb: KettlebellSpec): string {
  const set = first.sets[0]
  // Balistique (swing) : échauffement spécifique, jamais « sans charge » (isBallistic, drapeau `finisher`).
  if (isBallistic(ex)) {
    return `${ex.name} : 10 charnières de hanche à vide, puis 1 série de 5 swings souples à ${kb.minKg} kg, trajectoire contrôlée.`
  }
  if (ex.durationRange !== undefined && set?.targetDurationSec !== undefined) {
    const light = Math.max(10, Math.round(set.targetDurationSec / 2 / 5) * 5)
    return ex.loadType === 'kettlebell'
      ? `${ex.name} : 1 série légère de ${light} s à ${kb.minKg} kg.`
      : `${ex.name} : 1 tenue facile de ${light} s.`
  }
  if (ex.loadType === 'kettlebell' && set?.loadKg !== undefined) {
    if (set.loadKg > kb.minKg) {
      const mid = snapLoadDown(kb.minKg + (set.loadKg - kb.minKg) / 2, kb)
      return `${ex.name} : 1 série de 8 sans charge, puis 1 série de 5 à ${mid} kg.`
    }
    return `${ex.name} : 2 séries de 6 sans charge (ou à ${kb.minKg} kg si le geste l’exige), lentement.`
  }
  return `${ex.name} : 1 série de 6 répétitions faciles, lentement.`
}

/**
 * Échauffement (SPEC §3.2 étape 6) : mobilité adaptée aux familles de mouvements présentes (≈ 1 ligne par minute),
 * puis séries légères du premier exercice.
 */
export function buildWarmup(
  blocks: readonly SessionBlock[],
  byId: ReadonlyMap<string, LibraryExercise>,
  warmupMin: number,
  kb: KettlebellSpec,
): string[] {
  const exercises = blocks.flatMap((b) => b.exercises.map((e) => byId.get(e.exerciseId)))
  const families = new Set<Family>()
  for (const ex of exercises) if (ex !== undefined) families.add(family(ex))
  const lines: string[] = []
  const general = MOBILITY.general
  lines.push(general[0] as string)
  const pools = (['lower', 'push', 'pull', 'other'] as const)
    .filter((f) => families.has(f))
    .map((f) => [...MOBILITY[f]])
  const mobilityCount = Math.max(2, warmupMin - 1)
  // Tourniquet entre les familles présentes pour couvrir hanches et épaules.
  while (lines.length < mobilityCount && pools.some((p) => p.length > 0)) {
    for (const p of pools) {
      const next = p.shift()
      if (next !== undefined && lines.length < mobilityCount) lines.push(next)
    }
  }
  if (lines.length < mobilityCount) lines.push(general[1] as string)

  const firstBlock = blocks[0]
  const firstSe = firstBlock?.exercises[0]
  const firstEx = firstSe === undefined ? undefined : byId.get(firstSe.exerciseId)
  if (firstSe !== undefined && firstEx !== undefined) lines.push(lightSetsLine(firstEx, firstSe, kb))
  return lines
}

// ---------------------------------------------------------------------------------------------------------------
// API

/** Génère la séance du jour (SPEC §3.2). Même entrée → même sortie. */
export function generateSession(input: EngineInput): SessionPlan {
  const ctx = buildContext(input)
  const library = sortLibrary(input.library)
  const byId = new Map(library.map((e) => [e.id, e]))

  const selection = selectExercises(ctx, ctx.format.exercises[1])
  const finisher = ctx.format.finisher ? selectFinisher(ctx, selection.ordered) : undefined
  const fitted = fitConfig(ctx, selection, finisher, library)
  let blocks = fitted.blocks
  const warmupMin = fitted.config.warmupMin

  // Un seul calcul du deload : actif et raison viennent du même statut.
  const deloadState = deloadStatus(input.sessions, input.date, input.settings)
  const deload = deloadState.active
  if (deload) {
    blocks = blocks.map((b) => ({
      ...b,
      exercises: b.exercises.map((e) => ({ ...e, sets: e.sets.slice(0, deloadSets(e.sets.length)) })),
    }))
  }

  const focus = focusFromContext(ctx, library, blocks)

  return {
    date: input.date,
    durationMin: input.durationMin,
    warmup: buildWarmup(blocks, byId, warmupMin, ctx.kb),
    warmupMin,
    blocks,
    deload,
    ...(deload && deloadState.reason !== undefined ? { deloadReason: deloadState.reason } : {}),
    estimatedMin: Math.round(estimateSeconds(blocks, library, warmupMin) / 60),
    focus,
  }
}

/**
 * Exercices pouvant remplacer `exerciseId` (SPEC §3.2) : même schéma, niveau ≤ niveau atteint, matériel possédé,
 * non masqués, différents ; triés par pertinence (même score que la génération).
 */
export function replacementCandidates(
  exerciseId: string,
  input: EngineInput,
  /** Ids déjà présents dans le plan (exclus des propositions). */
  excludeIds: readonly string[] = [],
): LibraryExercise[] {
  const target = input.library.find((e) => e.id === exerciseId)
  if (target === undefined) return []
  const ctx = buildContext(input)
  const none = emptyVolume()
  const excluded = new Set(excludeIds)
  return ctx.candidates
    .filter((ex) => ex.pattern === target.pattern && ex.id !== exerciseId && !excluded.has(ex.id))
    .map((ex) => ({ ex, score: exerciseScore(ctx, ex, none) }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.ex)
}

/**
 * Exercices ajoutables à une séance (édition avant départ, SPEC §3.5) : matériel possédé, non masqués, cible
 * définie, niveau ≤ niveau atteint du schéma (l'ajout manuel ne débloque jamais un niveau non atteint) ;
 * triés par schéma (PATTERN_ORDER) puis pertinence (même score que la génération).
 */
export function addCandidates(
  input: EngineInput,
  /** Ids déjà présents dans la séance (exclus). */
  excludeIds: readonly string[] = [],
): LibraryExercise[] {
  const ctx = buildContext(input)
  const none = emptyVolume()
  const excluded = new Set(excludeIds)
  return ctx.candidates
    .filter((ex) => !excluded.has(ex.id))
    .map((ex) => ({ ex, score: exerciseScore(ctx, ex, none) }))
    .sort(
      (a, b) =>
        PATTERN_ORDER.indexOf(a.ex.pattern) - PATTERN_ORDER.indexOf(b.ex.pattern) || b.score - a.score,
    )
    .map((x) => x.ex)
}

/**
 * Groupes visés par une séance (`SessionPlan.focus`) : groupes travaillés en primaire, avec une cible, non
 * fatigués et en déficit, du plus grand déficit au plus petit.
 */
export function planFocus(input: EngineInput, blocks: readonly SessionBlock[]): MuscleGroup[] {
  return focusFromContext(buildContext(input), input.library, blocks)
}

/** `planFocus` sur un contexte déjà construit (évite de recalculer volume, fatigue et niveaux). */
function focusFromContext(
  ctx: Context,
  library: readonly LibraryExercise[],
  blocks: readonly SessionBlock[],
): MuscleGroup[] {
  const byId = new Map(library.map((e) => [e.id, e]))
  const covered = new Set<MuscleGroup>()
  for (const b of blocks)
    for (const e of b.exercises) for (const g of byId.get(e.exerciseId)?.muscles.primary ?? []) covered.add(g)
  const none = emptyVolume()
  return MUSCLE_GROUPS.filter(
    (g) => covered.has(g) && ctx.targetMid[g] > 0 && !ctx.fatigued.has(g) && deficit(ctx, g, none) > 0,
  ).sort((a, b) => deficit(ctx, b, none) - deficit(ctx, a, none))
}
