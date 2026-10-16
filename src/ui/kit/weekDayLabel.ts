import type { DayTrainingLevel } from '../../types'

export interface WeekStripDay {
  /** Date locale `AAAA-MM-JJ`. */
  date: string
  /** Niveau d'entraînement du jour (0 = rien, 4 = record). */
  level: DayTrainingLevel
  /** Séances faites ce jour-là. */
  sessions: number
  /** Minutes cumulées de ces séances. */
  minutes: number
  /** `true` dans la cible, `false` hors cible, `null` rien à dire (rien de logué, objectif inconnu, jour futur). */
  nutritionOk: boolean | null
  /** Jour à venir : case vide. */
  future: boolean
  /** Jour courant : case cerclée. */
  today: boolean
}

/** Midi local : évite tout décalage de jour lié au fuseau ou à l'heure d'été. */
export function parseLocalNoon(date: string): Date {
  const [y = 1970, m = 1, d = 1] = date.split('-').map(Number)
  return new Date(y, m - 1, d, 12)
}

const longName = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' })
const narrowName = new Intl.DateTimeFormat('fr-FR', { weekday: 'narrow' })

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Détail d'un jour sans son nom : « séance de 32 min (record battu), nutrition dans la cible ». */
function dayDetail(day: WeekStripDay): string {
  const training =
    day.sessions <= 0
      ? 'pas de séance'
      : day.sessions === 1
        ? `séance de ${Math.round(day.minutes)} min`
        : `${day.sessions} séances, ${Math.round(day.minutes)} min`
  const record = day.level === 4 ? ' (record battu)' : ''
  const nutrition =
    day.nutritionOk === true
      ? 'nutrition dans la cible'
      : day.nutritionOk === false
        ? 'nutrition hors cible'
        : 'nutrition non évaluée'
  return `${training}${record}, ${nutrition}`
}

/** Libellé lu par les lecteurs d'écran : « Mercredi : séance de 32 min, nutrition dans la cible ». */
export function weekDayLabel(day: WeekStripDay): string {
  const name = capitalize(longName.format(parseLocalNoon(day.date)))
  const head = day.today ? `${name} (aujourd’hui)` : name
  if (day.future) return `${head} : à venir`
  return `${head} : ${dayDetail(day)}`
}

const longDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })

/** « Mercredi 14 octobre » (jour, date, mois) : titre du résumé d'un jour et libellé des cases du calendrier. */
export function longDateLabel(date: string): string {
  return capitalize(longDate.format(parseLocalNoon(date)))
}

/** Libellé d'une case du calendrier (date complète) : « Mercredi 14 octobre : séance de 32 min, nutrition dans la cible ». */
export function calendarDayLabel(day: WeekStripDay): string {
  const name = longDateLabel(day.date)
  const head = day.today ? `${name} (aujourd’hui)` : name
  if (day.future) return `${head} : à venir`
  return `${head} : ${dayDetail(day)}`
}

/** Initiale du jour (« L », « M »…). */
export function narrowWeekday(date: string): string {
  return narrowName.format(parseLocalNoon(date))
}
