import { describe, expect, it } from 'vitest'
import type { MuscleVolume, SessionPlan } from '../../types/engine'
import type { MovementPattern, SessionBlock } from '../../types/training'
import { generateSession } from './generate'
import {
  EMPTY_SESSION_TITLE,
  HEADLINE_TITLE_MAX,
  REASON_BALANCED,
  REASON_CONTINUE,
  REASON_DELOAD,
  REASON_DELOAD_FATIGUE,
  REASON_DELOAD_SCHEDULED,
  REASON_RESTART,
  headlineTitle,
  sessionHeadline,
} from './headline'
import { DURATIONS, completePlan, defaultSettings, makeEquipment, makeInput, seedLibrary } from './testkit'
import { MAJOR_GROUPS, MUSCLE_GROUPS, emptyVolume, volumeTargets, weeklyVolume } from './volume'

const library = seedLibrary()
const targets = volumeTargets(defaultSettings(), makeEquipment())

function plan(blocks: readonly (readonly string[])[], over: Partial<SessionPlan> = {}, finisher?: string): SessionPlan {
  const toBlock = (ids: readonly string[], i: number, kind: SessionBlock['kind']): SessionBlock => ({
    id: `b${i + 1}`,
    kind,
    exercises: ids.map((exerciseId) => ({ exerciseId, restSec: 60, sets: [{}, {}, {}] })),
  })
  const bs = blocks.map((ids, i) => toBlock(ids, i, ids.length > 1 ? 'superset' : 'single'))
  if (finisher !== undefined) bs.push(toBlock([finisher], bs.length, 'finisher'))
  return {
    date: '2026-10-15',
    durationMin: 30,
    warmup: [],
    warmupMin: 4,
    blocks: bs,
    deload: false,
    estimatedMin: 30,
    // Par défaut aucun groupe exclu du focus (le moteur n'y met que les groupes non fatigués en déficit).
    focus: [...MUSCLE_GROUPS],
    ...over,
  }
}

/** Volume où tous les groupes sont au bas de leur cible (semaine équilibrée), avec des surcharges. */
function balanced(over: Partial<MuscleVolume> = {}): MuscleVolume {
  const v = emptyVolume()
  for (const g of MAJOR_GROUPS) v[g] = targets[g][0]
  return { ...v, ...over }
}

const ALL_PATTERNS: readonly MovementPattern[] = [
  'hinge',
  'squat',
  'lunge',
  'push_h',
  'push_v',
  'pull',
  'core',
  'carry',
  'arms',
  'calves',
]

describe('headlineTitle', () => {
  it.each<[MovementPattern[], string]>([
    [['squat', 'hinge', 'pull'], 'Bas du corps et tirage'],
    [['lunge', 'push_h'], 'Bas du corps et poussée'],
    [['squat', 'push_h', 'pull', 'core'], 'Corps entier'],
    [['push_h', 'push_v', 'pull'], 'Haut du corps'],
    [['push_h', 'pull', 'arms'], 'Haut du corps et bras'],
    [['hinge', 'squat'], 'Bas du corps'],
    [['hinge', 'calves'], 'Bas du corps et mollets'],
    [['push_h', 'core'], 'Poussée et gainage'],
    [['push_v', 'carry'], 'Poussée et gainage'],
    [['pull'], 'Tirage'],
    [['pull', 'arms', 'core'], 'Tirage et gainage'],
    [['core'], 'Gainage'],
    [['core', 'arms'], 'Gainage et bras'],
    [['calves', 'arms', 'carry'], 'Gainage, bras et mollets'],
    [[], EMPTY_SESSION_TITLE],
  ])('%j → %s', (patterns, expected) => {
    expect(headlineTitle(patterns)).toBe(expected)
  })

  it('ne dépend pas de l’ordre des schémas', () => {
    expect(headlineTitle(['pull', 'core', 'squat'])).toBe(headlineTitle(['squat', 'pull', 'core']))
  })

  it('reste court, sans point final et avec une majuscule pour toutes les combinaisons de schémas', () => {
    const n = ALL_PATTERNS.length
    for (let mask = 0; mask < 1 << n; mask++) {
      const patterns = ALL_PATTERNS.filter((_, i) => (mask & (1 << i)) !== 0)
      const title = headlineTitle(patterns)
      expect(title.length).toBeLessThanOrEqual(HEADLINE_TITLE_MAX)
      expect(title.endsWith('.')).toBe(false)
      expect(title.charAt(0)).toBe(title.charAt(0).toUpperCase())
      expect(title.charAt(0)).not.toBe(title.charAt(0).toLowerCase())
    }
  })
})

