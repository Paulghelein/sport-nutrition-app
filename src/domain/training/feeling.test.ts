import { describe, expect, it } from 'vitest'
import type { Feeling, SetEntry } from '../../types/training'
import { doneSets, dominantFeeling } from './feeling'

const sets = (...f: (Feeling | undefined)[]): SetEntry[] => f.map((feeling) => ({ status: 'done', feeling }))

describe('ressenti dominant', () => {
  it('hard dès que la moitié des séries sont hard', () => {
    expect(dominantFeeling(sets('hard', 'hard', 'easy', 'easy'))).toBe('hard')
    expect(dominantFeeling(sets('hard', 'ok', 'ok'))).toBe('ok')
  })
  it('easy si plus de la moitié sont easy, sinon ok', () => {
    expect(dominantFeeling(sets('easy', 'easy', 'ok'))).toBe('easy')
    expect(dominantFeeling(sets('easy', 'ok'))).toBe('ok')
    expect(dominantFeeling(sets(undefined, undefined))).toBe('ok')
    expect(dominantFeeling([])).toBe('ok')
  })
  it('ne garde que les séries faites', () => {
    expect(doneSets([{ status: 'done' }, { status: 'skipped' }, {}])).toHaveLength(1)
  })
})
