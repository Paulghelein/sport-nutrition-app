// Import JSON (Réglages → Importer, J6, IMPORT_FORMAT.md) : extraction du JSON d'un texte, validation Zod des
// recettes et repas, conversion des valeurs françaises vers les enums anglais, liaison à Ciqual par le nom.
import { z } from 'zod'
import type { Id, IsoDateTime, LocalDate } from '../../types/common'
import type { ImportedMeal, ImportParseResult, ImportPreviewItem, RecipeInput } from '../../types/recipes'
import type {
  Aisle,
  CiqualFood,
  FoodLogEntry,
  MealSlot,
  Per100g,
  RecipeIngredient,
} from '../../types/nutrition'
import { normalizeFoodSearch } from '../nutrition/search'
import { addDays, isValidLocalDate } from '../shared/dates'
import type { ExerciseInput, TemplateBlock } from '../../types/training'
import type { KettlebellSpec } from '../../types/profile'
import {
  parseExerciseElement,
  parsePlanElement,
  parsePreferenceElement,
  type ImportExerciseRef,
} from './importTraining'

export interface ImportContext {
  today: LocalDate
  ciqual?: readonly CiqualFood[]
  /** Règles métier injectées (le domaine n'importe pas src/db) : message d'erreur ou null. */
  validateRecipe?: (r: RecipeInput) => string | null
  validateEntry?: (e: FoodLogEntry) => string | null
  /**
   * Bibliothèque d'exercices fusionnée (sans les supprimés). Fournie par « Coller la réponse de Claude » : active
   * les types `exercise`, `exercisePreference` et `sessionPlan` ; absente → ils restent `unsupported`.
   */
  exercises?: readonly ImportExerciseRef[]
  /** Kettlebell de l'utilisateur (`Equipment.kettlebell`) : charges des séances ramenées dans la plage, au pas réel. */
  kettlebell?: KettlebellSpec
  /** `templateIssues` de src/domain/training : avertit des lignes qui seront écartées à l'application. */
  /** Raison pour laquelle un exercice créé par la réponse ne serait pas proposé (niveau du schéma, matériel) ; `null` = ok. */
  newExerciseIssue?: (e: ExerciseInput) => string | null
  planIssues?: (blocks: TemplateBlock[]) => { exerciseId: Id; message: string }[]
  /** Règles métier d'un exercice (`checkExercise` de src/db/validation), injectées comme `validateRecipe`. */
  validateExercise?: (e: ExerciseInput) => string | null
}

// ---------- Extraction du JSON ----------

export type ExtractResult = { ok: true; value: unknown } | { ok: false; error: string }

function tryParse(s: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(s) as unknown }
  } catch {
    return { ok: false }
  }
}

/** Sous-chaîne équilibrée commençant en `start` (guillemets et échappements respectés), ou null. */
function balanced(text: string, start: number): string | null {
  const open = text[start]
  const close = open === '[' ? ']' : '}'
  let depth = 0
  let inStr = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (c === '\\') i++
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === open) depth++
    else if (c === close && --depth === 0) return text.slice(start, i + 1)
  }
  return null
}

/**
 * Accepte un JSON seul (tableau ou objet), ou un texte contenant un bloc ```json (le dernier lisible l'emporte),
 * à défaut le premier `[`…`]` équilibré lisible, puis le premier `{`…`}`.
 */
export function extractJsonPayload(text: string): ExtractResult {
  const whole = tryParse(text.trim())
  if (whole.ok) return whole
  const blocks = [...text.matchAll(/```json[^\S\n]*\r?\n?([\s\S]*?)```/gi)].map((m) => m[1] ?? '')
  let sawBlock = false
  for (let i = blocks.length - 1; i >= 0; i--) {
    sawBlock = true
    const r = tryParse((blocks[i] ?? '').trim())
    if (r.ok) return r
  }
  for (const open of ['[', '{']) {
    for (let i = text.indexOf(open); i !== -1; i = text.indexOf(open, i + 1)) {
      const chunk = balanced(text, i)
      if (chunk === null) continue
      const r = tryParse(chunk)
      if (r.ok) return r
    }
  }
  return {
    ok: false,
    error: sawBlock
      ? 'Le bloc JSON est illisible (virgule, guillemet ou crochet manquant ?).'
      : 'Aucun JSON trouvé dans le texte.',
  }
}

