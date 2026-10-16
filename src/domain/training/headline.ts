// Titre et raison de la séance du jour (accueil « Aujourd'hui », v2 F1). Fonction pure : la séance, la bibliothèque,
// le volume des 7 derniers jours et les cibles arrivent en paramètres.
import type { Range } from '../../types/common'
import type { MuscleVolume, SessionHeadline, SessionPlan } from '../../types/engine'
import type { Exercise, MovementPattern, MuscleGroup } from '../../types/training'
import { MAJOR_GROUPS, MUSCLE_GROUPS, MUSCLE_LABELS_FR } from './volume'

// ---------- Titre ----------

/**
 * Familles de mouvements du titre.
 * - Principales : `lower` (hinge, squat, lunge), `push` (push_h, push_v), `pull` (pull).
 * - Complémentaires : `core` (core, carry), `arms` (arms), `calves` (calves).
 */
type Family = 'lower' | 'push' | 'pull' | Accessory
type Accessory = 'core' | 'arms' | 'calves'

const PATTERN_FAMILY: Record<MovementPattern, Family> = {
  hinge: 'lower',
  squat: 'lower',
  lunge: 'lower',
  push_h: 'push',
  push_v: 'push',
  pull: 'pull',
  core: 'core',
  carry: 'core',
  arms: 'arms',
  calves: 'calves',
}

/** Complémentaires, par ordre de priorité dans le titre. */
const ACCESSORY_ORDER: readonly Accessory[] = ['core', 'arms', 'calves']
const ACCESSORY_LABEL: Record<Accessory, string> = {
  core: 'gainage',
  arms: 'bras',
  calves: 'mollets',
}

/** Titre d'une séance sans exercice reconnu. */
export const EMPTY_SESSION_TITLE = 'Séance du jour'

/** Longueur maximale d'un titre (carte « Séance du jour »). */
export const HEADLINE_TITLE_MAX = 32

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)
}

