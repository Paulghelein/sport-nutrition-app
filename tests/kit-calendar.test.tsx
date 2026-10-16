import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WeekStrip, calendarDayLabel } from '../src/ui/kit'
import { CalendarHeatmap } from '../src/ui/kit/CalendarHeatmap'
import { DaySummarySheet } from '../src/ui/kit/DaySummarySheet'
import type { DaySummaryView, WeekStripDay } from '../src/ui/kit'

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

/** 2 semaines : lundi 5 → dimanche 18 octobre 2026 ; aujourd'hui = mercredi 14. */
function twoWeeks(): WeekStripDay[] {
  return Array.from({ length: 14 }, (_, i) => {
    const date = `2026-10-${String(5 + i).padStart(2, '0')}`
    const n = 5 + i
    if (n > 14) return day(date, { future: true })
    if (n === 6) return day(date, { level: 2, sessions: 1, minutes: 32, nutritionOk: true })
    if (n === 7) return day(date, { level: 4, sessions: 1, minutes: 40, nutritionOk: false })
    if (n === 14) return day(date, { today: true })
    return day(date)
  })
}

describe('CalendarHeatmap', () => {
  it('une case-bouton par jour, libellé en français : date, séance, record, nutrition', () => {
    render(<CalendarHeatmap days={twoWeeks()} />)
    expect(screen.getAllByTestId('calendar-day')).toHaveLength(14)
    expect(
      screen.getByRole('button', { name: 'Mardi 6 octobre : séance de 32 min, nutrition dans la cible' }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: 'Mercredi 7 octobre : séance de 40 min (record battu), nutrition hors cible',
      }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', {
        name: 'Mercredi 14 octobre (aujourd’hui) : pas de séance, nutrition non évaluée',
      }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Jeudi 15 octobre : à venir' })).toBeTruthy()
  })

  it('classes heat par niveau, case vide pour le futur, point nutrition seulement si dans la cible', () => {
    render(<CalendarHeatmap days={twoWeeks()} />)
    const cell = (date: string) =>
      screen.getAllByTestId('calendar-day').find((e) => e.dataset['date'] === date) as HTMLElement
    expect(cell('2026-10-06').className).toContain('bg-heat-2')
    expect(cell('2026-10-07').className).toContain('bg-heat-4')
    expect(cell('2026-10-08').className).toContain('bg-heat-0')
    expect(cell('2026-10-15').className).not.toMatch(/bg-heat/)
    expect(cell('2026-10-15').className).toContain('border-line')
    expect(cell('2026-10-06').querySelector('span')).not.toBeNull()
    expect(cell('2026-10-07').querySelector('span')).toBeNull()
    expect(cell('2026-10-14').className).toContain('ring-ink')
  })

  it('grille en colonnes de semaines : 7 lignes, autant de colonnes que de semaines', () => {
    render(<CalendarHeatmap days={twoWeeks()} label="Test" />)
    const grid = screen.getByRole('list', { name: 'Test' })
    expect(grid.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))')
    expect(grid.className).toContain('grid-flow-col')
  })

  it('toucher une case appelle onSelectDay avec la date', () => {
    const onSelectDay = vi.fn()
    render(<CalendarHeatmap days={twoWeeks()} onSelectDay={onSelectDay} />)
    fireEvent.click(screen.getByRole('button', { name: /^Mardi 6 octobre/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Jeudi 15 octobre/ }))
    expect(onSelectDay.mock.calls).toEqual([['2026-10-06'], ['2026-10-15']])
  })

  it('clavier : une seule case dans l’ordre de tabulation (aujourd’hui), flèches pour se déplacer', () => {
    render(<CalendarHeatmap days={twoWeeks()} />)
    const buttons = screen.getAllByTestId('calendar-day')
    expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1)
    const today = buttons.find((b) => b.dataset['date'] === '2026-10-14') as HTMLElement
    expect(today.tabIndex).toBe(0)
    today.focus()
    fireEvent.keyDown(today, { key: 'ArrowUp' })
    expect(document.activeElement).toBe(buttons.find((b) => b.dataset['date'] === '2026-10-13'))
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(buttons.find((b) => b.dataset['date'] === '2026-10-06'))
    // Bords : pas de sortie de la grille.
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(buttons.find((b) => b.dataset['date'] === '2026-10-06'))
  })

  it('aria-current sur le jour ouvert ; Début / Fin vont à la première / dernière case', () => {
    render(<CalendarHeatmap days={twoWeeks()} selectedDate="2026-10-06" />)
    const buttons = screen.getAllByTestId('calendar-day')
    expect(
      buttons.filter((b) => b.getAttribute('aria-current') === 'date').map((b) => b.dataset['date']),
    ).toEqual(['2026-10-06'])
    buttons[3]?.focus()
    fireEvent.keyDown(buttons[3] as HTMLElement, { key: 'End' })
    expect(document.activeElement).toBe(buttons[13])
    fireEvent.keyDown(buttons[13] as HTMLElement, { key: 'Home' })
    expect(document.activeElement).toBe(buttons[0])
  })

  it('légende : niveaux et nutrition nommés', () => {
    render(<CalendarHeatmap days={twoWeeks()} />)
    expect(screen.getByText('Nutrition OK')).toBeTruthy()
    expect(screen.getByText(/Moins/)).toBeTruthy()
    expect(screen.getByText(/Record/)).toBeTruthy()
  })
})

