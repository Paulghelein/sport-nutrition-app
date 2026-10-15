// Pseudo-aléatoire déterministe (SPEC §3.2 : même entrée → même séance). Jamais de Math.random ici.

/** Hachage FNV-1a 32 bits d'une chaîne. */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Générateur mulberry32 : renvoie une fonction qui produit des nombres dans [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Tirage dans [0, 1) propre à une clé (ex. `date|exerciseId`) : indépendant de l'ordre des appels,
 * donc de l'ordre de la bibliothèque.
 */
export function seededUnit(key: string): number {
  return mulberry32(hashString(key))()
}
