// Messages de contexte « Demander à Claude » (J9, SPEC §10.1) : fonctions pures qui construisent le texte à copier.
// Ce module n'importe pas Zod (les boutons d'envoi restent légers). Aucune donnée d'identité : ni nom ni date de
// naissance (seulement l'âge), pas d'id interne hors `exerciseId`.
import type { ContentSource, Id, LocalDate } from '../../types/common'
import type { ClaudeContextKind, ClaudeMessage } from '../../types/claude'
import type { PatternLevels } from '../../types/engine'
import type { PersonalRecord } from '../../types/guided'
import type { DayLog, MealSlot, Macros, NutritionTargets, Recipe } from '../../types/nutrition'
import type { Equipment, Goal, Profile, TrainingLevel } from '../../types/profile'
import type { ExerciseStrength, GroupVolume, NutritionWeek, Regularity, WeeklyReview } from '../../types/progress'
import type { RecipeNutrition } from '../../types/recipes'
import type { Feeling, LibraryExercise, MuscleGroup, MovementPattern, Session, SetEntry } from '../../types/training'
import { addDays } from '../shared/dates'
import { isAvailable } from '../training/library'

// ---------- Entrées ----------

/** Données communes à tous les messages. */
export interface ClaudeBaseInput {
  profile: Profile
  equipment: Equipment
  /** Objectifs du jour ; `weightKg` = moyenne 7 jours et `ageYears` servent au résumé du profil. */
  targets: NutritionTargets
  /** Demande saisie par l'utilisateur ; vide → demande par défaut de l'écran. */
  request?: string
  today: LocalDate
}

/** Nom d'exercice par id (un `LibraryExercise` convient). */
export type ExerciseNames = readonly { id: Id; name: string; source?: ContentSource }[]

export interface JournalContextInput extends ClaudeBaseInput {
  day: DayLog
}

export interface SessionBeforeContextInput extends ClaudeBaseInput {
  /** Séance proposée (`SessionPlan` du moteur ou `Session` non commencée). */
  plan: {
    durationMin: number
    estimatedMin: number
    deload: boolean
    blocks: Session['blocks']
  }
  /** Bibliothèque fusionnée (préférences comprises) : sert aux noms et à la liste des exercices disponibles. */
  library: readonly LibraryExercise[]
  /** Niveau par schéma ; à défaut `profile.level`. */
  patternLevels?: PatternLevels
}

export interface SessionAfterContextInput extends ClaudeBaseInput {
  session: Session
  /** Durée réelle en minutes (`SessionSummary.actualMin`). */
  actualMin?: number
  records: readonly PersonalRecord[]
  exercises: ExerciseNames
}

export interface RecipeContextInput extends ClaudeBaseInput {
  recipe: Recipe
  nutrition: RecipeNutrition
}

/** Tendance de poids : moyennes mobiles (kg) ; `null` = pas assez de pesées. */
export interface WeightTrendInput {
  avg7Kg: number | null
  /** Moyenne mobile 7 j calculée 28 jours plus tôt. */
  avg7Kg28DaysAgo: number | null
  weighIns28d: number
}

export interface ProgressContextInput extends ClaudeBaseInput {
  weight: WeightTrendInput
  regularity: Regularity
  volume: readonly GroupVolume[]
  nutritionWeek: NutritionWeek
  strength: readonly ExerciseStrength[]
  exercises: ExerciseNames
}

export interface ReviewContextInput extends ClaudeBaseInput {
  review: WeeklyReview
  exercises: ExerciseNames
}

// ---------- Formats ----------

const r1 = (n: number): number => Math.round(n * 10) / 10
const r0 = (n: number): number => Math.round(n)

/** Nombre à la française (virgule), sans séparateur de milliers. */
function fr(n: number, digits = 1): string {
  return (digits === 0 ? String(Math.round(n)) : String(r1(n))).replace('.', ',')
}

function macrosJson(m: Macros): { kcal: number; prot: number; gluc: number; lip: number } {
  return { kcal: r0(m.kcal), prot: r1(m.protein), gluc: r1(m.carbs), lip: r1(m.fat) }
}

const short = (s: string, max = 60): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

