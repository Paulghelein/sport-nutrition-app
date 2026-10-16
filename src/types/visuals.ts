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

/**
 * Visuel d'une ligne d'aliment (FoodRow, R3) : pictogramme de repli, photo Open Food Facts éventuelle, badges.
 * Calculé par une fonction pure (`entryVisual`, src/domain/nutrition/category.ts) ; l'écran lit la photo par
 * `getFoodPhotos(photoFoodId)`.
 */
export interface FoodVisual {
  category: FoodCategory
  /** Aliment dont la photo OFF est à afficher s'il en a une (produit scanné). */
  photoFoodId?: string
  /** Produit scanné (aliment avec EAN) : badge code-barres. */
  scanned: boolean
  /** Portion venant du frigo : fond ember-soft. */
  fromFridge: boolean
}
