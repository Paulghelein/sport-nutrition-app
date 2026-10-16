// Visuels de la v2 (DESIGN.md §6) : carte musculaire et pictogrammes d'aliments.

/**
 * Catégorie d'un aliment générique, qui choisit son pictogramme. Déduite du groupe Ciqual (R3) ; `dish` sert aussi
 * aux recettes.
 */
export type FoodCategory =
  | 'meat'
  | 'fish'
  | 'egg'
  | 'dairy'
  | 'cheese'
  | 'starch'
  | 'bread'
  | 'vegetable'
  | 'fruit'
  | 'fat'
  | 'drink'
  | 'dish'
  | 'sweet'

/** Vue de la silhouette de la carte musculaire. */
export type MuscleView = 'front' | 'back'

/**
 * Zones nommées de la silhouette (SVG 40×56). Face : delts, chest, abs, arms (biceps), fore (avant-bras), hips,
 * quads, calves. Dos : traps, lats (dos), lowerBack, glutes, hamstrings, triceps, calves. `MuscleGroup` → zones :
 * voir `src/ui/kit/muscleZones.ts`.
 */
export type MuscleZone =
  | 'delts'
  | 'chest'
  | 'abs'
  | 'arms'
  | 'fore'
  | 'hips'
  | 'quads'
  | 'calves'
  | 'traps'
  | 'lats'
  | 'lowerBack'
  | 'glutes'
  | 'hamstrings'
  | 'triceps'