describe('WeekStrip interactive', () => {
  it('avec onSelectDay : 7 boutons ≥ 44 px de haut (classe), libellé de jour, appelle la date', () => {
    const onSelectDay = vi.fn()
    const week = twoWeeks().slice(0, 7)
    render(<WeekStrip days={week} onSelectDay={onSelectDay} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(7)
    expect(buttons[0]?.className).toContain('min-h-14')
    fireEvent.click(screen.getByRole('button', { name: 'Mardi : séance de 32 min, nutrition dans la cible' }))
    expect(onSelectDay).toHaveBeenCalledWith('2026-10-06')
  })

  it('sans onSelectDay : décoratif (images, aucun bouton)', () => {
    render(<WeekStrip days={twoWeeks().slice(0, 7)} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.getAllByRole('img')).toHaveLength(7)
  })
})

describe('calendarDayLabel', () => {
  it('date complète', () => {
    expect(calendarDayLabel(day('2026-10-16', { today: true, level: 3, sessions: 2, minutes: 70 }))).toBe(
      'Vendredi 16 octobre (aujourd’hui) : 2 séances, 70 min, nutrition non évaluée',
    )
  })
})

const VIEW: DaySummaryView = {
  title: 'Mercredi 14 octobre',
  future: false,
  sessions: [
    {
      id: 's',
      title: 'Séance de 32 min',
      details: '14 séries · Goblet squat',
      records: ['Goblet squat, 18 kg × 12'],
    },
  ],
  meals: [{ id: 'lunch', label: 'Déjeuner', details: 'Riz, Poulet', kcal: 820 }],
  totals: { kcal: 2710, protein: 148 },
  targets: { kcal: 2840, protein: 140 },
  nutritionOk: true,
}

describe('DaySummarySheet', () => {
  it('séance, record, repas, total face à l’objectif, état nutrition en mots', () => {
    render(<DaySummarySheet day={VIEW} onClose={() => undefined} />)
    const dialog = screen.getByRole('dialog', { name: 'Mercredi 14 octobre' })
    expect(within(dialog).getByText('Séance de 32 min')).toBeTruthy()
    expect(within(dialog).getByText('Record : Goblet squat, 18 kg × 12')).toBeTruthy()
    expect(within(dialog).getByText('Déjeuner')).toBeTruthy()
    const text = (dialog.textContent ?? '').replace(/\s/g, ' ')
    expect(text).toContain('2 710')
    expect(text).toContain('/ 2 840 kcal')
    expect(text).toContain('/ 140 g')
    expect(within(dialog).getByTestId('day-nutrition-status').textContent).toContain('Dans la cible')
  })

  it('hors cible, objectif inconnu, jour vide, jour à venir', () => {
    const { rerender } = render(
      <DaySummarySheet day={{ ...VIEW, nutritionOk: false }} onClose={() => undefined} />,
    )
    expect(screen.getByTestId('day-nutrition-status').textContent).toContain('Hors cible')
    rerender(
      <DaySummarySheet day={{ ...VIEW, nutritionOk: null, targets: null }} onClose={() => undefined} />,
    )
    expect(screen.getByTestId('day-nutrition-status').textContent).toContain('Objectif inconnu')
    rerender(<DaySummarySheet day={{ ...VIEW, sessions: [], meals: [] }} onClose={() => undefined} />)
    expect(screen.getByText(/Rien d’enregistré/)).toBeTruthy()
    expect(screen.queryByTestId('day-nutrition-status')).toBeNull()
    rerender(
      <DaySummarySheet day={{ ...VIEW, sessions: [], meals: [], future: true }} onClose={() => undefined} />,
    )
    expect(screen.getByText('Ce jour n’est pas encore arrivé.')).toBeTruthy()
  })

  it('jour précédent / suivant : boutons ≥ 44 px, désactivés sans action', () => {
    const onPrev = vi.fn()
    const { rerender } = render(<DaySummarySheet day={VIEW} onClose={() => undefined} onPrev={onPrev} />)
    const prev = screen.getByRole('button', { name: 'Jour précédent' }) as HTMLButtonElement
    const next = screen.getByRole('button', { name: 'Jour suivant' }) as HTMLButtonElement
    expect(prev.disabled).toBe(false)
    expect(next.disabled).toBe(true)
    expect(prev.className).toContain('min-h-11')
    fireEvent.click(prev)
    expect(onPrev).toHaveBeenCalledOnce()
    rerender(<DaySummarySheet day={VIEW} onClose={() => undefined} />)
    expect((screen.getByRole('button', { name: 'Jour précédent' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('journée en cours : pas de « Hors cible »', () => {
    render(
      <DaySummarySheet day={{ ...VIEW, inProgress: true, nutritionOk: false }} onClose={() => undefined} />,
    )
    const status = screen.getByTestId('day-nutrition-status').textContent ?? ''
    expect(status).toContain('Journée en cours')
    expect(status).not.toContain('Hors cible')
  })

  it('Échap et croix ferment', () => {
    const onClose = vi.fn()
    render(<DaySummarySheet day={VIEW} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