const GOALS: Record<Goal, string> = { bulk: 'prise de masse', maintain: 'maintien', cut: 'sèche' }
const LEVELS: Record<TrainingLevel, string> = { 1: 'débutant', 2: 'intermédiaire', 3: 'avancé' }
const SLOTS: Record<MealSlot, string> = {
  breakfast: 'petit-déjeuner',
  lunch: 'déjeuner',
  dinner: 'dîner',
  snack: 'collation',
}
const MUSCLE_FR: Record<MuscleGroup, string> = {
  chest: 'pectoraux',
  back: 'dos',
  shoulders: 'épaules',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'avant-bras',
  traps: 'trapèzes',
  abs: 'abdos',
  lower_back: 'lombaires',
  glutes: 'fessiers',
  quads: 'quadriceps',
  hamstrings: 'ischios',
  calves: 'mollets',
}
const FEELING_FR: Record<Feeling, string> = { easy: 'facile', ok: 'ok', hard: 'dur' }
const EQUIPMENT_FR: Record<string, string> = {
  mat: 'tapis',
  pullup_bar: 'barre de traction',
  bands: 'élastiques',
  bench: 'chaise ou banc',
  table: 'table solide',
}
const PATTERN_FR: Record<MovementPattern, string> = {
  hinge: 'charnière',
  squat: 'squat',
  lunge: 'fente',
  push_h: 'poussée horizontale',
  push_v: 'poussée verticale',
  pull: 'tirage',
  core: 'gainage',
  carry: 'porté',
  arms: 'bras',
  calves: 'mollets',
}
const RECORD_FR: Record<PersonalRecord['kind'], string> = {
  load: 'charge',
  reps: 'répétitions',
  duration: 'durée',
  tonnage: 'tonnage',
}

const json = (v: unknown): string => JSON.stringify(v)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-/i

function nameOf(names: ExerciseNames, id: Id): string {
  return names.find((e) => e.id === id)?.name ?? 'exercice supprimé'
}

/**
 * `{ exerciseId }` pour un exercice du contenu de départ (id lisible et stable) ; rien pour un exercice perso (UUID
 * interne inutile pour Claude : l'import le retrouve par son nom).
 */
function idField(names: ExerciseNames, id: Id): { exerciseId?: Id } {
  const ex = names.find((e) => e.id === id)
  if (ex === undefined || ex.source === 'user' || UUID.test(id)) return {}
  return { exerciseId: id }
}

// ---------- Blocs communs ----------

const SCREEN_TITLES: Record<ClaudeContextKind, string> = {
  journal: 'Journal alimentaire',
  session_before: 'Séance proposée (avant de la faire)',
  session_after: 'Séance terminée',
  recipe: 'Fiche recette',
  progress: 'Page Progrès',
  review: 'Bilan de la semaine',
}

export const DEFAULT_REQUESTS: Record<ClaudeContextKind, string> = {
  journal: 'Analyse ma journée : est-ce que je suis dans mes objectifs et que me conseilles-tu pour la suite de la journée ?',
  session_before: 'Relis cette séance : est-elle adaptée à mon niveau et au temps dont je dispose ? Propose des ajustements si besoin.',
  session_after: 'Fais le bilan de cette séance : comment j’ai progressé et que dois-je viser la prochaine fois ?',
  recipe: 'Que penses-tu de cette recette pour ma prise de masse ? Propose une variante si utile.',
  progress: 'Analyse mes progrès (poids, régularité, volume, nutrition) et dis-moi ce que je dois ajuster.',
  review: 'Commente mon bilan de la semaine et propose-moi un plan pour la semaine prochaine.',
}

const FORMAT_EXAMPLES: Record<string, string> = {
  meal: '{"type":"meal","name":"…","date":"AAAA-MM-JJ","slot":"petit-dej|dejeuner|diner|collation","estimated":true,"totals":{"kcal":0,"protein":0,"carbs":0,"fat":0}}',
  recipe:
    '{"type":"recipe","name":"…","meal":["dejeuner"],"servings":4,"prepMinutes":15,"cookMinutes":25,"ingredients":[{"name":"…","grams":0,"aisle":"epicerie"}],"steps":["…"]}',
  sessionPlan:
    '{"type":"sessionPlan","durationMin":30,"blocks":[{"exerciseId":"…","sets":3,"reps":[8,12],"loadKg":16,"restSec":90}]}',
  exercise:
    '{"type":"exercise","name":"…","pattern":"hinge","level":1,"muscles":{"primary":["fessiers"],"secondary":["ischios"]},"loadType":"kettlebell","repRange":[10,15],"restSec":75}',
  exercisePreference: '{"type":"exercisePreference","exerciseId":"…","preference":"liked|neutral|disliked|hidden","reason":"…"}',
}