// ---------- Valeurs françaises → enums ----------

const key = (s: string): string => normalizeFoodSearch(s).replace(/ /g, '')

const SLOTS: Record<string, MealSlot> = {
  petitdej: 'breakfast',
  petitdejeuner: 'breakfast',
  breakfast: 'breakfast',
  dejeuner: 'lunch',
  lunch: 'lunch',
  diner: 'dinner',
  dinner: 'dinner',
  collation: 'snack',
  snack: 'snack',
}

const AISLES: Record<string, Aisle> = {
  fruitslegumes: 'produce',
  fruitsetlegumes: 'produce',
  produce: 'produce',
  boucherie: 'butcher',
  butcher: 'butcher',
  poissonnerie: 'fish',
  fish: 'fish',
  cremerie: 'dairy',
  dairy: 'dairy',
  epicerie: 'grocery',
  grocery: 'grocery',
  surgeles: 'frozen',
  surgele: 'frozen',
  frozen: 'frozen',
  boulangerie: 'bakery',
  bakery: 'bakery',
  autre: 'other',
  other: 'other',
}

// ---------- Schémas Zod ----------
// Les champs simples passent par `z.unknown().transform` : l'erreur porte 'missing' ou 'invalid', traduite plus bas
// avec le chemin du champ (« ingrédient 2 : grammes manquants »).

const MISSING = 'missing'
const INVALID = 'invalid'

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  if (typeof v === 'string') {
    const t = v.trim().replace(',', '.')
    return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : undefined
  }
  return undefined
}

const isAbsent = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '')

interface NumOpts {
  /** Valeur minimale incluse (défaut 0) ; `positive` exige > 0. */
  positive?: boolean
}

function num(opts: NumOpts = {}) {
  return z
    .unknown()
    .optional()
    .transform((v, ctx): number => {
      if (isAbsent(v)) {
        ctx.issues.push({ code: 'custom', message: MISSING, input: v })
        return z.NEVER
      }
      const n = toNumber(v)
      if (n === undefined || n < 0 || (opts.positive === true && n <= 0)) {
        ctx.issues.push({ code: 'custom', message: INVALID, input: v })
        return z.NEVER
      }
      return n
    })
}

function optNum(opts: NumOpts = {}) {
  return z
    .unknown()
    .optional()
    .transform((v, ctx): number | undefined => {
      if (isAbsent(v)) return undefined
      const n = toNumber(v)
      if (n === undefined || n < 0 || (opts.positive === true && n <= 0)) {
        ctx.issues.push({ code: 'custom', message: INVALID, input: v })
        return z.NEVER
      }
      return n
    })
}

function str() {
  return z
    .unknown()
    .optional()
    .transform((v, ctx): string => {
      if (typeof v !== 'string' && typeof v !== 'number') {
        ctx.issues.push({ code: 'custom', message: isAbsent(v) ? MISSING : INVALID, input: v })
        return z.NEVER
      }
      const s = String(v).trim()
      if (s === '') {
        ctx.issues.push({ code: 'custom', message: MISSING, input: v })
        return z.NEVER
      }
      return s
    })
}

function optStr() {
  return z
    .unknown()
    .optional()
    .transform((v, ctx): string | undefined => {
      if (isAbsent(v)) return undefined
      if (typeof v !== 'string' && typeof v !== 'number') {
        ctx.issues.push({ code: 'custom', message: INVALID, input: v })
        return z.NEVER
      }
      return String(v).trim()
    })
}

function slot() {
  return z
    .unknown()
    .optional()
    .transform((v, ctx): MealSlot => {
      if (isAbsent(v)) {
        ctx.issues.push({ code: 'custom', message: MISSING, input: v })
        return z.NEVER
      }
      const s = typeof v === 'string' ? SLOTS[key(v)] : undefined
      if (s === undefined) {
        ctx.issues.push({ code: 'custom', message: `UNKNOWN:${String(v)}`, input: v })
        return z.NEVER
      }
      return s
    })
}

