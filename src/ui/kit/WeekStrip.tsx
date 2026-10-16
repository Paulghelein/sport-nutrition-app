import { cx } from './cx'
import { narrowWeekday, weekDayLabel } from './weekDayLabel'
import type { WeekStripDay } from './weekDayLabel'

export type { WeekStripDay }

export interface WeekStripProps {
  /** Les 7 jours, lundi → dimanche. */
  days: readonly WeekStripDay[]
  className?: string
}

const HEAT: Record<WeekStripDay['level'], string> = {
  0: 'bg-heat-0',
  1: 'bg-heat-1',
  2: 'bg-heat-2',
  3: 'bg-heat-3',
  4: 'bg-heat-4',
}

/**
 * Semaine en cours en 7 cases (L M M J V S D) colorées par niveau `heat-0..4`, avec un point nutrition dessous :
 * plein = dans la cible, anneau = hors cible, absent = non évalué. La couleur n'est jamais seule porteuse de sens :
 * chaque jour a un libellé complet. Présentationnel, sans interaction.
 */
export function WeekStrip({ days, className }: WeekStripProps) {
  return (
    <ul
      aria-label="Semaine en cours"
      className={cx('m-0 grid list-none grid-cols-7 gap-2 p-0 text-center', className)}
    >
      {days.map((day) => (
        <li key={day.date} className="flex justify-center">
          <div
            role="img"
            aria-label={weekDayLabel(day)}
            data-testid="week-day"
            className="flex flex-col items-center gap-1.5"
          >
            <span
              aria-hidden="true"
              className={cx(
                'text-label uppercase',
                day.today ? 'font-extrabold text-ink' : 'font-bold text-ink-muted',
              )}
            >
              {narrowWeekday(day.date)}
            </span>
            <span
              aria-hidden="true"
              className={cx(
                'box-border size-8 rounded-ds-sm',
                day.future ? 'border border-line' : HEAT[day.level],
                day.today && 'ring-2 ring-ink ring-offset-2 ring-offset-canvas',
              )}
            />
            <span
              aria-hidden="true"
              className={cx(
                'box-border size-1.5 rounded-full',
                !day.future && day.nutritionOk === true && 'bg-good',
                !day.future && day.nutritionOk === false && 'border-2 border-warning',
              )}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
