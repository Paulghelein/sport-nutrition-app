// Utilitaires de dates calendaires locales (fonctions pures).
import type { LocalDate } from '../../types/common'

const pad = (n: number, w = 2): string => String(n).padStart(w, '0')

/** Date locale (composantes locales, jamais UTC). */
export function toLocalDate(date: Date): LocalDate {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const RE = /^(\d{4})-(\d{2})-(\d{2})$/

function parts(d: LocalDate): [number, number, number] | null {
  const m = RE.exec(d)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const da = Number(m[3])
  const t = new Date(Date.UTC(y, mo - 1, da))
  t.setUTCFullYear(y) // années < 100
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== da) return null
  return [y, mo, da]
}

export function isValidLocalDate(s: string): boolean {
  return parts(s) !== null
}

function toUtcMs(d: LocalDate): number {
  const p = parts(d)
  if (!p) throw new RangeError(`Date invalide : ${d}`)
  const t = new Date(Date.UTC(2000, p[1] - 1, p[2]))
  t.setUTCFullYear(p[0])
  return t.getTime()
}

function fromUtc(ms: number): LocalDate {
  const t = new Date(ms)
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

export function addDays(d: LocalDate, n: number): LocalDate {
  return fromUtc(toUtcMs(d) + n * 86_400_000)
}

/** b − a en jours. */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / 86_400_000)
}

/** Âge en années révolues. Un né le 29 février fête son anniversaire le 1er mars les années non bissextiles. */
export function ageOn(birthDate: LocalDate, on: LocalDate): number {
  const b = parts(birthDate)
  const o = parts(on)
  if (!b || !o) throw new RangeError(`Date invalide : ${birthDate} / ${on}`)
  let age = o[0] - b[0]
  if (o[1] < b[1] || (o[1] === b[1] && o[2] < b[2])) age -= 1
  return age
}

export function formatDateFr(d: LocalDate, style: 'short' | 'long' = 'short'): string {
  const t = new Date(toUtcMs(d))
  const opts: Intl.DateTimeFormatOptions =
    style === 'short'
      ? { day: 'numeric', month: 'short', timeZone: 'UTC' }
      : { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
  return new Intl.DateTimeFormat('fr-FR', opts).format(t)
}
