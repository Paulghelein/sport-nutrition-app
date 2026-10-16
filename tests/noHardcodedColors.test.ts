import { describe, expect, it } from 'vitest'

// Lecture via Vite (pas de types Node dans ce projet) : chemins absolus depuis la racine du dépôt.
const all = import.meta.glob<string>('/src/**/*.{ts,tsx,css,svg}', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const html = import.meta.glob<string>('/index.html', { query: '?raw', import: 'default', eager: true })

const V2_DIRS = [
  '/src/ui/kit/',
  '/src/app/dev/',
  '/src/app/today/',
  '/src/app/progress/',
  '/src/app/shell/',
  '/src/app/training/',
  '/src/content/visuals/',
  '/src/app/nutrition/JournalScreen.tsx',
  '/src/app/nutrition/DaySummary.tsx',
  '/src/app/nutrition/EntrySheet.tsx',
  '/src/app/nutrition/JournalToast.tsx',
  '/src/app/nutrition/NutritionTabs.tsx',
  '/src/app/nutrition/journalModel.ts',
  '/src/app/nutrition/usePhotoUrls.ts',
  '/src/app/claude/VideoRecipeScreen.tsx',
  '/src/app/claude/videoFlow.ts',
  '/src/app/claude/useClaudeBridge.ts',
  '/src/app/claude/bridge.ts',
  '/src/app/recipeScan/',
  '/src/app/recipes/RecipesScreen.tsx',
  '/src/app/recipes/FridgeScreen.tsx',
  '/src/app/recipes/ShoppingScreen.tsx',
  '/src/app/recipes/RecipeScreen.tsx',
  '/src/app/recipes/CookScreen.tsx',
  '/src/app/recipes/RecipeLogSheet.tsx',
  '/src/app/recipes/PrepareFridgeSheet.tsx',
  '/src/app/recipes/AddToShoppingSheet.tsx',
  '/src/app/recipes/partsV2.tsx',
  '/src/app/recipes/loggedNotice.ts',
]
const isV2 = (path: string) => V2_DIRS.some((d) => path.startsWith(d))
const entries = (pred: (path: string) => boolean): [string, string][] =>
  Object.entries(all).filter(([path]) => pred(path))

const PALETTE =
  '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)'
const UTIL = '(?:bg|text|border|fill|stroke|ring|from|to|via|divide|outline|shadow|decoration|accent|caret)'
const RULES: [string, RegExp][] = [
  ['#hex', /#[0-9a-fA-F]{3,8}\b/],
  ['rgb()/rgba()/hsl()', /\b(?:rgba?|hsla?)\(/],
  ['classe de palette Tailwind', new RegExp(`\\b${UTIL}-${PALETTE}-\\d`)],
  ['white/black en classe', new RegExp(`\\b${UTIL}-(?:white|black)\\b`)],
]

function scan(files: [string, string][], rules: [string, RegExp][]): string[] {
  const out: string[] = []
  for (const [path, text] of files)
    text.split('\n').forEach((line, i) => {
      for (const [name, re] of rules) if (re.test(line)) out.push(`${path}:${i + 1} ${name} : ${line.trim()}`)
    })
  return out
}

describe('garde-fou : aucune couleur en dur dans le code v2', () => {
  it('le parcours couvre bien des fichiers', () => {
    expect(entries(isV2).length).toBeGreaterThan(15)
  })
  it('les règles détectent bien les violations (auto-test)', () => {
    for (const bad of [
      '#fff',
      '#ec6a2e',
      'rgb(0 0 0)',
      'rgba(1,2,3,.5)',
      'hsl(10 10% 10%)',
      'bg-red-500',
      'text-slate-900',
      'stroke-blue-600',
      'text-white',
      'border-black',
    ])
      expect(
        RULES.some(([, re]) => re.test(`x ${bad} y`)),
        bad,
      ).toBe(true)
    for (const ok of [
      'bg-surface',
      'text-ink-muted',
      'stroke-ember',
      'bg-inverse/36',
      'whitespace-nowrap',
      'bg-heat-3',
    ])
      expect(
        RULES.some(([, re]) => re.test(`x ${ok} y`)),
        ok,
      ).toBe(false)
  })
  it('src/ui/kit, src/app/dev, src/content/visuals : aucune couleur codée en dur', () => {
    expect(scan(entries(isV2), RULES)).toEqual([])
  })
})

describe('garde-fou : jetons v2 absents des écrans v1', () => {
  // Les noms de jetons v2 (surface, line, canvas, ink…) ont remplacé ceux de la v1 (renommés v1-*) : dans un écran
  // v1 ils changeraient silencieusement le rendu. À étendre à chaque jalon : ajouter ici chaque écran refait en v2.
  const V2_SCREENS = [
    '/src/ui/kit/',
    '/src/app/dev/',
    '/src/app/today/',
    '/src/app/progress/',
    '/src/app/shell/',
    '/src/app/training/',
    '/src/app/screens/SessionScreen.tsx',
    '/src/app/nutrition/JournalScreen.tsx',
    '/src/app/nutrition/DaySummary.tsx',
    '/src/app/nutrition/EntrySheet.tsx',
    '/src/app/nutrition/JournalToast.tsx',
    '/src/app/nutrition/NutritionTabs.tsx',
    '/src/app/nutrition/journalModel.ts',
    '/src/app/nutrition/usePhotoUrls.ts',
    '/src/app/claude/VideoRecipeScreen.tsx',
    '/src/app/recipeScan/',
    '/src/app/recipes/RecipesScreen.tsx',
    '/src/app/recipes/FridgeScreen.tsx',
    '/src/app/recipes/ShoppingScreen.tsx',
    '/src/app/recipes/RecipeScreen.tsx',
    '/src/app/recipes/CookScreen.tsx',
    '/src/app/recipes/RecipeLogSheet.tsx',
    '/src/app/recipes/PrepareFridgeSheet.tsx',
    '/src/app/recipes/AddToShoppingSheet.tsx',
    '/src/app/recipes/partsV2.tsx',
    '/src/app/recipes/loggedNotice.ts',
  ]
  const inV2Screen = (path: string) => V2_SCREENS.some((d) => path.startsWith(d))
  const V2_TOKEN = new RegExp(
    '(?<![\\w-])(?:[\\w[\\]-]+:)*(?:bg|text|border|divide|ring|fill|stroke)-(?:surface|line|canvas|ink)(?:-(?:raised|sunken|muted|faint))?(?![\\w-])',
  )
  it('auto-test', () => {
    for (const bad of [
      'bg-surface',
      'active:bg-surface-raised/50',
      'border-line',
      'text-ink-muted',
      'divide-line',
      'fill-surface-sunken',
    ])
      expect(V2_TOKEN.test(`x ${bad} y`), bad).toBe(true)
    for (const ok of ['bg-v1-surface', 'border-v1-line', 'bg-v1-surface-hi', 'text-zinc-100', 'incline-push'])
      expect(V2_TOKEN.test(`x ${ok} y`), ok).toBe(false)
  })
  it('aucune classe de jeton v2 hors des écrans v2', () => {
    const files = entries(
      (p) => !inV2Screen(p) && !p.endsWith('.css') && !p.includes('.test.') && !p.startsWith('/src/content/'),
    )
    expect(scan(files, [['jeton v2 dans un écran v1', V2_TOKEN]])).toEqual([])
  })
})

describe('garde-fou : jetons v1 et réseau', () => {
  const v1Files = (): [string, string][] => [...entries((p) => !isV2(p)), ...Object.entries(html)]

  it('aucun ancien nom de jeton v1 (sans préfixe v1-) dans les fichiers v1', () => {
    const old = new RegExp(
      `\\b(?:bg|text|border|ring|divide|fill|stroke|from|to|via|outline|placeholder)-(?:bg|surface-hi|line)\\b|var\\(--color-(?:bg|surface-hi)\\)`,
    )
    const hits = scan(
      v1Files().filter(([p]) => !p.endsWith('.css')),
      [['ancien jeton', old]],
    )
    expect(hits).toEqual([])
  })

  it('aucune URL de police ou de CDN dans src/ et index.html', () => {
    const net =
      /fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|cdnjs|unpkg\.com|use\.typekit|@import\s+url\(\s*['"]?https?:/
    const hits = scan(v1Files().concat(entries(isV2)), [['réseau', net]])
    expect(hits).toEqual([])
  })
})
