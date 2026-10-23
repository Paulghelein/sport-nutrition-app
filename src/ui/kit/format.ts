const NBSP = '\u00a0'

const intFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

/** Entier avec séparateur de milliers (espace fine insécable) : `2 840`. */
export function formatInt(value: number): string {
  return intFormat.format(value)
}

const decimalFormats = new Map<number, Intl.NumberFormat>()

/** Nombre avec décimales à la virgule, sans zéros inutiles : `72,4` (1 décimale au plus par défaut). */
export function formatDecimal(value: number, maxDecimals = 1): string {
  let format = decimalFormats.get(maxDecimals)
  if (!format) {
    format = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: maxDecimals })
    decimalFormats.set(maxDecimals, format)
  }
  return format.format(value)
}

/** Valeur et unité séparées par une espace insécable : `16 kg`. */
export function withUnit(value: string | number, unit: string): string {
  return `${typeof value === 'number' ? formatDecimal(value) : value}${NBSP}${unit}`
}
