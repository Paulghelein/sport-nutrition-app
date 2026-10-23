import { muscleMapPaths } from '../../content/visuals'
import type { MuscleGroup, MuscleView, MuscleZone } from '../../types'
import { muscleLabel } from '../choices'
import { cx } from './cx'
import { chooseMuscleView, zonesFor } from './muscleZones'

export interface MuscleMapProps {
  /** Muscles primaires, allumés en ember. */
  primary: readonly MuscleGroup[]
  /** Vue imposée ; sinon celle qui montre le plus de muscles primaires. */
  view?: MuscleView
  /** Largeur en px (la hauteur suit : 40 × 56). */
  size?: number
  /** `dark` : sur fond inverse (le neutre devient on-inverse à 14 %). */
  tone?: 'light' | 'dark'
  /** Zones à allumer directement (démonstration) ; remplace `primary`. */
  zones?: readonly MuscleZone[]
  className?: string
}

/**
 * Silhouette musculaire générée depuis les données de l'exercice (jamais d'image par exercice).
 * Les muscles secondaires ne sont pas montrés : un seul niveau de mise en avant reste lisible à 40 px.
 */
export function MuscleMap({ primary, view, size = 40, tone = 'light', zones, className }: MuscleMapProps) {
  const v = view ?? chooseMuscleView(primary)
  const shape = muscleMapPaths[v]
  const lit = new Set(zones ?? zonesFor(v, primary))
  const neutral = tone === 'dark' ? 'fill-on-inverse/14' : 'fill-surface-sunken'
  const label =
    primary.length > 0
      ? `Muscles ciblés (${v === 'front' ? 'vue de face' : 'vue de dos'}) : ${primary.map(muscleLabel).join(', ')}`
      : 'Silhouette'
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 40 56"
      width={size}
      height={(size * 56) / 40}
      className={className}
    >
      {shape.base.map((d, i) => (
        <path key={`b${i}`} d={d} className={neutral} />
      ))}
      {(Object.entries(shape.zones) as [MuscleZone, string[]][]).map(([zone, paths]) =>
        paths.map((d, i) => (
          <path
            key={`${zone}${i}`}
            d={d}
            data-zone={zone}
            className={cx(lit.has(zone) ? 'fill-ember' : neutral)}
          />
        )),
      )}
    </svg>
  )
}

export interface ExerciseThumbProps {
  primary: readonly MuscleGroup[]
  view?: MuscleView
  /** Côté du carré en px (52 dans l'aperçu de séance, 48 sur Aujourd'hui, 96 en séance). */
  size?: number
  tone?: 'light' | 'dark'
  /** Fond en mode clair : `surface` (liste sur canvas) ou `canvas` (miniature posée sur une carte `surface`). */
  background?: 'surface' | 'canvas'
  className?: string
}

/** Miniature d'exercice : carré rayon sm, fond surface (ou on-inverse/6 en sombre), carte musculaire centrée. */
export function ExerciseThumb({
  primary,
  view,
  size = 52,
  tone = 'light',
  background = 'surface',
  className,
}: ExerciseThumbProps) {
  return (
    <div
      className={cx(
        'grid shrink-0 place-items-center rounded-sm',
        tone === 'dark' ? 'bg-on-inverse/6' : background === 'canvas' ? 'bg-canvas' : 'bg-surface',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <MuscleMap primary={primary} view={view} tone={tone} size={Math.round(size * 0.55)} />
    </div>
  )
}