describe('sessionHeadline : titre', () => {
  it('se dérive des exercices de la séance', () => {
    const p = plan([['goblet-squat', 'one-arm-row'], ['kb-deadlift']])
    expect(sessionHeadline(p, library, balanced(), targets).title).toBe('Bas du corps et tirage')
  })

  it('ignore le finisher', () => {
    const p = plan([['push-up', 'plank']], {}, 'two-hand-swing')
    expect(sessionHeadline(p, library, balanced(), targets).title).toBe('Poussée et gainage')
  })

  it('utilise le finisher s’il est seul', () => {
    const p = plan([], {}, 'farmer-carry')
    expect(sessionHeadline(p, library, balanced(), targets).title).toBe('Gainage')
  })

  it('ignore les exercices absents de la bibliothèque', () => {
    const p = plan([['inconnu', 'push-up']])
    expect(sessionHeadline(p, library, balanced(), targets).title).toBe('Poussée')
  })

  it('séance vide : titre par défaut, raison valide, aucun groupe', () => {
    const h = sessionHeadline(plan([]), library, balanced({ quads: 0 }), targets)
    expect(h.title).toBe(EMPTY_SESSION_TITLE)
    expect(h.laggingGroups).toEqual([])
    expect(h.reason).toBe(REASON_CONTINUE)
  })
})

