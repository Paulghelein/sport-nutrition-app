const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 })

/** Nombre à la française, 2 décimales au plus, sans zéros inutiles (`12,5`). */
export const formatNumber = (n: number): string => nf.format(n)