const USEFUL_TYPES: Record<ClaudeContextKind, readonly string[]> = {
  journal: ['meal', 'recipe'],
  session_before: ['sessionPlan', 'exercise', 'exercisePreference'],
  session_after: ['exercisePreference', 'exercise'],
  recipe: ['recipe'],
  progress: ['recipe', 'exercisePreference'],
  review: ['recipe', 'exercisePreference'],
}

const EXERCISE_ID_RULE: Record<ClaudeContextKind, string> = {
  journal: '',
  session_before:
    'Utilise uniquement les exerciseId de la liste ci-dessus (pour un exercice perso listé sans id, son nom exact sert d’exerciseId). Pour un nouvel exercice, mets son nom comme exerciseId dans le sessionPlan et ajoute l’objet exercise.',
  session_after: 'Utilise les exerciseId des données ci-dessus (exercice sans exerciseId : son nom exact).',
  recipe: '',
  progress: 'Utilise les exerciseId des données ci-dessus (exercice sans exerciseId : son nom exact).',
  review: 'Utilise les exerciseId des données ci-dessus (exercice sans exerciseId : son nom exact).',
}

function formatReminder(kind: ClaudeContextKind): string {
  const types = USEFUL_TYPES[kind]
  const lines = [
    'Format de réponse : explique d’abord en quelques phrases simples. Si quelque chose doit entrer dans l’app, termine par UN SEUL bloc ```json contenant un tableau d’objets (quantités en grammes crus). Sinon, pas de bloc json.',
    `Types utiles ici : ${types.join(', ')}.`,
    ...types.map((t) => `- ${FORMAT_EXAMPLES[t] ?? ''}`),
  ]
  const rule = EXERCISE_ID_RULE[kind]
  if (rule !== '') lines.push(rule)
  return lines.join('\n')
}

export function profileSummary(base: ClaudeBaseInput): string {
  const { profile, equipment, targets } = base
  const kb = equipment.kettlebell
  const owned = equipment.owned.map((e) => EQUIPMENT_FR[e] ?? e)
  const gear = [`kettlebell réglable ${String(kb.minKg)}–${String(kb.maxKg)} kg (pas ${fr(kb.stepKg)} kg)`, ...owned]
  return [
    `Profil : ${profile.sex === 'male' ? 'homme' : 'femme'}, ${String(targets.ageYears)} ans, ${String(profile.heightCm)} cm, ${fr(targets.weightKg)} kg (moyenne 7 j), objectif ${GOALS[profile.goal]}, niveau ${LEVELS[profile.level]}, ${String(profile.weeklySessionsTarget)} séances/sem. Matériel : ${gear.join(', ')}.`,
    `Objectifs du jour : ${String(r0(targets.kcal))} kcal, protéines ${String(r0(targets.protein))} g, glucides ${String(r0(targets.carbs))} g, lipides ${String(r0(targets.fat))} g.`,
  ].join('\n')
}

function assemble(kind: ClaudeContextKind, base: ClaudeBaseInput, data: unknown, extra = ''): ClaudeMessage {
  const request = base.request?.trim() ?? ''
  const text = [
    `Contexte envoyé par mon app Forge. Écran : ${SCREEN_TITLES[kind]} (${base.today}).`,
    '',
    profileSummary(base),
    '',
    'Données :',
    '```json',
    json(data),
    '```',
    ...(extra === '' ? [] : ['', extra]),
    '',
    `Ma demande : ${request === '' ? DEFAULT_REQUESTS[kind] : request}`,
    '',
    formatReminder(kind),
  ].join('\n')
  return { kind, text }
}

// ---------- journal ----------

export function buildJournalMessage(input: JournalContextInput): ClaudeMessage {
  const { day, targets } = input
  const meals = day.meals
    .filter((m) => m.entries.length > 0)
    .map((m) => ({
      repas: SLOTS[m.slot],
      items: m.entries.map((e) => ({ nom: short(e.name), ...macrosJson(e.macros) })),
      total: macrosJson(m.totals),
    }))
  const data = {
    date: day.date,
    repas: meals,
    total: macrosJson(day.totals),
    objectif: macrosJson(targets),
    reste: macrosJson({
      kcal: targets.kcal - day.totals.kcal,
      protein: targets.protein - day.totals.protein,
      carbs: targets.carbs - day.totals.carbs,
      fat: targets.fat - day.totals.fat,
    }),
  }
  return assemble('journal', input, data)
}

// ---------- séance ----------

function setTarget(s: SetEntry | undefined): { reps?: [number, number]; dureeSec?: number } {
  if (s === undefined) return {}
  if (s.targetReps !== undefined) return { reps: [s.targetReps[0], s.targetReps[1]] }
  if (s.targetDurationSec !== undefined) return { dureeSec: s.targetDurationSec }
  return {}
}