function aisle() {
  return z
    .unknown()
    .optional()
    .transform((v, ctx): Aisle => {
      if (isAbsent(v)) return 'other'
      const a = typeof v === 'string' ? AISLES[key(v)] : undefined
      if (a === undefined) {
        ctx.issues.push({ code: 'custom', message: `UNKNOWN:${String(v)}`, input: v })
        return z.NEVER
      }
      return a
    })
}

/** Tableau de chaînes ; absent → []. Une chaîne seule devient un tableau d'un élément. */
function strList() {
  return z
    .unknown()
    .optional()
    .transform((v, ctx): string[] => {
      if (isAbsent(v)) return []
      const arr = Array.isArray(v) ? v : [v]
      if (!arr.every((x) => typeof x === 'string')) {
        ctx.issues.push({ code: 'custom', message: INVALID, input: v })
        return z.NEVER
      }
      return arr.map((x) => (x as string).trim()).filter((x) => x !== '')
    })
}

const per100gSchema = z.object({
  kcal: num(),
  protein: num(),
  carbs: num(),
  fat: num(),
  fiber: optNum(),
})

const ingredientSchema = z.object({
  name: str(),
  grams: num({ positive: true }),
  ciqualCode: optStr(),
  aisle: aisle(),
  per100g: per100gSchema.optional(),
})

const mealList = z
  .unknown()
  .optional()
  .transform((v, ctx): MealSlot[] => {
    if (isAbsent(v) || (Array.isArray(v) && v.length === 0)) {
      ctx.issues.push({ code: 'custom', message: MISSING, input: v })
      return z.NEVER
    }
    const arr = Array.isArray(v) ? v : [v]
    const out: MealSlot[] = []
    for (const x of arr) {
      const s = typeof x === 'string' ? SLOTS[key(x)] : undefined
      if (s === undefined) {
        ctx.issues.push({ code: 'custom', message: `UNKNOWN:${String(x)}`, input: x })
        return z.NEVER
      }
      if (!out.includes(s)) out.push(s)
    }
    return out
  })

const recipeSchema = z.object({
  name: str(),
  meal: mealList,
  servings: num({ positive: true }),
  prepMinutes: optNum(),
  cookMinutes: optNum(),
  fridgeDays: optNum({ positive: true }),
  tags: strList(),
  ingredients: z.array(ingredientSchema).min(1),
  steps: strList(),
})

const mealSchema = z.object({
  name: str(),
  date: optStr(),
  slot: slot(),
  estimated: z
    .unknown()
    .optional()
    .transform((v, ctx): boolean => {
      if (isAbsent(v)) return true
      if (typeof v !== 'boolean') {
        ctx.issues.push({ code: 'custom', message: INVALID, input: v })
        return z.NEVER
      }
      return v
    }),
  totals: z.object({ kcal: num(), protein: optNum(), carbs: optNum(), fat: optNum() }),
})

// ---------- Traduction des erreurs ----------

interface Label {
  noun: string
  fem?: boolean
  plural?: boolean
}

const LABELS: Record<string, Label> = {
  name: { noun: 'nom' },
  meal: { noun: 'repas' },
  servings: { noun: 'portions', fem: true, plural: true },
  prepMinutes: { noun: 'temps de préparation' },
  cookMinutes: { noun: 'temps de cuisson' },
  fridgeDays: { noun: 'durée de conservation' },
  tags: { noun: 'tags', plural: true },
  steps: { noun: 'étapes', fem: true, plural: true },
  ingredients: { noun: 'ingrédients', plural: true },
  grams: { noun: 'grammes', plural: true },
  ciqualCode: { noun: 'code Ciqual' },
  aisle: { noun: 'rayon' },
  per100g: { noun: 'valeurs pour 100 g', plural: true },
  kcal: { noun: 'kcal', plural: true },
  protein: { noun: 'protéines', fem: true, plural: true },
  carbs: { noun: 'glucides', plural: true },
  fat: { noun: 'lipides', plural: true },
  fiber: { noun: 'fibres', fem: true, plural: true },
  fibre: { noun: 'fibres', fem: true, plural: true },
  date: { noun: 'date', fem: true },
  slot: { noun: 'repas' },
  estimated: { noun: 'champ estimated' },
  totals: { noun: 'totaux', plural: true },
}

