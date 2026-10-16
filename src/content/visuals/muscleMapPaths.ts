// Tracés de la carte musculaire (DESIGN.md §6), viewBox 0 0 40 56. Données seules : aucune couleur.
// Chaque chaîne est un attribut `d`. `base` = contour neutre (tête, épaules, etc.), `zones` = parties ciblables.
// La face reprend les formes des maquettes ; le dos est dessiné dans le même style (rects arrondis, mêmes proportions,
// symétrie gauche/droite autour de x = 20). Les zones d'une même vue ne se chevauchent pas.
import type { MuscleView, MuscleZone } from '../../types/visuals'

export interface MuscleMapShape {
  /** Contour neutre, jamais coloré. */
  base: string[]
  /** Zones musculaires, une liste de tracés (gauche + droite) par zone. */
  zones: Partial<Record<MuscleZone, string[]>>
}

/** Rectangle à coins arrondis (rx = ry) en path. */
function rr(x: number, y: number, w: number, h: number, r: number): string {
  const x2 = x + w
  const y2 = y + h
  return (
    `M${x + r} ${y}H${x2 - r}A${r} ${r} 0 0 1 ${x2} ${y + r}V${y2 - r}A${r} ${r} 0 0 1 ${x2 - r} ${y2}` +
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${y2 - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  )
}

/** Ellipse en path. */
function el(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`
}

const head = el(20, 6, 4.2, 4.2)
const deltoids = [el(11.5, 14, 3, 2.6), el(28.5, 14, 3, 2.6)]
const upperArms = [rr(7.4, 16.6, 3.6, 8, 1.8), rr(29, 16.6, 3.6, 8, 1.8)]
const forearms = [rr(6, 25.6, 3.2, 7.6, 1.6), rr(30.8, 25.6, 3.2, 7.6, 1.6)]
const calves = [rr(14.6, 46.4, 4.2, 8, 2), rr(21.2, 46.4, 4.2, 8, 2)]

export const muscleMapPaths: Record<MuscleView, MuscleMapShape> = {
  front: {
    base: [head],
    zones: {
      delts: deltoids,
      chest: [rr(13, 12.4, 6.6, 6, 2.5), rr(20.4, 12.4, 6.6, 6, 2.5)],
      abs: [rr(15, 19.4, 10, 9.4, 2.5)],
      arms: upperArms,
      fore: forearms,
      hips: [rr(14.6, 29.6, 10.8, 4, 2)],
      quads: [rr(14, 34.4, 5.4, 11, 2.6), rr(20.6, 34.4, 5.4, 11, 2.6)],
      calves,
    },
  },
  back: {
    // Épaules arrière et avant-bras restent neutres : aucune zone ciblable correspondante en vue de dos.
    base: [head, ...deltoids, ...forearms],
    zones: {
      traps: [
        'M20 11.6C22.6 11.6 25.4 12.4 25.6 14.2L24.4 18.2Q20 19.2 15.6 18.2L14.4 14.2C14.6 12.4 17.4 11.6 20 11.6Z',
      ],
      lats: [rr(15, 19.4, 4.8, 6.2, 2.2), rr(20.2, 19.4, 4.8, 6.2, 2.2)],
      lowerBack: [rr(15, 26.2, 10, 2.6, 1.3)],
      glutes: [rr(14.6, 29.6, 5.2, 5.2, 2.6), rr(20.2, 29.6, 5.2, 5.2, 2.6)],
      hamstrings: [rr(14, 35.4, 5.4, 10, 2.6), rr(20.6, 35.4, 5.4, 10, 2.6)],
      triceps: upperArms,
      calves,
    },
  },
}
