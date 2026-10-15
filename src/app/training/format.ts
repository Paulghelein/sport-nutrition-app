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

/** Compte à rebours : « 1:05 ». */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** « 8 à 12 » ou « 10 ». */
export function formatRange(r: Range): string {
  return r[0] === r[1] ? String(r[0]) : `${r[0]} à ${r[1]}`
}

/** Tempo `'3-1-1'` en phrase : « 3 s à la descente, 1 s de pause, 1 s à la montée ». */
export function tempoText(tempo: string): string {
  const [down, pause, up] = tempo.split('-')
  if (down === undefined || pause === undefined || up === undefined) return `Tempo ${tempo}`
  return `Tempo ${tempo} : ${down} s à la descente, ${pause} s de pause, ${up} s à la montée`
}

/** Charge en kg sans « ,0 » inutile : « 12 », « 12,5 ». */
export function kgText(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toLocaleString('fr-FR', { maximumFractionDigits: 2 })
}