function phrase(l: Label, missing: boolean): string {
  if (!missing) return `${l.noun} invalide${l.plural === true ? 's' : ''}`
  return `${l.noun} manquant${l.fem === true ? 'e' : ''}${l.plural === true ? 's' : ''}`
}

function valueAt(raw: unknown, path: readonly PropertyKey[]): unknown {
  let cur: unknown = raw
  for (const p of path) {
    if (typeof cur !== 'object' || cur === null) return undefined
    cur = (cur as Record<PropertyKey, unknown>)[p]
  }
  return cur
}

function translateIssue(issue: z.core.$ZodIssue, raw: unknown): string {
  const path = issue.path
  let prefix = ''
  const fields: PropertyKey[] = []
  for (let i = 0; i < path.length; i++) {
    const p = path[i] as PropertyKey
    if (typeof p === 'number') {
      const parent = path[i - 1]
      if (parent === 'ingredients') prefix = `ingrédient ${p + 1}`
      else if (parent === 'meal') prefix = ''
      else prefix = `${String(parent)} ${p + 1}`
    } else if (p !== 'ingredients') fields.push(p)
  }
  const leaf = path.length > 0 ? String(path[path.length - 1]) : ''
  const label = LABELS[typeof path[path.length - 1] === 'number' ? String(path[path.length - 2]) : leaf]
  const parentKey = fields.length > 1 ? String(fields[fields.length - 2]) : ''
  let ctxName = ''
  if (parentKey === 'per100g') ctxName = 'valeurs pour 100 g : '
  else if (parentKey === 'totals') ctxName = 'totaux : '
  const noun = label ?? { noun: leaf || 'élément' }
  const absent = issue.code === 'custom' ? issue.message === MISSING : valueAt(raw, path) === undefined
  let body: string
  if (issue.code === 'custom' && issue.message.startsWith('UNKNOWN:')) {
    body = `${noun.noun} inconnu « ${issue.message.slice(8)} »`
  } else if (issue.code === 'too_small' && leaf === 'ingredients') {
    body = 'aucun ingrédient'
  } else if (leaf === 'ingredients' && absent) {
    body = 'aucun ingrédient'
  } else {
    body = phrase(noun, absent)
  }
  const head = [prefix, ctxName.replace(/ : $/, '')].filter((x) => x !== '').join(', ')
  return head === '' ? body : `${head} : ${body}`
}

// ---------- Appariement Ciqual par le nom ----------

const STOP = new Set([
  'de',
  'du',
  'des',
  'd',
  'la',
  'le',
  'les',
  'l',
  'un',
  'une',
  'et',
  'ou',
  'au',
  'aux',
  'a',
  'en',
  'sans',
  'avec',
  'pour',
])
/** États de cuisson : ignorés pour la couverture, mais « cru » départage les égalités. */
const STATE = new Set(['cru', 'crue', 'crus', 'crues', 'cuit', 'cuite', 'cuits', 'cuites', 'nature'])
const RAW = new Set(['cru', 'crue', 'crus', 'crues'])
/** Noms Ciqual de produits transformés, écartés sauf si le nom d'ingrédient contient le mot. */
const EXCLUDED = new Set([
  'huile',
  'beurre',
  'nectar',
  'jus',
  'sirop',
  'fecule',
  'poudre',
  'seche',
  'seches',
  'sechee',
  'sechees',
  'dehydrate',
  'dehydratee',
  'fume',
  'fumee',
  'son',
  'foie',
  'dragee',
  'coco',
  'cola',
])

/** Égalité de mots au pluriel près (≥ 5 lettres) ; « pâtes » et « pâté » ne sont jamais confondus. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true
  if (a.startsWith('pate') && b.startsWith('pate')) return false
  const sing = (w: string): string =>
    w.length >= 5 && (w.endsWith('s') || w.endsWith('x')) ? w.slice(0, -1) : w
  return sing(a) === sing(b)
}

const has = (list: readonly string[], w: string): boolean => list.some((x) => sameWord(x, w))

interface CiqualIndexEntry {
  food: CiqualFood
  /** Tous les mots (sans mots vides). */
  words: string[]
  /** Sans états de cuisson. */
  core: string[]
  raw: boolean
}

