// Charges réglables de la kettlebell (SPEC §2) : toute charge proposée est min + k × pas, dans [min, max].
import type { Equipment, KettlebellSpec } from '../../types/profile'

const EPS = 1e-9

/** Arrondi à 0,01 kg pour éviter les erreurs de flottants (12 + 3 × 0,5…). */
const round2 = (x: number): number => Math.round(x * 100) / 100

/** Garde-fou : au plus 1000 charges (un pas minuscule ne doit pas bloquer l'app). */
const MAX_LOADS = 1000

/**
 * Toutes les charges réglables, croissantes.
 * Spécification incohérente (valeurs non finies, pas ≤ 0, max < min) → `[min]` si le min est un nombre fini
 * et positif, sinon `[]`. Jamais de boucle infinie.
 */
export function adjustableLoads(kb: KettlebellSpec): number[] {
  const minOk = Number.isFinite(kb.minKg) && kb.minKg >= 0
  if (!minOk) return []
  if (!Number.isFinite(kb.maxKg) || !Number.isFinite(kb.stepKg) || !(kb.stepKg > 0) || kb.maxKg < kb.minKg) {
    return [kb.minKg]
  }
  const out: number[] = []
  for (let k = 0; k < MAX_LOADS; k++) {
    const w = round2(kb.minKg + k * kb.stepKg)
    if (w > kb.maxKg + EPS) break
    out.push(w)
  }
  return out
}

/** Charge réglable la plus lourde ≤ `kg` (plancher au min). Prudent : on n'arrondit jamais vers le haut. */
export function snapLoadDown(kg: number, kb: KettlebellSpec): number {
  const loads = adjustableLoads(kb)
  let best = loads[0] ?? kb.minKg
  for (const w of loads) if (w <= kg + EPS) best = w
  return best
}

export function isAdjustable(kg: number, kb: KettlebellSpec): boolean {
  return adjustableLoads(kb).some((w) => Math.abs(w - kg) < EPS)
}

/** Charge réglable maximale. */
export function maxLoad(kb: KettlebellSpec): number {
  const loads = adjustableLoads(kb)
  return loads[loads.length - 1] ?? kb.minKg
}

/**
 * Hausse d'un palier (SPEC §3.3) : la plus lourde charge réglable ≤ `kg + stepKg`, au moins un pas de la
 * kettlebell au-dessus de `kg`. Si le pas de la kettlebell dépasse le palier, on monte d'un seul pas.
 * `null` si aucune charge réglable n'est au-dessus (max atteint).
 */
export function nextLoadUp(kg: number, stepKg: number, kb: KettlebellSpec): number | null {
  const above = adjustableLoads(kb).filter((w) => w > kg + EPS)
  if (above.length === 0) return null
  const within = above.filter((w) => w <= kg + stepKg + EPS)
  return within.length > 0 ? (within[within.length - 1] as number) : (above[0] as number)
}

/**
 * Baisse d'un palier : la plus légère charge réglable ≥ `kg − stepKg`, au moins un pas en dessous.
 * `null` si aucune charge réglable n'est en dessous (min atteint).
 */
export function nextLoadDown(kg: number, stepKg: number, kb: KettlebellSpec): number | null {
  const below = adjustableLoads(kb).filter((w) => w < kg - EPS)
  if (below.length === 0) return null
  const within = below.filter((w) => w >= kg - stepKg - EPS)
  return within.length > 0 ? (within[0] as number) : (below[below.length - 1] as number)
}

/**
 * Charge saisie plausible (garde-fou de l'interface contre une faute de frappe, ex. 160 au lieu de 16) :
 * nombre fini, > 0 et ≤ charge maximale de la kettlebell réglable. Pas de borne basse au min de la kettlebell
 * (une autre kettlebell plus légère reste possible). `recordSet` reste tolérant : c'est à l'UI de refuser.
 */
export function isPlausibleLoad(kg: number, equipment: Pick<Equipment, 'kettlebell'>): boolean {
  return Number.isFinite(kg) && kg > 0 && kg <= equipment.kettlebell.maxKg + EPS
}
