import { ValidationError } from '../db'

/** Lit un nombre positif saisi par l'utilisateur ; accepte la virgule (« 72,5 »). Tout autre format (vide, « 1e3 », « 0x10 », signe…) → NaN. */
export function parseDecimal(input: string): number {
  const text = input.trim()
  if (!/^\d+([.,]\d+)?$/.test(text)) return Number.NaN
  return Number(text.replace(',', '.'))
}

/** Nombre → texte de saisie français (« 72,5 »). */
export function toInputNumber(value: number): string {
  return String(value).replace('.', ',')
}

const oneDecimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const signedOneDecimal = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
})

/** « 72,5 » (arrondi à 0,1). */
export function formatKg(value: number): string {
  return oneDecimal.format(value)
}

/** « +0,3 » / « −0,3 » / « 0,0 ». */
export function formatSignedKg(value: number): string {
  return signedOneDecimal.format(value)
}

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' })

/** Instant ISO → « 15 octobre 2026 à 14:32 ». */
export function formatDateTimeFr(iso: string): string {
  return dateTime.format(new Date(iso))
}

/** Message affichable pour une erreur : les `ValidationError` sont déjà en français. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ValidationError ? error.message : fallback
}
