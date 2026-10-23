import { describe, expect, it } from 'vitest'
import type { Profile } from '../../types/profile'
import type { NutritionTargets } from '../../types/nutrition'
import { makeEquipment } from '../training/testkit'
import { buildVideoRecipeMessage, type ClaudeBaseInput } from './context'
import { parseImport } from './import'

const T = '2026-10-16T08:00:00.000Z'
const profile: Profile = {
  id: 'me',
  name: 'Paul Secret',
  sex: 'male',
  birthDate: '2001-03-04',
  heightCm: 178,
  activityLevel: 'moderate',
  goal: 'bulk',
  level: 1,
  weeklySessionsTarget: 5,
  weeklySessionsMin: 3,
  nutrition: { surplus: 0.12, proteinPerKg: 1.8, fatShare: 0.27, kcalAdjustment: 0 },
  createdAt: T,
  updatedAt: T,
}
const targets: NutritionTargets = {
  kcal: 2851.4,
  protein: 130.2,
  carbs: 380,
  fat: 85,
  bmr: 1800,
  tdee: 2700,
  weightKg: 72.43,
  ageYears: 25,
}
const base: ClaudeBaseInput = { profile, equipment: makeEquipment(['mat']), targets, today: '2026-10-16' }

describe('buildVideoRecipeMessage : contenu', () => {
  it.each([
    ['tiktok', 'TikTok'],
    ['instagram', 'Instagram'],
    ['youtube', 'YouTube'],
    ['other', 'une vidéo'],
  ] as const)('plateforme %s', (platform, label) => {
    const m = buildVideoRecipeMessage({ ...base, video: { url: 'https://example.com/v', platform } })
    expect(m.text).toContain(`Vidéo (${label}) : https://example.com/v`)
  })
  const m = buildVideoRecipeMessage({
    ...base,
    video: { url: 'https://youtu.be/abc?t=3', platform: 'youtube' },
  })
  it('lien exact sur une seule ligne, une seule fois', () => {
    const lines = m.text.split('\n').filter((l) => l.includes('https://youtu.be/abc?t=3'))
    expect(lines).toHaveLength(1)
  })
  it('captures d’écran 2 à 3, quantités crues, rayons, portions réalistes, fidélité', () => {
    expect(m.text).toMatch(/2 à 3 captures d’écran/)
    expect(m.text).toContain('CRUES en grammes')
    expect(m.text).toContain('rayon')
    expect(m.text).toContain('portions réaliste')
    expect(m.text).toContain('Reste fidèle')
    expect(m.text).toContain('sauf si ma demande')
  })
  it('format IMPORT_FORMAT : type recipe, ingrédients en grammes, un seul bloc json demandé', () => {
    expect(m.text).toContain('"type":"recipe"')
    expect(m.text).toContain('"grams"')
    expect(m.text).toContain('Types utiles ici : recipe.')
  })
  it('pas de donnée personnelle superflue ni de journal', () => {
    for (const s of [
      'Paul Secret',
      '2001-03-04',
      'birthDate',
      '"id"',
      '72.43',
      'createdAt',
      'Journal',
      'bmr',
      'tdee',
      '178 cm',
    ]) {
      expect(m.text).not.toContain(s)
    }
    expect(m.text).not.toContain('25 ans')
    expect(m.text).not.toContain('kettlebell')
    expect(m.text).toContain('prise de masse')
  })
  it('demande vide ou blanche : demande par défaut', () => {
    expect(
      buildVideoRecipeMessage({
        ...base,
        video: { url: 'https://youtu.be/a', platform: 'youtube' },
        request: '   ',
      }).text,
    ).toContain('Extrais la recette de cette vidéo')
  })
  it('déterministe', () => {
    expect(
      buildVideoRecipeMessage({ ...base, video: { url: 'https://youtu.be/a', platform: 'youtube' } }),
    ).toEqual(buildVideoRecipeMessage({ ...base, video: { url: 'https://youtu.be/a', platform: 'youtube' } }))
  })
})

describe('video_recipe : aller-retour avec parseImport', () => {
  const recipe = {
    type: 'recipe',
    name: 'Egg muffins',
    meal: ['petit-dejeuner'],
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 20,
    ingredients: [
      { name: 'Oeufs', grams: 300, aisle: 'cremerie' },
      { name: 'Épinards surgelés', grams: 150, aisle: 'surgeles' },
    ],
    steps: ['Mélanger.', 'Cuire 20 min à 180 °C.'],
  }
  it('bloc json seul, objet (pas tableau)', () => {
    const r = parseImport('```json\n' + JSON.stringify(recipe) + '\n```', { today: '2026-10-16' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.items.map((i) => i.kind)).toEqual(['recipe'])
  })
  it('même réponse en tableau d’un élément', () => {
    const r = parseImport('Voilà\n```json\n' + JSON.stringify([recipe]) + '\n```', { today: '2026-10-16' })
    expect(r.ok).toBe(true)
  })
  it('réponse sans bloc json (Claude demande des captures) : pas de succès', () => {
    const r = parseImport(
      'Je ne peux pas ouvrir le lien. Peux-tu m’envoyer 2 à 3 captures d’écran des ingrédients ?',
      { today: '2026-10-16' },
    )
    expect(r.ok).toBe(false)
  })
})

describe('video_recipe : cohérence des consignes', () => {
  const m = buildVideoRecipeMessage({ ...base, video: { url: 'https://youtu.be/a', platform: 'youtube' } })
  it('une seule consigne de format : commentaire avant, un objet recipe', () => {
    expect(m.text).toContain('court commentaire')
    expect(m.text).toContain('un seul objet de type recipe')
    expect(m.text).not.toContain('tableau d’objets')
    expect(m.text).not.toContain('Données :')
  })
})
