import { describe, expect, it } from 'vitest'
import type { DayActivity } from '../../types/progress'
import { nutritionOkShare, sessionsThisMonth } from './stats'

const d = (date: string, over: Partial<DayActivity> = {}): DayActivity => ({
  date,
  level: 0,
  sessions: 0,
  minutes: 0,
  record: false,
  nutritionOk: null,
  future: false,
  ...over,
})

describe('sessionsThisMonth', () => {
  it('compte le mois calendaire de today, pas le mois précédent ni le futur', () => {
    const days = [
      d('2026-09-30', { sessions: 1 }),
      d('2026-10-01', { sessions: 1 }),
      d('2026-10-05', { sessions: 2 }),
      d('2026-10-16', { sessions: 1 }),
      d('2026-10-17', { future: true }),
    ]
    expect(sessionsThisMonth(days, '2026-10-16')).toBe(4)
    expect(sessionsThisMonth([], '2026-10-16')).toBe(0)
  })
})

describe('nutritionOkShare', () => {
  it('part des jours évalués, arrondie ; les jours sans journal ne comptent pas', () => {
    const days = [
      d('2026-10-01', { nutritionOk: true }),
      d('2026-10-02', { nutritionOk: true }),
      d('2026-10-03', { nutritionOk: false }),
      d('2026-10-04'),
      d('2026-10-05', { future: true }),
    ]
    expect(nutritionOkShare(days, '2026-10-16')).toBe(67)
  })
  it('aucun jour évalué : null', () => {
    expect(nutritionOkShare([d('2026-10-01')], '2026-10-16')).toBeNull()
    expect(nutritionOkShare([], '2026-10-16')).toBeNull()
  })
  it('la journée en cours est exclue', () => {
    const days = [d('2026-10-15', { nutritionOk: true }), d('2026-10-16', { nutritionOk: false })]
    expect(nutritionOkShare(days, '2026-10-16')).toBe(100)
    expect(nutritionOkShare([d('2026-10-16', { nutritionOk: false })], '2026-10-16')).toBeNull()
  })
})
