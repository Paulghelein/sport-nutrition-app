import { describe, expect, it } from 'vitest'
import { BACKUP_REMINDER_DAYS } from '../../types/progress'
import { backupReminder } from './backup'

// Dates construites en heure locale : le test ne dépend pas du fuseau de la machine.
const local = (y: number, mo: number, d: number, h = 12, mi = 0) => new Date(y, mo - 1, d, h, mi)
const iso = (date: Date) => date.toISOString()
const NOW = local(2026, 10, 16, 9, 0)

describe('backupReminder', () => {
  it('jamais exporté -> never', () => {
    expect(backupReminder(null, NOW)).toEqual({ status: 'never', daysSince: null })
  })

  it('export le jour même -> ok, 0 jour', () => {
    expect(backupReminder(iso(local(2026, 10, 16, 8, 0)), NOW)).toEqual({ status: 'ok', daysSince: 0 })
  })

  it('jours calendaires locaux, pas des tranches de 24 h', () => {
    // hier à 23 h 30, maintenant 0 h 30 : 1 jour
    expect(backupReminder(iso(local(2026, 10, 15, 23, 30)), local(2026, 10, 16, 0, 30))).toEqual({
      status: 'ok',
      daysSince: 1,
    })
  })

  it(`seuil : ${BACKUP_REMINDER_DAYS - 1} jours -> ok, ${BACKUP_REMINDER_DAYS} jours -> due`, () => {
    expect(BACKUP_REMINDER_DAYS).toBe(7)
    expect(backupReminder(iso(local(2026, 10, 10, 20)), NOW)).toEqual({ status: 'ok', daysSince: 6 })
    expect(backupReminder(iso(local(2026, 10, 9, 20)), NOW)).toEqual({ status: 'due', daysSince: 7 })
    expect(backupReminder(iso(local(2026, 8, 1)), NOW)).toEqual({ status: 'due', daysSince: 76 })
  })

  it('traverse le changement d’heure (29 mars 2026, 25 octobre 2026)', () => {
    expect(backupReminder(iso(local(2026, 3, 27, 12)), local(2026, 4, 3, 12))).toEqual({
      status: 'due',
      daysSince: 7,
    })
    expect(backupReminder(iso(local(2026, 10, 24, 12)), local(2026, 10, 30, 12))).toEqual({
      status: 'ok',
      daysSince: 6,
    })
  })

  it('export daté d’un jour futur (horloge changée) -> due, durée inconnue', () => {
    expect(backupReminder(iso(local(2026, 10, 17, 8)), NOW)).toEqual({ status: 'due', daysSince: null })
    expect(backupReminder(iso(local(2027, 1, 1)), NOW)).toEqual({ status: 'due', daysSince: null })
  })

  it('export plus tard le même jour (décalage de minutes) -> ok', () => {
    expect(backupReminder(iso(local(2026, 10, 16, 9, 5)), NOW)).toEqual({ status: 'ok', daysSince: 0 })
  })

  it('date illisible, now invalide ou année hors bornes -> due, durée inconnue', () => {
    const due = { status: 'due', daysSince: null }
    expect(backupReminder('pas une date', NOW)).toEqual(due)
    expect(backupReminder('', NOW)).toEqual(due)
    expect(backupReminder(iso(local(2026, 10, 1)), new Date(Number.NaN))).toEqual(due)
    expect(backupReminder('+010000-01-01T00:00:00.000Z', new Date(Date.UTC(10001, 0, 1)))).toEqual(due)
  })
})