function buildCiqualIndex(list: readonly CiqualFood[]): CiqualIndexEntry[] {
  return list.map((food) => {
    const words = food.search.split(' ').filter((w) => w !== '' && !STOP.has(w))
    return { food, words, core: words.filter((w) => !STATE.has(w)), raw: words.some((w) => RAW.has(w)) }
  })
}

/**
 * Appariement prudent : le premier mot du nom Ciqual doit figurer dans le nom d'ingrédient, tous les mots
 * significatifs de l'ingrédient doivent être dans le nom Ciqual, et ils doivent en couvrir au moins la moitié
 * (hors cru/cuit/nature). Produits transformés écartés. Meilleur : couverture, puis « cru », puis nom court.
 */
function matchCiqual(name: string, index: readonly CiqualIndexEntry[]): CiqualFood | null {
  const q = normalizeFoodSearch(name)
    .split(' ')
    .filter((w) => w !== '' && !STOP.has(w))
  const qCore = q.filter((w) => !STATE.has(w))
  if (qCore.length === 0) return null
  let best: { e: CiqualIndexEntry; cover: number } | null = null
  for (const e of index) {
    const first = e.core[0]
    if (first === undefined || !has(qCore, first)) continue
    if (!qCore.every((w) => has(e.core, w))) continue
    if (e.core.some((w) => EXCLUDED.has(w) && !has(qCore, w))) continue
    const cover = qCore.length / e.core.length
    if (cover < 0.5) continue
    if (
      best === null ||
      cover > best.cover ||
      (cover === best.cover &&
        (Number(e.raw) > Number(best.e.raw) ||
          (e.raw === best.e.raw && e.food.search.length < best.e.food.search.length)))
    ) {
      best = { e, cover }
    }
  }
  return best ? best.e.food : null
}

// ---------- Éléments ----------

function stripNulls(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripNulls)
  if (typeof v === 'object' && v !== null) {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v)) if (x !== null) out[k] = stripNulls(x)
    return out
  }
  return v
}

/** Copie sans les propriétés `undefined` (compatible exactOptionalPropertyTypes). */
function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

const UNSUPPORTED = new Set(['exercisePreference', 'sessionPlan', 'exercise'])
const UNSUPPORTED_MESSAGE =
  'Ce type s’applique depuis « Coller la réponse de Claude » (boutons Claude des écrans Séance, Journal, Progrès…), pas depuis Réglages.'

function parseRecipe(
  raw: unknown,
  index: number,
  ciqualByCode: ReadonlyMap<string, CiqualFood> | null,
  getIndex: () => CiqualIndexEntry[] | null,
  validate?: (r: RecipeInput) => string | null,
): ImportPreviewItem {
  const r = recipeSchema.safeParse(raw)
  if (!r.success) return { kind: 'invalid', index, errors: r.error.issues.map((i) => translateIssue(i, raw)) }
  const d = r.data
  const warnings: string[] = []
  const ingredients: RecipeIngredient[] = d.ingredients.map((ing) => {
    const per100g: Per100g | undefined = ing.per100g ? clean({ ...ing.per100g }) : undefined
    let code = ing.ciqualCode === '' ? undefined : ing.ciqualCode
    if (code !== undefined && ciqualByCode !== null) {
      if (ciqualByCode.has(code)) {
        // Valeurs recalculées depuis Ciqual : celles fournies sont ignorées.
        return clean({ name: ing.name, grams: ing.grams, ciqualCode: code, aisle: ing.aisle })
      }
      warnings.push(
        `${ing.name} : code Ciqual ${code} inconnu${per100g ? ', valeurs fournies conservées' : ''}`,
      )
      if (!per100g) code = undefined
    }
    if (code === undefined && per100g === undefined) {
      const idx = getIndex()
      const hit = idx ? matchCiqual(ing.name, idx) : null
      if (hit) {
        warnings.push(`${ing.name} : relié à Ciqual : ${hit.name}`)
        return { name: ing.name, grams: ing.grams, ciqualCode: hit.code, aisle: ing.aisle }
      }
      warnings.push(`${ing.name} : pas de valeurs nutritionnelles`)
    }
    return clean({ name: ing.name, grams: ing.grams, ciqualCode: code, aisle: ing.aisle, per100g })
  })
  const recipe: RecipeInput = clean({
    name: d.name,
    meal: d.meal,
    servings: d.servings,
    prepMinutes: d.prepMinutes ?? 0,
    cookMinutes: d.cookMinutes ?? 0,
    fridgeDays: d.fridgeDays,
    tags: d.tags,
    ingredients,
    steps: d.steps,
  })
  const bad = validate?.(recipe) ?? null
  if (bad !== null) return { kind: 'invalid', index, errors: [bad] }
  return { kind: 'recipe', index, recipe, warnings }
}

