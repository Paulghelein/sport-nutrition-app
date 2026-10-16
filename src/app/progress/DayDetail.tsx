import { useMemo } from 'react'
import { daySummary } from '../../domain/progress/daySummary'
import type { DaySummaryInput } from '../../domain/progress/daySummary'
import { addDays } from '../../domain/shared/dates'
import type { LocalDate } from '../../types'
import { DaySummarySheet } from '../../ui/kit/DaySummarySheet'
import { dayView } from './calendarModel'

/**
 * Résumé du jour touché (calendrier de Progrès, bande de la semaine d'Aujourd'hui) : calcule le résumé depuis les
 * données déjà lues par l'écran et l'affiche dans la feuille du kit. À monter seulement quand un jour est choisi.
 * Boutons « jour précédent / suivant » : le précédent s'arrête à `minDate` (début de la plage affichée), le suivant à
 * aujourd'hui (on ne navigue pas dans le futur ; un jour à venir se touche depuis la grille).
 */
export function DayDetail({
  date,
  minDate,
  input,
  nameOf,
  onSelect,
  onClose,
}: {
  date: LocalDate
  /** Premier jour atteignable avec « jour précédent ». */
  minDate: LocalDate
  input: Omit<DaySummaryInput, 'date'>
  nameOf: (id: string) => string
  onSelect: (date: LocalDate) => void
  onClose: () => void
}) {
  const view = useMemo(
    () => dayView(daySummary({ ...input, date }), nameOf, input.today),
    [date, input, nameOf],
  )
  return (
    <DaySummarySheet
      day={view}
      onClose={onClose}
      onPrev={date > minDate ? () => onSelect(addDays(date, -1)) : undefined}
      onNext={date < input.today ? () => onSelect(addDays(date, 1)) : undefined}
    />
  )
}