describe('sessionHeadline : raison', () => {
  it('1. deload programmé', () => {
    const p = plan([['goblet-squat']], { deload: true, deloadReason: 'scheduled' })
    const h = sessionHeadline(p, library, balanced({ quads: 0 }), targets)
    expect(h.reason).toBe(REASON_DELOAD_SCHEDULED)
    expect(h.laggingGroups).toEqual([])
  })

  it('1. deload après fatigue', () => {
    const p = plan([['goblet-squat']], { deload: true, deloadReason: 'fatigue' })
    expect(sessionHeadline(p, library, balanced(), targets).reason).toBe(REASON_DELOAD_FATIGUE)
  })

  it('1. deload sans raison connue', () => {
    const p = plan([['goblet-squat']], { deload: true })
    expect(sessionHeadline(p, library, emptyVolume(), targets).reason).toBe(REASON_DELOAD)
  })

  it('1. deload et séance vide', () => {
    const h = sessionHeadline(plan([], { deload: true, deloadReason: 'fatigue' }), library, balanced(), targets)
    expect(h).toEqual({ title: EMPTY_SESSION_TITLE, reason: REASON_DELOAD_FATIGUE, laggingGroups: [] })
  })

  it('2. séances faites mais toutes les séries passées (volume nul) : reprise', () => {
    const skipped = completePlan(plan([['goblet-squat']]), 's0')
    for (const b of skipped.blocks) for (const e of b.exercises) for (const x of e.sets) x.status = 'skipped'
    const vol = weeklyVolume([skipped], library, '2026-10-16')
    const h = sessionHeadline(plan([['goblet-squat']], { date: '2026-10-16' }), library, vol, targets)
    expect(h.reason).toBe(REASON_RESTART)
  })

  it('2. aucun volume sur 7 jours : reprise (et non « tout est en retard »)', () => {
    const h = sessionHeadline(plan([['goblet-squat', 'one-arm-row']]), library, emptyVolume(), targets)
    expect(h.reason).toBe(REASON_RESTART)
    expect(h.laggingGroups).toEqual([])
  })

  it('3. un groupe singulier en retard', () => {
    const h = sessionHeadline(plan([['one-arm-row']]), library, balanced({ back: 3 }), targets)
    expect(h.laggingGroups).toEqual(['back'])
    expect(h.reason).toBe('Le dos est en retard sur ta semaine.')
  })

  it('3. un groupe pluriel en retard', () => {
    const h = sessionHeadline(plan([['push-up']]), library, balanced({ chest: 2 }), targets)
    expect(h.laggingGroups).toEqual(['chest'])
    expect(h.reason).toBe('Les pectoraux sont en retard sur ta semaine.')
  })

  it('3. deux groupes : le plus en retard en proportion d’abord', () => {
    // Quadriceps 2/8 = 0,25 ; dos 5/10 = 0,5 (cible sans barre) : quadriceps d'abord.
    const p = plan([['one-arm-row', 'goblet-squat']])
    const h = sessionHeadline(p, library, balanced({ quads: 2, back: 5, glutes: 7 }), targets)
    expect(h.laggingGroups).toEqual(['quads', 'back'])
    expect(h.reason).toBe('Les quadriceps et le dos sont en retard sur ta semaine.')
  })

  it('3. au plus deux groupes, et l’ordre suit la proportion et non le volume brut', () => {
    // Dos 6/10 = 0,6 ; quadriceps 5/8 = 0,625 ; fessiers 4/8 = 0,5.
    const p = plan([['goblet-squat', 'one-arm-row']])
    const h = sessionHeadline(p, library, balanced({ back: 6, quads: 5, glutes: 4 }), targets)
    expect(h.laggingGroups).toEqual(['glutes', 'back'])
    expect(h.reason).toBe('Les fessiers et le dos sont en retard sur ta semaine.')
  })

  it('3. égalité de proportion : ordre de MAJOR_GROUPS', () => {
    const p = plan([['goblet-squat']])
    const h = sessionHeadline(p, library, balanced({ quads: 4, glutes: 4 }), targets)
    expect(h.laggingGroups).toEqual(['quads', 'glutes'])
  })

  it('3. ne cite que les groupes travaillés en primaire par la séance', () => {
    // Le rowing a les biceps en secondaire et pas les pectoraux : pectoraux en retard non cités.
    const h = sessionHeadline(plan([['one-arm-row']]), library, balanced({ chest: 0, back: 4 }), targets)
    expect(h.laggingGroups).toEqual(['back'])
  })

  it('3. égalité de proportion entre le dos (singulier) et un autre groupe : ordre de MAJOR_GROUPS, verbe au pluriel', () => {
    // Pectoraux 4/8 = 0,5 ; dos 5/10 = 0,5 : pectoraux d'abord (ordre de MAJOR_GROUPS).
    const p = plan([['one-arm-row', 'push-up']])
    const h = sessionHeadline(p, library, balanced({ chest: 4, back: 5 }), targets)
    expect(h.laggingGroups).toEqual(['chest', 'back'])
    expect(h.reason).toBe('Les pectoraux et le dos sont en retard sur ta semaine.')
  })

  it('3. un groupe sous sa cible mais absent du focus (fatigué) n’est pas cité', () => {
    // Quadriceps et dos en retard ; le moteur a retiré les quadriceps du focus (séance lourde hier).
    const p = plan([['goblet-squat', 'one-arm-row']], { focus: ['back', 'glutes'] })
    const h = sessionHeadline(p, library, balanced({ quads: 1, back: 6 }), targets)
    expect(h.laggingGroups).toEqual(['back'])
    expect(h.reason).toBe('Le dos est en retard sur ta semaine.')
  })

  it('3. aucun groupe en retard dans le focus : phrase neutre', () => {
    const p = plan([['goblet-squat']], { focus: [] })
    const h = sessionHeadline(p, library, balanced({ quads: 1 }), targets)
    expect(h.laggingGroups).toEqual([])
    expect(h.reason).toBe(REASON_CONTINUE)
  })

  it('3. ignore les petits groupes même en retard', () => {
    const h = sessionHeadline(plan([['kettlebell-curl']]), library, balanced({ biceps: 0 }), targets)
    expect(h.laggingGroups).toEqual([])
    expect(h.reason).toBe(REASON_BALANCED)
  })

  it('3. respecte les cibles personnalisées', () => {
    const custom = volumeTargets(defaultSettings({ volumeTargets: { back: [4, 6] } }), makeEquipment())
    const h = sessionHeadline(plan([['one-arm-row']]), library, balanced({ back: 5 }), custom)
    expect(h.laggingGroups).toEqual([])
  })

  it('3. un groupe au bas exact de sa cible n’est pas en retard', () => {
    const h = sessionHeadline(plan([['one-arm-row']]), library, balanced({ back: targets.back[0] }), targets)
    expect(h.laggingGroups).toEqual([])
  })

  it('4. semaine équilibrée', () => {
    const h = sessionHeadline(plan([['goblet-squat', 'push-up']]), library, balanced(), targets)
    expect(h.reason).toBe(REASON_BALANCED)
    expect(h.laggingGroups).toEqual([])
  })

  it('4. groupes en retard non travaillés aujourd’hui : phrase neutre, sans prétendre l’équilibre', () => {
    const h = sessionHeadline(plan([['push-up']]), library, balanced({ quads: 1 }), targets)
    expect(h.reason).toBe(REASON_CONTINUE)
    expect(h.laggingGroups).toEqual([])
  })

  it('la raison est toujours une phrase avec majuscule et point final', () => {
    const reasons = [
      REASON_BALANCED,
      REASON_CONTINUE,
      REASON_DELOAD,
      REASON_DELOAD_FATIGUE,
      REASON_DELOAD_SCHEDULED,
      REASON_RESTART,
      sessionHeadline(plan([['one-arm-row', 'goblet-squat']]), library, balanced({ back: 1, quads: 1 }), targets)
        .reason,
    ]
    for (const r of reasons) {
      expect(r.endsWith('.')).toBe(true)
      expect(r.charAt(0)).toBe(r.charAt(0).toUpperCase())
    }
  })
})

describe('sessionHeadline : séances générées', () => {
  it('est déterministe et cohérente avec les séances du moteur, pour chaque durée', () => {
    for (const durationMin of DURATIONS) {
      const input = makeInput({ durationMin })
      const first = generateSession(input)
      const history = [completePlan(first, 's1')]
      const p = generateSession({ ...input, date: '2026-10-17', sessions: history })
      const vol = weeklyVolume(history, input.library, '2026-10-17')
      const a = sessionHeadline(p, input.library, vol, targets)
      const b = sessionHeadline(p, input.library, vol, targets)
      expect(a).toEqual(b)
      expect(a.title.length).toBeLessThanOrEqual(HEADLINE_TITLE_MAX)
      expect(a.title).not.toBe(EMPTY_SESSION_TITLE)
      expect(a.reason.endsWith('.')).toBe(true)
      expect(a.laggingGroups.length).toBeLessThanOrEqual(2)
      for (const g of a.laggingGroups) {
        expect(MAJOR_GROUPS).toContain(g)
        expect(vol[g]).toBeLessThan(targets[g][0])
      }
      // Première séance sans historique : reprise.
      expect(sessionHeadline(first, input.library, emptyVolume(), targets).reason).toBe(REASON_RESTART)
    }
  })
})
