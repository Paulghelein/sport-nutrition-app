import type { MuscleGroup, MuscleView, MuscleZone } from '../../types'

/**
 * Zones de la silhouette qui représentent chaque groupe musculaire, par vue (fonctions pures).
 * - `calves` : visible des deux côtés. `glutes` : fessiers en vue de dos ; en vue de face, la zone « hips » (bande
 *   de la hanche, entre abdos et quadriceps) est allumée : la maquette l'allume déjà pour un travail du bas du corps,
 *   et cela permet à un squat (quadriceps + fessiers) de se lire de face.
 * - `shoulders` : deltoïdes visibles de face seulement (en vue de dos ils restent dans le contour neutre).
 */
const ZONES: Record<MuscleView, Partial<Record<MuscleGroup, readonly MuscleZone[]>>> = {
  front: {
    chest: ['chest'],
    shoulders: ['delts'],
    biceps: ['arms'],
    forearms: ['fore'],
    abs: ['abs'],
    glutes: ['hips'],
    quads: ['quads'],
    calves: ['calves'],
  },
  back: {
    traps: ['traps'],
    back: ['lats'],
    lower_back: ['lowerBack'],
    glutes: ['glutes'],
    hamstrings: ['hamstrings'],
    triceps: ['triceps'],
    calves: ['calves'],
  },
}

/** Zones à allumer pour ces muscles dans cette vue (sans doublon). */
export function zonesFor(view: MuscleView, muscles: readonly MuscleGroup[]): MuscleZone[] {
  const out = new Set<MuscleZone>()
  for (const m of muscles) for (const z of ZONES[view][m] ?? []) out.add(z)
  return [...out]
}

/** Vrai si le muscle a une zone dans cette vue. */
export function isVisibleIn(view: MuscleView, muscle: MuscleGroup): boolean {
  return (ZONES[view][muscle]?.length ?? 0) > 0
}

/**
 * Vue qui montre le plus de muscles primaires. Égalité : vue du premier muscle primaire (l'ordre des données est
 * significatif : le premier est le principal) ; aucun muscle : face.
 */
export function chooseMuscleView(primary: readonly MuscleGroup[]): MuscleView {
  const front = primary.filter((m) => isVisibleIn('front', m)).length
  const back = primary.filter((m) => isVisibleIn('back', m)).length
  if (back !== front) return back > front ? 'back' : 'front'
  const first = primary[0]
  return first !== undefined && !isVisibleIn('front', first) ? 'back' : 'front'
}
