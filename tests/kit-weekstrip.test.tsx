import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { WeekStrip, weekDayLabel } from '../src/ui/kit'
import type { WeekStripDay } from '../src/ui/kit'

afterEach(cleanup)

const day = (date: string, over: Partial<WeekStripDay> = {}): WeekStripDay => ({
  date,
  level: 0,
  sessions: 0,
  minutes: 0,
  nutritionOk: null,
  future: false,
  today: false,
  ...over,
})

// Lundi 12 → dimanche 18 octobre 2026.
const WEEK: WeekStripDay[] = [
  day('2026-10-12', { level: 1, sessions: 1, minutes: 20, nutritionOk: true }),
  day('2026-10-13'),
  day('2026-10-14', { level: 2, sessions: 1, minutes: 32, nutritionOk: true }),
  day('2026-10-15', { level: 3, sessions: 2, minutes: 70, nutritionOk: false }),
  day('2026-10-16', { level: 4, sessions: 1, minutes: 40, today: true }),
  day('2026-10-17', { future: true }),
  day('2026-10-18', { future: true }),
]

describe('WeekStrip', () => {
  it('7 jours, initiales L M M J V S D', () => {
    const { container } = render(<WeekStrip days={WEEK} />)
    expect(screen.getAllByTestId('week-day')).toHaveLength(7)
    const initials = [...container.querySelectorAll('li > div > span:first-child')].map((e) => e.textContent)
    expect(initials.join('')).toBe('LMMJVSD')
  })

  it('libellés lisibles : séance, nutrition, jour courant, à venir', () => {
    render(<WeekStrip days={WEEK} />)
    expect(
      screen.getByRole('img', { name: 'Mercredi : séance de 32 min, nutrition dans la cible' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('img', { name: 'Lundi : séance de 20 min, nutrition dans la cible' }),
    ).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Mardi : pas de séance, nutrition non évaluée' })).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Jeudi : 2 séances, 70 min, nutrition hors cible' })).toBeTruthy()
    expect(
      screen.getByRole('img', {
        name: 'Vendredi (aujourd’hui) : séance de 40 min (record battu), nutrition non évaluée',
      }),
    ).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Samedi : à venir' })).toBeTruthy()
  })

  it('classe heat selon le niveau ; case vide pour un jour à venir', () => {
    render(<WeekStrip days={WEEK} />)
    const squares = screen.getAllByTestId('week-day').map((d) => d.children[1] as HTMLElement)
    const heat = squares.map((s) => /bg-heat-(\d)/.exec(s.className)?.[1])
    expect(heat).toEqual(['1', '0', '2', '3', '4', undefined, undefined])
    expect(squares[5]?.className).toContain('border-line')
  })

  it('jour courant cerclé, un seul', () => {
    render(<WeekStrip days={WEEK} />)
    const ringed = screen
      .getAllByTestId('week-day')
      .filter((d) => (d.children[1] as HTMLElement).className.includes('ring-2'))
    expect(ringed).toHaveLength(1)
    expect(ringed[0]?.getAttribute('aria-label')).toContain('Vendredi')
  })

  it('point nutrition : plein, anneau ou absent (forme, pas seulement couleur)', () => {
    render(<WeekStrip days={WEEK} />)
    const dots = screen.getAllByTestId('week-day').map((d) => (d.children[2] as HTMLElement).className)
    expect(dots[0]).toContain('bg-good')
    expect(dots[3]).toContain('border-2')
    expect(dots[3]).not.toContain('bg-good')
    expect(dots[1]).not.toMatch(/bg-good|border-2/)
    expect(dots[5]).not.toMatch(/bg-good|border-2/)
  })

  it('un jour à venir ne montre jamais de point, même avec nutritionOk', () => {
    const { container } = render(
      <WeekStrip days={[day('2026-10-17', { future: true, nutritionOk: true })]} />,
    )
    expect(within(container).getByTestId('week-day').children[2]?.className).not.toContain('bg-good')
  })
})

describe('weekDayLabel', () => {
  it('pas de décalage de fuseau sur les dates en bord de mois', () => {
    expect(weekDayLabel(day('2026-11-01'))).toMatch(/^Dimanche :/)
    expect(weekDayLabel(day('2026-03-29', { today: true }))).toMatch(/^Dimanche \(aujourd’hui\) :/)
  })
})