function parseMeal(
  raw: unknown,
  index: number,
  today: LocalDate,
  validate?: (e: FoodLogEntry) => string | null,
): ImportPreviewItem {
  const r = mealSchema.safeParse(raw)
  const errors = r.success ? [] : r.error.issues.map((i) => translateIssue(i, raw))
  if (!r.success) return { kind: 'invalid', index, errors }
  const d = r.data
  const date = d.date === undefined ? today : d.date
  if (!isValidLocalDate(date))
    return { kind: 'invalid', index, errors: [`date invalide « ${date} » (format AAAA-MM-JJ)`] }
  if (date > addDays(today, 1)) return { kind: 'invalid', index, errors: [`date dans le futur : ${date}`] }
  const warnings: string[] = []
  const miss = (v: number | undefined, label: string): number => {
    if (v === undefined) warnings.push(`${label} manquants : 0 g retenu`)
    return v ?? 0
  }
  const meal: ImportedMeal = {
    name: d.name,
    date,
    slot: d.slot,
    estimated: d.estimated,
    totals: {
      kcal: d.totals.kcal,
      protein: miss(d.totals.protein, 'protéines'),
      carbs: miss(d.totals.carbs, 'glucides'),
      fat: miss(d.totals.fat, 'lipides'),
    },
  }
  const bad =
    validate?.(importedMealEntry(meal, { id: 'preview', createdAt: `${today}T00:00:00.000Z` })) ?? null
  if (bad !== null) return { kind: 'invalid', index, errors: [bad] }
  return { kind: 'meal', index, meal, warnings }
}