/** Liste des exercices que Claude peut citer : disponibles (matériel), au niveau du schéma, non masqués. */
export function availableExerciseLines(
  library: readonly LibraryExercise[],
  equipment: Equipment,
  profileLevel: TrainingLevel,
  patternLevels: PatternLevels | undefined,
  include: ReadonlySet<Id> = new Set(),
): string[] {
  const out: string[] = []
  const patterns = [...new Set(library.map((e) => e.pattern))]
  for (const p of patterns) {
    const cap = patternLevels?.[p] ?? profileLevel
    const items = library
      .filter(
        (e) =>
          e.pattern === p &&
          e.deleted !== true &&
          (include.has(e.id) || (e.preference !== 'hidden' && e.level <= cap && isAvailable(e, equipment))),
      )
            .map((e) => `${e.source === 'user' || UUID.test(e.id) ? e.name : `${e.id} = ${e.name}`} (n${String(e.level)}${e.loadType === 'kettlebell' ? ', KB' : e.loadType === 'timed' ? ', durée' : ''})`)
    if (items.length > 0) out.push(`${PATTERN_FR[p]} : ${items.join(' ; ')}`)
  }
  return out
}

export function buildSessionBeforeMessage(input: SessionBeforeContextInput): ClaudeMessage {
  const { plan, library } = input
  const blocks = plan.blocks.map((b, i) => ({
    bloc: i + 1,
    ...(b.kind === 'single' ? {} : { type: b.kind }),
    exercices: b.exercises.map((se) => {
      const first = se.sets[0]
      return {
        ...idField(library, se.exerciseId),
        nom: nameOf(library, se.exerciseId),
        series: se.sets.length,
        ...setTarget(first),
        ...(first?.loadKg !== undefined ? { chargeKg: first.loadKg } : {}),
        reposSec: se.restSec,
        ...(se.tempo !== undefined ? { tempo: se.tempo } : {}),
      }
    }),
  }))
  const data = {
    seance: {
      dureeMin: plan.durationMin,
      dureeEstimeeMin: plan.estimatedMin,
      ...(plan.deload ? { semaineAllegee: true } : {}),
      blocs: blocks,
    },
  }
  const inPlan = new Set(plan.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId)))
  const lines = availableExerciseLines(library, input.equipment, input.profile.level, input.patternLevels, inPlan)
  const extra = ['Exercices disponibles (id = nom, niveau ; KB = avec kettlebell) :', ...lines].join('\n')
  return assemble('session_before', input, data, extra)
}

function setLine(s: SetEntry): string {
  const amount =
    s.actualReps !== undefined
      ? `${String(s.actualReps)}${s.loadKg !== undefined ? `×${fr(s.loadKg)}kg` : ''}`
      : s.actualDurationSec !== undefined
        ? `${String(s.actualDurationSec)}s${s.loadKg !== undefined ? `×${fr(s.loadKg)}kg` : ''}`
        : '?'
  return s.feeling === undefined ? amount : `${amount} ${FEELING_FR[s.feeling]}`
}

export function buildSessionAfterMessage(input: SessionAfterContextInput): ClaudeMessage {
  const { session, records, exercises } = input
  const exs = session.blocks.flatMap((b) => b.exercises)
  const data = {
    seance: {
      date: session.date,
      dureePrevueMin: session.durationMin,
      ...(input.actualMin !== undefined ? { dureeReelleMin: input.actualMin } : {}),
      ...(session.deload ? { semaineAllegee: true } : {}),
      exercices: exs.map((se) => {
        const done = se.sets.filter((s) => s.status === 'done')
        const skipped = se.sets.filter((s) => s.status === 'skipped').length
        return {
          ...idField(exercises, se.exerciseId),
          nom: nameOf(exercises, se.exerciseId),
          series: done.map(setLine),
          ...(skipped > 0 ? { passees: skipped } : {}),
        }
      }),
      ...(session.notes !== undefined && session.notes.trim() !== '' ? { notes: short(session.notes.trim(), 300) } : {}),
    },
    records: records.map((r) => ({
      ...idField(exercises, r.exerciseId),
      nom: nameOf(exercises, r.exerciseId),
      type: RECORD_FR[r.kind],
      valeur: r1(r.value),
      avant: r1(r.previous),
      ...(r.loadKg !== undefined ? { chargeKg: r.loadKg } : {}),
    })),
  }
  return assemble('session_after', input, data)
}

