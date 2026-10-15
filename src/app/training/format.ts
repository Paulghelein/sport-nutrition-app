// Mise en forme (texte) des champs d'un exercice. Aucune règle métier.
import type { Exercise, Range } from '../../types'

export function formatSeconds(sec: number): string {
  if (sec < 60) return `${sec} s`
  const min = Math.floor(sec / 60)
  const rest = sec % 60
  return rest === 0 ? `${min} min` : `${min} min ${rest} s`
}

function range(r: Range, unit: (n: number) => string): string {
  return r[0] === r[1] ? unit(r[0]) : `${r[0]} à ${unit(r[1])}`
}

/** « 8 à 12 répétitions par côté » ou « 30 à 45 s ». */
export function formatTarget(ex: Exercise): string {
  const side = ex.unilateral ? ' par côté' : ''
  if (ex.durationRange) return `${range(ex.durationRange, (n) => `${n} s`)}${side}`
  if (ex.repRange) return `${range(ex.repRange, String)} répétitions${side}`
  return '—'
}
