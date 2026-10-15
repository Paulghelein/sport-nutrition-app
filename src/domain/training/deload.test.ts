import { describe, expect, it } from 'vitest'
import type { Session } from '../../types/training'
import { addDays } from '../shared/dates'
import {
  DEFAULT_DELOAD_EVERY_WEEKS,
  deloadEveryWeeks,
  deloadSets,
  deloadStatus,
  isHardSession,
} from './deload'
import { defaultSettings, doneSession } from './testkit'

const S = defaultSettings()
const TODAY = '2026-10-15'

const normal = (date: string, feeling: 'ok' | 'hard' = 'ok'): Session =>
  doneSession(date, [['goblet-squat', 3, feeling]])
const deload = (date: string): Session => ({ ...normal(date), id: `d-${date}`, deload: true })

describe('deloadStatus', () => {
  it('inactif sans historique', () => {
    expect(deloadStatus([], TODAY, S)).toEqual({ active: false })
  })

  it('(a) actif pendant 7 jours à partir de la première séance deload du bloc', () => {
    const sessions = [normal('2026-10-01'), deload('2026-10-10'), deload('2026-10-12')]
    expect(deloadStatus(sessions, '2026-10-12', S)).toMatchObject({ active: true, since: '2026-10-10' })
    expect(deloadStatus(sessions, '2026-10-16', S)).toMatchObject({ active: true, since: '2026-10-10' })
    expect(deloadStatus(sessions, '2026-10-17', S).active).toBe(false)
  })

  it('(a) une séance deload non terminée ne compte pas', () => {
    const planned: Session = { ...deload('2026-10-14'), status: 'planned' }
    expect(deloadStatus([normal('2026-10-01'), planned], TODAY, S).active).toBe(false)
  })

  it('(b) programmé après N semaines depuis la première séance faite', () => {
    const first = '2026-09-01'
    const sessions = [normal(first)]
    expect(deloadStatus(sessions, addDays(first, 41), S).active).toBe(false)
    expect(deloadStatus(sessions, addDays(first, 42), S)).toEqual({
      active: true,
      reason: 'scheduled',
      since: addDays(first, 42),
    })
    expect(deloadStatus(sessions, addDays(first, 21), defaultSettings({ deloadEveryWeeks: 3 })).active).toBe(
      true,
    )
  })

  it('(b) le cycle repart du dernier deload', () => {
    const sessions = [normal('2026-08-01'), deload('2026-09-12'), normal('2026-09-20')]
    expect(deloadStatus(sessions, '2026-10-23', S).active).toBe(false) // 41 jours
    expect(deloadStatus(sessions, '2026-10-24', S)).toMatchObject({ active: true, reason: 'scheduled' })
  })

  it('(c) fatigue : 3 séances majoritairement hard sur 7 jours', () => {
    const two = [normal('2026-10-01'), normal('2026-10-10', 'hard'), normal('2026-10-12', 'hard')]
    expect(deloadStatus(two, TODAY, S).active).toBe(false)
    const three = [...two, normal('2026-10-14', 'hard')]
    expect(deloadStatus(three, TODAY, S)).toEqual({ active: true, reason: 'fatigue', since: TODAY })
    // Une séance hard trop ancienne (today − 7) ne compte pas.
    const old = [normal('2026-10-08', 'hard'), normal('2026-10-12', 'hard'), normal('2026-10-14', 'hard')]
    expect(deloadStatus(old, TODAY, S).active).toBe(false)
  })

  it('(c) pas de deload enchaîné : à la fin d’un deload, les séances hard d’avant sont sorties de la fenêtre', () => {
    // Deload du 4 (après 3 séances hard), terminé le 11 : une seule séance hard depuis → pas de nouveau deload.
    const sessions = [
      normal('2026-10-02', 'hard'),
      normal('2026-10-03', 'hard'),
      deload('2026-10-04'),
      normal('2026-10-10', 'hard'),
    ]
    expect(deloadStatus(sessions, '2026-10-10', S)).toMatchObject({ active: true, since: '2026-10-04' })
    expect(deloadStatus(sessions, '2026-10-11', S).active).toBe(false)
  })

  it('(a) garde la raison qui a déclenché le deload', () => {
    const sessions = [
      normal('2026-10-05', 'hard'),
      normal('2026-10-06', 'hard'),
      normal('2026-10-07', 'hard'),
      deload('2026-10-08'),
    ]
    expect(deloadStatus(sessions, '2026-10-10', S)).toEqual({
      active: true,
      reason: 'fatigue',
      since: '2026-10-08',
    })
  })

  it('séance hard = au moins la moitié des séries faites hard', () => {
    const s = doneSession(TODAY, [
      ['goblet-squat', 2, 'hard'],
      ['push-up', 2, 'ok'],
    ])
    expect(isHardSession(s)).toBe(true)
    expect(isHardSession(doneSession(TODAY, [['goblet-squat', 3, 'ok']]))).toBe(false)
  })

  it('fréquence invalide → défaut de 6 semaines', () => {
    expect(deloadEveryWeeks(defaultSettings({ deloadEveryWeeks: 0 }))).toBe(DEFAULT_DELOAD_EVERY_WEEKS)
    expect(deloadEveryWeeks(defaultSettings({ deloadEveryWeeks: Number.NaN }))).toBe(
      DEFAULT_DELOAD_EVERY_WEEKS,
    )
    expect(deloadEveryWeeks(defaultSettings({ deloadEveryWeeks: 4 }))).toBe(4)
  })
})

describe('deloadSets', () => {
  it('moitié arrondie au supérieur, au moins 2', () => {
    expect(deloadSets(3)).toBe(2)
    expect(deloadSets(4)).toBe(2)
    expect(deloadSets(5)).toBe(3)
    expect(deloadSets(2)).toBe(2)
    expect(deloadSets(1)).toBe(1)
  })
})