export function parseImport(text: string, ctx: ImportContext): ImportParseResult {
  const ex = extractJsonPayload(text)
  if (!ex.ok) return ex
  const value = ex.value
  const list: unknown[] = Array.isArray(value)
    ? value
    : typeof value === 'object' && value !== null
      ? [value]
      : []
  if (!Array.isArray(value) && (typeof value !== 'object' || value === null)) {
    return { ok: false, error: 'Le JSON doit être un tableau ou un objet.' }
  }
  if (list.length === 0) return { ok: false, error: 'Aucun élément à importer.' }

  const ciqual = ctx.ciqual
  const byCode = ciqual && ciqual.length > 0 ? new Map(ciqual.map((c) => [c.code, c])) : null
  let idx: CiqualIndexEntry[] | null | undefined
  const getIndex = (): CiqualIndexEntry[] | null => {
    if (idx === undefined) idx = ciqual && ciqual.length > 0 ? buildCiqualIndex(ciqual) : null
    return idx
  }

  const training = ctx.exercises
    ? {
        exercises: ctx.exercises,
        ...(ctx.validateExercise ? { validateExercise: ctx.validateExercise } : {}),
        ...(ctx.kettlebell ? { kettlebell: ctx.kettlebell } : {}),
        ...(ctx.planIssues ? { planIssues: ctx.planIssues } : {}),
        ...(ctx.newExerciseIssue ? { newExerciseIssue: ctx.newExerciseIssue } : {}),
      }
    : null
  const typeOf = (el: unknown): string | undefined => {
    if (typeof el !== 'object' || el === null || Array.isArray(el)) return undefined
    const t = (el as Record<string, unknown>).type
    return typeof t === 'string' ? t : undefined
  }
  // Exercices valides de la réponse, résolus avant les séances qui peuvent les citer par leur nom.
  const createdExercises = new Map<number, ExerciseInput>()
  const exerciseItems = new Map<number, ImportPreviewItem>()
  if (training) {
    list.forEach((el, index) => {
      if (typeOf(el) !== 'exercise') return
      const item = parseExerciseElement(stripNulls(el), index, training)
      exerciseItems.set(index, item)
      if (item.kind === 'exercise') createdExercises.set(index, item.exercise)
    })
  }

  const items = list.map((el, index): ImportPreviewItem => {
    if (typeof el !== 'object' || el === null || Array.isArray(el)) {
      return { kind: 'invalid', index, errors: ["l'élément n'est pas un objet"] }
    }
    const raw = stripNulls(el)
    const type = (raw as Record<string, unknown>).type
    if (typeof type !== 'string' || type.trim() === '')
      return { kind: 'invalid', index, errors: ['type manquant'] }
    if (type === 'recipe') return parseRecipe(raw, index, byCode, getIndex, ctx.validateRecipe)
    if (type === 'meal') return parseMeal(raw, index, ctx.today, ctx.validateEntry)
    if (UNSUPPORTED.has(type)) {
      if (training === null) return { kind: 'unsupported', index, type, message: UNSUPPORTED_MESSAGE }
      if (type === 'exercise') return exerciseItems.get(index) ?? parseExerciseElement(raw, index, training)
      if (type === 'exercisePreference') return parsePreferenceElement(raw, index, training)
      return parsePlanElement(raw, index, training, createdExercises)
    }
    return { kind: 'invalid', index, errors: [`type inconnu « ${type} »`] }
  })
  // Plusieurs séances proposées : seule la dernière valide est applicable (la dernière réponse de Claude corrige
  // les précédentes, et une séance remplace la séance du jour : on ne peut en appliquer qu'une).
  let lastPlan = -1
  items.forEach((it, i) => {
    if (it.kind === 'sessionPlan') lastPlan = i
  })
  const finalItems = items.map((it, i): ImportPreviewItem =>
    it.kind === 'sessionPlan' && i !== lastPlan
      ? {
          kind: 'invalid',
          index: it.index,
          errors: ['plusieurs séances dans la réponse : seule la dernière est retenue'],
        }
      : it,
  )
  if (training) annotate(finalItems, ctx.exercises ?? [])
  return { ok: true, items: finalItems }
}

/** Entrée de journal d'un repas importé ; macros figées. */
export function importedMealEntry(meal: ImportedMeal, ctx: { id: Id; createdAt: IsoDateTime }): FoodLogEntry {
  return {
    id: ctx.id,
    date: meal.date,
    slot: meal.slot,
    name: meal.name,
    origin: { kind: 'import', estimated: meal.estimated },
    macros: { ...meal.totals },
    createdAt: ctx.createdAt,
  }
}

/**
 * Avertissements croisés entre éléments d'une même réponse (modifie `warnings` en place) : exercices de même nom,
 * et exercice du plan que la réponse masque (`hidden`).
 */
function annotate(items: readonly ImportPreviewItem[], known: readonly ImportExerciseRef[]): void {
  const seen = new Set<string>()
  const hidden = new Set<Id>()
  for (const it of items) {
    if (it.kind === 'exercise') {
      const n = normalizeFoodSearch(it.exercise.name)
      if (seen.has(n)) it.warnings.push(`« ${it.exercise.name} » apparaît plusieurs fois dans la réponse`)
      seen.add(n)
    } else if (it.kind === 'exercisePreference' && it.preference.preference === 'hidden') {
      hidden.add(it.preference.exerciseId)
    }
  }
  for (const it of items) {
    if (it.kind !== 'sessionPlan') continue
    for (const b of it.plan.blocks) {
      if (hidden.has(b.exerciseId))
        it.warnings.push(
          `« ${known.find((e) => e.id === b.exerciseId)?.name ?? b.exerciseId} » est masqué par la même réponse mais figure dans la séance`,
        )
    }
  }
}
