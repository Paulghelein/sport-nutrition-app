import { cx } from './cx'
import { narrowWeekday, weekDayLabel } from './weekDayLabel'
import type { WeekStripDay } from './weekDayLabel'

export type { WeekStripDay }

export interface WeekStripProps {
  /** Les 7 jours, lundi → dimanche. */
  days: readonly WeekStripDay[]
  /** Si fourni, chaque jour est un bouton (cible ≥ 44 px) qui appelle `onSelectDay(date)` ; sinon la bande est décorative. */
  onSelectDay?: (date: string) => void
  /** Jour dont le résumé est ouvert : `aria-current="date"` sur son bouton. */
  selectedDate?: string | null
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
 * chaque jour a un libellé complet. Sans `onSelectDay`, présentationnelle ; avec, chaque jour est un bouton.
 */
export function WeekStrip({ days, onSelectDay, selectedDate = null, className }: WeekStripProps) {
  return (
    <ul
      aria-label="Semaine en cours"
      className={cx(
        'm-0 grid list-none grid-cols-7 p-0 text-center',
        // Interactif : colonnes jointives (≈ 46 px de large sur 390 px) pour tenir les 44 px tactiles ; l'écart
        // visuel entre les cases reste ≈ 15 px, comme avec `gap-2` autour de cases de 32 px.
        onSelectDay ? 'gap-0' : 'gap-2',
        className,
      )}
    >
      {days.map((day) => {
        const content = (
          <>
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
                'box-border size-8 rounded-sm',
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
          </>
        )
        return (
          <li key={day.date} className="flex justify-center">
            {onSelectDay ? (
              <button
                type="button"
                aria-label={weekDayLabel(day)}
                aria-current={day.date === selectedDate ? 'date' : undefined}
                data-testid="week-day"
                onClick={() => onSelectDay(day.date)}
                className="focus-ring flex min-h-14 w-full flex-col items-center justify-center gap-1.5 rounded-sm active:opacity-70"
              >
                {content}
              </button>
            ) : (
              <div
                role="img"
                aria-label={weekDayLabel(day)}
                data-testid="week-day"
                className="flex flex-col items-center gap-1.5"
              >
                {content}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
