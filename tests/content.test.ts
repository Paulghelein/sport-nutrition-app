import { describe, expect, it } from 'vitest'
import { illustrations, SEED_UPDATED_AT, seedExercises } from '../src/content'
import { defaultEquipment } from '../src/db/defaults'
import { exerciseSchema } from '../src/db/schemas'
import { checkExercise } from '../src/db/validation'
import { defaultLoadStep, isAvailable, mergeLibrary, PATTERN_ORDER, toExerciseInput } from '../src/domain/training/library'

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/

describe('exercices de départ', () => {
  it('ids uniques et kebab-case', () => {
    const ids = seedExercises.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id, id).toMatch(KEBAB)
  })

  it.each(seedExercises.map((e) => [e.id, e] as const))('%s : métadonnées et validation', (_id, ex) => {
    expect(ex.source).toBe('seed')
    expect(ex.updatedAt).toBe(SEED_UPDATED_AT)
    expect(ex.videoUrl).toBeUndefined()
    expect(ex.deleted).toBeUndefined()
    expect(checkExercise(toExerciseInput(ex))).toBeNull()
    expect(exerciseSchema.safeParse(ex).success).toBe(true)
    expect(ex.illustration, 'illustration manquante').toBeDefined()
    expect(Object.keys(illustrations)).toContain(ex.illustration)
  })

  it.each(seedExercises.map((e) => [e.id, e] as const))('%s : cohérence', (_id, ex) => {
    expect(ex.loadStepKg).toBe(defaultLoadStep(ex.pattern))
    // Exactement une cible ; timed → durée, bodyweight → reps, kettlebell → l'un ou l'autre (portés).
    expect(ex.repRange === undefined).toBe(ex.durationRange !== undefined)
    if (ex.loadType === 'timed') expect(ex.durationRange).toBeDefined()
    if (ex.loadType === 'bodyweight') expect(ex.repRange).toBeDefined()
    if (ex.loadType === 'kettlebell') expect(ex.equipment).toContain('kettlebell')
    expect(ex.technique.setup.trim()).not.toBe('')
    expect(ex.technique.steps.length).toBeGreaterThanOrEqual(3)
    expect(ex.technique.steps.length).toBeLessThanOrEqual(5)
    expect(ex.technique.cues.length).toBeGreaterThanOrEqual(3)
    expect(ex.technique.mistakes.length).toBeGreaterThanOrEqual(2)
    expect(ex.technique.mistakes.length).toBeLessThanOrEqual(3)
    expect(ex.muscles.primary.length).toBeGreaterThan(0)
    expect(ex.progressionCriteria.trim()).not.toBe('')
  })

  it('couverture SPEC §3.1', () => {
    const equipment = defaultEquipment(SEED_UPDATED_AT)
    for (const pattern of PATTERN_ORDER) {
      const inPattern = seedExercises.filter((e) => e.pattern === pattern)
      for (const level of [1, 2, 3]) {
        expect(inPattern.some((e) => e.level === level), `${pattern} niveau ${level}`).toBe(true)
      }
      expect(
        inPattern.some((e) => e.level === 1 && isAvailable(e, equipment)),
        `${pattern} niveau 1 disponible avec le matériel par défaut`,
      ).toBe(true)
    }
  })

  it('mergeLibrary conserve tous les exercices', () => {
    expect(mergeLibrary(seedExercises, [], [])).toHaveLength(seedExercises.length)
  })
})

describe('illustrations', () => {
  const entries = Object.entries(illustrations)

  it('aucun SVG orphelin', () => {
    const used = new Set(seedExercises.map((e) => e.illustration))
    for (const [id] of entries) expect(used.has(id), `orphelin : ${id}`).toBe(true)
  })

  it.each(entries)('%s : SVG sûr et bien formé', (_id, svg) => {
    expect(svg.trimStart().startsWith('<svg')).toBe(true)
    expect(svg).toContain('viewBox="0 0 200 120"')
    expect(svg).toContain('currentColor')
    expect(svg).not.toMatch(/<script/i)
    expect(svg).not.toMatch(/<style/i)
    // Le rôle et le nom accessible sont portés par le conteneur de l'UI.
    expect(svg).not.toMatch(/\srole=/)
    expect(svg).not.toMatch(/\bon\w+\s*=/i)
    expect(svg).not.toMatch(/href\s*=/i)
    expect(svg).not.toMatch(/<image/i)
    expect(svg).not.toMatch(/<text/i)
    const root = /^\s*<svg\b[^>]*>/.exec(svg)?.[0] ?? ''
    expect(root).not.toMatch(/\s(width|height)\s*=/)
    expect(new TextEncoder().encode(svg).length).toBeLessThan(4096)
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0)
    expect(doc.documentElement.tagName).toBe('svg')
  })
})
