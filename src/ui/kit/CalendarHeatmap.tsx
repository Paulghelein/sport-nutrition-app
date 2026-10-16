import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { calendarDayLabel } from './weekDayLabel'
import type { WeekStripDay } from './weekDayLabel'
import { cx } from './cx'

export interface CalendarHeatmapProps {
  /** Jours consécutifs, le premier est un lundi ; `length` multiple de 7 (une colonne par semaine, lundi en haut). */
  days: readonly WeekStripDay[]
  /** Appelé avec la date du jour touché (jours à venir compris : le résumé dit « à venir »). */
  onSelectDay?: (date: string) => void
  /** Jour dont le résumé est ouvert : `aria-current="date"` sur sa case. */
  selectedDate?: string | null
  /** Nom accessible de la grille. */
  label?: string
  className?: string
}

const HEAT: Record<WeekStripDay['level'], string> = {
  0: 'bg-heat-0',
  1: 'bg-heat-1',
  2: 'bg-heat-2',
  3: 'bg-heat-3',
  4: 'bg-heat-4',
}

const ROW_LABELS = ['L', '', 'M', '', 'V', '', 'D'] as const

/**
 * Calendrier de régularité façon GitHub : une colonne par semaine (lundi en haut), case colorée `heat-0..4` selon le
 * niveau de séance, point central si la nutrition est dans la cible, case vide pour un jour à venir, anneau pour
 * aujourd'hui. La couleur n'est jamais seule porteuse de sens : chaque case est un bouton dont le libellé donne la
 * date, la séance, le record et la nutrition (« Mercredi 14 octobre : séance de 32 min, nutrition dans la cible »),
 * et la légende nomme les niveaux extrêmes. Les cases font ≈ 22 × 19 px : la zone tactile déborde de 2 px dans les
 * écarts pour que toute la grille réponde au doigt (une cible de 44 px est impossible à 84 cases).
 * Clavier : une seule case dans l'ordre de tabulation, flèches pour se déplacer (↑↓ jour, ←→ semaine), Début / Fin pour la première / dernière case.
 */
export function CalendarHeatmap({
  days,
  onSelectDay,
  selectedDate = null,
  label = 'Calendrier de régularité',
  className,
}: CalendarHeatmapProps) {
  const weeks = Math.ceil(days.length / 7)
  const todayIndex = days.findIndex((d) => d.today)
  const [focusIndex, setFocusIndex] = useState(() =>
    todayIndex >= 0 ? todayIndex : Math.max(0, days.length - 1),
  )
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const move = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const jump: Record<string, number> = {
      ArrowUp: index - 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 7,
      ArrowRight: index + 7,
      Home: 0,
      End: days.length - 1,
    }
    const next = jump[e.key]
    if (next === undefined) return
    e.preventDefault()
    if (next < 0 || next >= days.length) return
    setFocusIndex(next)
    refs.current[next]?.focus()
  }

  return (
    <div className={cx('flex flex-col gap-3', className)}>
      <div className="flex gap-1.5">
        <div
          aria-hidden="true"
          className="grid grid-rows-[repeat(7,19px)] items-center gap-1 text-micro font-semibold text-ink-muted"
        >
          {ROW_LABELS.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
        <ul
          aria-label={label}
          className="m-0 grid min-w-0 flex-1 list-none grid-flow-col grid-rows-[repeat(7,19px)] gap-1 p-0"
          style={{ gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))` }}
        >
          {days.map((day, i) => (
            <li key={day.date} className="flex">
              <button
                type="button"
                ref={(el) => {
                  refs.current[i] = el
                }}
                aria-label={calendarDayLabel(day)}
                aria-current={day.date === selectedDate ? 'date' : undefined}
                tabIndex={i === focusIndex ? 0 : -1}
                data-testid="calendar-day"
                data-date={day.date}
                data-level={day.future ? 'future' : day.level}
                onClick={() => {
                  setFocusIndex(i)
                  onSelectDay?.(day.date)
                }}
                onFocus={() => setFocusIndex(i)}
                onKeyDown={(e) => move(e, i)}
                className={cx(
                  'focus-ring relative grid w-full place-items-center rounded-[5px]',
                  'after:absolute after:-inset-0.5',
                  day.future ? 'box-border border border-line' : HEAT[day.level],
                  day.today && 'ring-[1.5px] ring-ink ring-offset-2 ring-offset-surface',
                )}
              >
                {!day.future && day.nutritionOk === true && (
                  <span
                    aria-hidden="true"
                    className={cx('size-1 rounded-full', day.level === 4 ? 'bg-on-inverse' : 'bg-ink')}
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex items-center justify-between text-caption text-ink-muted">
        <span className="flex items-center gap-1">
          Moins
          {([0, 1, 2, 3, 4] as const).map((level) => (
            <span key={level} aria-hidden="true" className={cx('size-[11px] rounded-[4px]', HEAT[level])} />
          ))}
          Record
        </span>
        <span className="flex items-center gap-[5px]">
          <span aria-hidden="true" className="grid size-[11px] place-items-center rounded-[4px] bg-heat-0">
            <span className="size-[3px] rounded-full bg-ink" />
          </span>
          Nutrition OK
        </span>
      </div>
    </div>
  )
}
