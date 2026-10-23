import { describe, expect, it } from 'vitest'
import viteConfig from '../vite.config.ts?raw'

// Lecture via Vite (pas de types Node dans ce projet) : chemins absolus depuis la racine du dépôt.
const all = import.meta.glob<string>('/src/**/*.{ts,tsx,css,svg}', {
  query: '?raw',
  import: 'default',
  eager: true,
})
const html = import.meta.glob<string>('/index.html', { query: '?raw', import: 'default', eager: true })

// Exemptions, chacune pour une raison précise :
// - bloc `@theme { … }` de src/index.css : il DÉFINIT les jetons (#hex) et les ombres (--shadow-*: rgb()). Le reste
//   du fichier est scanné comme le code.
// - fichiers *.test.* de src : cas de test (chaînes de couleurs), pas du rendu.
const THEME_BLOCK = /@theme\s*\{[\s\S]*?\n\}\n/
const entries = (): [string, string][] => Object.entries(all)
const covered = (): [string, string][] =>
  entries()
    .filter(([path]) => !path.includes('.test.'))
    .map(([path, text]): [string, string] => [
      path,
      path === '/src/index.css' ? text.replace(THEME_BLOCK, '') : text,
    ])

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

describe('garde-fou : aucune couleur en dur dans src/', () => {
  it('le parcours couvre bien des fichiers', () => {
    expect(covered().length).toBeGreaterThan(100)
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
  it('aucune couleur codée en dur (#hex, rgb/hsl, palette Tailwind, white/black)', () => {
    expect(scan(covered(), RULES)).toEqual([])
  })
  it('plus aucun jeton ni nom « v1- » dans src/ et index.html', () => {
    const v1 = /(?<![\w])v1-/
    expect(v1.test('bg-v1-bg')).toBe(true)
    expect(scan([...entries(), ...Object.entries(html)], [['jeton v1', v1]])).toEqual([])
  })
})

describe('garde-fou : réseau', () => {
  it('aucune URL de police ou de CDN dans src/ et index.html', () => {
    const net =
      /fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|cdnjs|unpkg\.com|use\.typekit|@import\s+url\(\s*['"]?https?:/
    const hits = scan([...entries(), ...Object.entries(html)], [['réseau', net]])
    expect(hits).toEqual([])
  })
})

describe('garde-fou : couleur du thème', () => {
  const first = (text: string | undefined, re: RegExp): string | undefined =>
    text?.match(re)?.[1]?.toLowerCase()
  it('canvas = theme-color (index.html) = themeColor du manifest (vite.config.ts)', () => {
    const css = all['/src/index.css']
    const canvas = first(css, /--color-canvas:\s*(#[0-9a-fA-F]{6})\s*;/)
    expect(canvas).toMatch(/^#[0-9a-f]{6}$/)
    expect(first(Object.values(html)[0], /<meta\s+name="theme-color"\s+content="(#[0-9a-fA-F]{6})"/)).toBe(
      canvas,
    )
    const config = viteConfig
    expect(first(config, /const themeColor = '(#[0-9a-fA-F]{6})'/)).toBe(canvas)
    expect(config).toMatch(/theme_color:\s*themeColor/)
    expect(config).toMatch(/background_color:\s*themeColor/)
  })
})