/** « a », « a et b », « a, b et c ». */
function joinFr(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1] ?? ''}`
}

/** Exercices comptés pour la séance : blocs hors finisher ; s'il n'y en a aucun, tous les blocs. */
function sessionExercises(plan: SessionPlan, library: readonly Exercise[]): Exercise[] {
  const index = new Map(library.map((e) => [e.id, e]))
  const pick = (finisher: boolean): Exercise[] =>
    plan.blocks
      .filter((b) => (b.kind === 'finisher') === finisher)
      .flatMap((b) => b.exercises)
      .map((se) => index.get(se.exerciseId))
      .filter((e): e is Exercise => e !== undefined)
  const main = pick(false)
  return main.length > 0 ? main : pick(true)
}

/**
 * Titre à partir des familles présentes (règle déterministe, indépendante de l'ordre des exercices) :
 * 1. bas + poussée + tirage → « Corps entier » ; poussée + tirage → « Haut du corps » ;
 *    bas + tirage → « Bas du corps et tirage » ; bas + poussée → « Bas du corps et poussée » ;
 *    une seule famille → « Bas du corps », « Poussée » ou « Tirage ».
 * 2. Un titre d'une seule zone (« Bas du corps », « Haut du corps », « Poussée », « Tirage ») reçoit le premier
 *    complément présent parmi gainage > bras > mollets : « Poussée et gainage », « Haut du corps et bras ».
 * 3. Aucune famille principale : compléments présents dans l'ordre gainage, bras, mollets (« Gainage et bras »).
 * 4. Aucun exercice reconnu : « Séance du jour ».
 */
export function headlineTitle(patterns: Iterable<MovementPattern>): string {
  const fams = new Set<Family>()
  for (const p of patterns) fams.add(PATTERN_FAMILY[p])
  const lower = fams.has('lower')
  const push = fams.has('push')
  const pull = fams.has('pull')
  const accessories = ACCESSORY_ORDER.filter((f) => fams.has(f)).map((f) => ACCESSORY_LABEL[f])

  const main = mainTitle(lower, push, pull)
  if (main === null) return accessories.length > 0 ? capitalize(joinFr(accessories)) : EMPTY_SESSION_TITLE
  const first = accessories[0]
  return main.singleZone && first !== undefined ? `${main.base} et ${first}` : main.base
}

/** Partie principale du titre ; `singleZone` = peut recevoir un complément. `null` sans famille principale. */
function mainTitle(lower: boolean, push: boolean, pull: boolean): { base: string; singleZone: boolean } | null {
  if (lower && push && pull) return { base: 'Corps entier', singleZone: false }
  if (lower && pull) return { base: 'Bas du corps et tirage', singleZone: false }
  if (lower && push) return { base: 'Bas du corps et poussée', singleZone: false }
  if (push && pull) return { base: 'Haut du corps', singleZone: true }
  if (lower) return { base: 'Bas du corps', singleZone: true }
  if (push) return { base: 'Poussée', singleZone: true }
  if (pull) return { base: 'Tirage', singleZone: true }
  return null
}

// ---------- Raison ----------

/** Nombre maximal de groupes cités dans la raison. */
export const HEADLINE_MAX_LAGGING = 2

/** Groupes au singulier en français (« le dos ») ; les autres sont au pluriel (« les quadriceps »). */
const SINGULAR_GROUPS: ReadonlySet<MuscleGroup> = new Set<MuscleGroup>(['back'])

function withArticle(g: MuscleGroup): string {
  return `${SINGULAR_GROUPS.has(g) ? 'le' : 'les'} ${MUSCLE_LABELS_FR[g]}`
}

/** « Le dos est en retard… », « Les quadriceps sont en retard… », « Les quadriceps et le dos sont en retard… ». */
function laggingSentence(groups: readonly MuscleGroup[]): string {
  const plural = groups.length > 1 || groups.some((g) => !SINGULAR_GROUPS.has(g))
  return `${capitalize(joinFr(groups.map(withArticle)))} ${plural ? 'sont' : 'est'} en retard sur ta semaine.`
}

export const REASON_DELOAD_SCHEDULED = 'Semaine allégée prévue : volume réduit de moitié pour bien récupérer.'
export const REASON_DELOAD_FATIGUE = 'Semaine allégée : tes dernières séances ont été dures, on récupère.'
export const REASON_DELOAD = 'Semaine allégée : volume réduit de moitié pour bien récupérer.'
/**
 * Volume nul sur 7 jours : aucune séance `done`, ou des séances `done` dont toutes les séries ont été passées
 * (ou ne portent que sur des exercices supprimés). La phrase parle donc de séries, pas de séances, pour rester
 * vraie dans tous ces cas, première séance comprise.
 */
export const REASON_RESTART = 'Rien de fait ces 7 derniers jours : on reprend en douceur.'
export const REASON_BALANCED = 'Ta semaine est équilibrée : on entretient.'
export const REASON_CONTINUE = 'On continue de remplir ta semaine.'

/**
 * Grands groupes cités en retard : travaillés en primaire par la séance (hors finisher), présents dans `plan.focus`
 * (le moteur en exclut les groupes fatigués, mis en retrait < 48 h) et sous le bas de leur cible sur 7 jours
 * (bas de cible ∩ focus), du plus en retard
 * (volume / bas de cible le plus faible) au moins en retard ; départage dans l'ordre de `MAJOR_GROUPS`.
 */
function laggingWorkedGroups(
  worked: ReadonlySet<MuscleGroup>,
  focus: ReadonlySet<MuscleGroup>,
  volume7d: MuscleVolume,
  targets: Record<MuscleGroup, Range>,
): MuscleGroup[] {
  return MAJOR_GROUPS.filter((g) => worked.has(g) && focus.has(g) && targets[g][0] > 0 && volume7d[g] < targets[g][0])
    .map((g, i) => ({ g, i, ratio: volume7d[g] / targets[g][0] }))
    .sort((a, b) => a.ratio - b.ratio || a.i - b.i)
    .map((x) => x.g)
}

/**
 * Titre et raison de la séance du jour.
 *
 * Titre : voir `headlineTitle` (exercices hors échauffement et hors finisher).
 * Raison, première règle applicable :
 * 1. séance allégée (`plan.deload`) → phrase de deload selon `deloadReason` ;
 * 2. aucun volume sur 7 jours → phrase de reprise (testé avant 3 : sinon tous les groupes seraient « en retard ») ;
 * 3. grands groupes travaillés en primaire, présents dans `plan.focus` (donc non fatigués) et sous le bas de leur
 *    cible → 1 ou 2 groupes, les plus en retard en proportion d'abord (`laggingGroups`) ;
 * 4. tous les grands groupes à cible atteinte → « équilibrée » ; sinon (groupes en retard que la séance ne
 *    travaille pas ou hors focus, par exemple mis en retrait après une séance lourde) → phrase neutre sans prétendre
 *    l'équilibre.
 */
export function sessionHeadline(
  plan: SessionPlan,
  library: readonly Exercise[],
  volume7d: MuscleVolume,
  targets: Record<MuscleGroup, Range>,
): SessionHeadline {
  const exercises = sessionExercises(plan, library)
  const title = headlineTitle(exercises.map((e) => e.pattern))

  if (plan.deload) {
    const reason =
      plan.deloadReason === 'scheduled'
        ? REASON_DELOAD_SCHEDULED
        : plan.deloadReason === 'fatigue'
          ? REASON_DELOAD_FATIGUE
          : REASON_DELOAD
    return { title, reason, laggingGroups: [] }
  }

  const total = MUSCLE_GROUPS.reduce((sum, g) => sum + volume7d[g], 0)
  if (total <= 0) return { title, reason: REASON_RESTART, laggingGroups: [] }

  const worked = new Set<MuscleGroup>(exercises.flatMap((e) => e.muscles.primary))
  const lagging = laggingWorkedGroups(worked, new Set(plan.focus), volume7d, targets).slice(0, HEADLINE_MAX_LAGGING)
  if (lagging.length > 0) return { title, reason: laggingSentence(lagging), laggingGroups: lagging }

  const anyMajorLagging = MAJOR_GROUPS.some((g) => targets[g][0] > 0 && volume7d[g] < targets[g][0])
  return { title, reason: anyMajorLagging ? REASON_CONTINUE : REASON_BALANCED, laggingGroups: [] }
}
