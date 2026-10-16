import { servingLabel } from '../../domain/nutrition/scan'
import { fmtG, fmtInt } from '../nutrition/format'

const portionsFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

/** Portions : « 1 », « 0,5 », « 2,5 ». */
export const fmtPortions = (n: number): string => portionsFmt.format(n)

/** « portion » ou « portions » selon la quantité (pluriel dès 2, « 0,5 portion »). */
export const portionsWord = (n: number): string => (n >= 2 ? 'portions' : 'portion')

/** « 25 min », « 1 h », « 1 h 15 ». */
export function fmtMinutes(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`
}

/** Grammes, ou kg à partir de 1 000 g (« 1,2 kg »). */
export function fmtGrams(g: number): string {
  return g >= 1000 ? `${fmtG(g / 1000)} kg` : `${fmtInt(g)} g`
}

/** Libellé de péremption ; `daysLeft` négatif = périmé. */
export function expiryLabel(daysLeft: number): string {
  if (daysLeft < 0) return `Périmé depuis ${-daysLeft} j`
  if (daysLeft === 0) return 'À consommer aujourd’hui'
  if (daysLeft === 1) return 'À consommer demain'
  return `À consommer sous ${daysLeft} jours`
}

/** Unité d'une portion : celle de la recette (`servingUnit`, « muffins ») ou « portion(s) ». */
export function portionUnit(n: number, unit: string | undefined): string {
  const u = unit?.trim()
  return u === undefined || u === '' || u.toLowerCase() === 'portions' ? portionsWord(n) : u
}

/** « 6 muffins », « 4 portions », « 1 portion », « 0,5 portion » (virgule française pour les demi-portions). */
export function portionsText(n: number, unit: string | undefined): string {
  return Number.isInteger(n) ? servingLabel(n, unit) : `${fmtPortions(n)} ${portionUnit(n, unit)}`
}
