import { describe, expect, it } from 'vitest'
import { addDays, ageOn, daysBetween, formatDateFr, isValidLocalDate, toLocalDate } from './dates'

describe('toLocalDate', () => {
  it('utilise les composantes locales', () => {
    expect(toLocalDate(new Date(2026, 9, 15, 23, 59, 59))).toBe('2026-10-15')
    expect(toLocalDate(new Date(2026, 0, 1, 0, 0, 1))).toBe('2026-01-01')
  })
})

describe('isValidLocalDate', () => {
  it('valide / refuse', () => {
    expect(isValidLocalDate('2026-10-15')).toBe(true)
    expect(isValidLocalDate('2024-02-29')).toBe(true)
    expect(isValidLocalDate('2026-02-29')).toBe(false)
    expect(isValidLocalDate('2026-02-30')).toBe(false)
    expect(isValidLocalDate('2026-13-01')).toBe(false)
    expect(isValidLocalDate('2026-1-01')).toBe(false)
    expect(isValidLocalDate('2026-10-15T00:00')).toBe(false)
    expect(isValidLocalDate('')).toBe(false)
  })
})

describe('addDays / daysBetween', () => {
  it('traverse mois, années et bissextile', () => {
    expect(addDays('2026-10-15', 20)).toBe('2026-11-04')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-10-15', 0)).toBe('2026-10-15')
  })
  it("changement d'heure fin octobre (Europe/Paris : 2026-10-25)", () => {
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
    expect(daysBetween('2026-10-20', '2026-11-03')).toBe(14)
    // changement d'heure de mars
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
  })
  it('daysBetween signé', () => {
    expect(daysBetween('2026-10-15', '2026-10-08')).toBe(-7)
    expect(daysBetween('2026-10-15', '2026-10-15')).toBe(0)
  })
})

describe('ageOn', () => {
  it("veille et jour d'anniversaire", () => {
    expect(ageOn('2000-10-15', '2026-10-14')).toBe(25)
    expect(ageOn('2000-10-15', '2026-10-15')).toBe(26)
  })
  it('né un 29 février', () => {
    expect(ageOn('2000-02-29', '2026-02-28')).toBe(25)
    expect(ageOn('2000-02-29', '2026-03-01')).toBe(26)
    expect(ageOn('2000-02-29', '2028-02-29')).toBe(28)
    expect(ageOn('2000-02-29', '2028-02-28')).toBe(27)
  })
  it('jour de naissance', () => {
    expect(ageOn('2026-10-15', '2026-10-15')).toBe(0)
  })
})

describe('formatDateFr', () => {
  it('court et long', () => {
    expect(formatDateFr('2026-10-15')).toBe('15 oct.')
    expect(formatDateFr('2026-10-14', 'long')).toBe('mercredi 14 octobre 2026')
    expect(formatDateFr('2026-10-15', 'long')).toBe('jeudi 15 octobre 2026')
  })
})