// ---------- recette ----------

export function buildRecipeMessage(input: RecipeContextInput): ClaudeMessage {
  const { recipe, nutrition } = input
  const data = {
    recette: {
      nom: recipe.name,
      repas: recipe.meal.map((m) => SLOTS[m]),
      portions: recipe.servings,
      prepMin: recipe.prepMinutes,
      cuissonMin: recipe.cookMinutes,
      ingredients: recipe.ingredients.map((i) => ({ nom: i.name, g: r0(i.grams) })),
      etapes: recipe.steps.map((s) => short(s, 200)),
      parPortion: macrosJson(nutrition.perServing),
      ...(nutrition.missing.length > 0 ? { sansValeurs: nutrition.missing } : {}),
    },
  }
  return assemble('recipe', input, data)
}

// ---------- progrès ----------

function recentRecords(
  strength: readonly ExerciseStrength[],
  names: ExerciseNames,
  today: LocalDate,
  max = 8,
): { exerciseId?: Id; nom: string; type: string; valeur: number; chargeKg?: number; date: LocalDate }[] {
  const since = addDays(today, -28)
  const out: { exerciseId?: Id; nom: string; type: string; valeur: number; chargeKg?: number; date: LocalDate }[] = []
  for (const s of strength) {
    for (const kind of ['load', 'reps', 'duration'] as const) {
      const rec = s.records[kind]
      if (rec === undefined || rec.date < since || rec.date > today) continue
      out.push({
        ...idField(names, s.exerciseId),
        nom: nameOf(names, s.exerciseId),
        type: RECORD_FR[kind],
        valeur: r1(rec.value),
        ...(rec.loadKg !== undefined ? { chargeKg: rec.loadKg } : {}),
        date: rec.date,
      })
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, max)
}

function nutritionWeekJson(n: NutritionWeek): Record<string, unknown> {
  return {
    du: n.from,
    au: n.to,
    joursLogues: n.daysLogged,
    kcalMoy: n.avgKcal === null ? null : r0(n.avgKcal),
    kcalObjectif: r0(n.targetKcal),
    protMoy: n.avgProtein === null ? null : r0(n.avgProtein),
    protObjectif: r0(n.targetProtein),
    joursDansLaCible: n.daysInTarget,
  }
}

export function buildProgressMessage(input: ProgressContextInput): ClaudeMessage {
  const { weight, regularity, volume, nutritionWeek, strength, exercises } = input
  const change =
    weight.avg7Kg !== null && weight.avg7Kg28DaysAgo !== null ? r1(weight.avg7Kg - weight.avg7Kg28DaysAgo) : null
  const data = {
    poids: {
      moy7jKg: weight.avg7Kg === null ? null : r1(weight.avg7Kg),
      moy7jIl28jKg: weight.avg7Kg28DaysAgo === null ? null : r1(weight.avg7Kg28DaysAgo),
      variation28jKg: change,
      pesees28j: weight.weighIns28d,
    },
    regularite: {
      seancesParSemaine8: regularity.weeks.slice(-8).map((w) => w.sessions),
      serieSemaines: regularity.currentStreak,
      meilleureSerie: regularity.bestStreak,
    },
    volume7j: volume
      .filter((v) => v.status !== 'untracked')
      .map((v) => ({ groupe: MUSCLE_FR[v.group], series: r1(v.sets), cible: [v.target[0], v.target[1]], statut: v.status })),
    nutritionSemaine: nutritionWeekJson(nutritionWeek),
    recordsRecents: recentRecords(strength, exercises, input.today),
  }
  return assemble('progress', input, data)
}

// ---------- bilan ----------

export function buildReviewMessage(input: ReviewContextInput): ClaudeMessage {
  const { review, exercises } = input
  const data = {
    semaineDu: review.weekStart,
    seances: review.sessions,
    seancesPrevues: review.plannedSessions,
    minutes: review.minutes,
    variationPoidsKg: review.weightChangeKg === null ? null : r1(review.weightChangeKg),
    nutrition: nutritionWeekJson(review.nutrition),
    records: review.records.map((r) => ({
      ...idField(exercises, r.exerciseId),
      nom: nameOf(exercises, r.exerciseId),
      type: RECORD_FR[r.kind],
      valeur: r1(r.value),
      avant: r1(r.previous),
      ...(r.loadKg !== undefined ? { chargeKg: r.loadKg } : {}),
    })),
    suggestionApp: review.suggestion.message,
  }
  return assemble('review', input, data)
}
