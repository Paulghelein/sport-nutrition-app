import { ScanBarcode } from 'lucide-react'
import { useState } from 'react'
import { foodPictograms } from '../../content/visuals'
import type { FoodCategory } from '../../types'
import { cx } from './cx'

export interface FoodPictogramProps {
  category: FoodCategory
  /** Côté en px (24 par défaut). */
  size?: number
  /** Nom lu par les lecteurs d'écran ; sans lui le pictogramme est décoratif (`aria-hidden`). */
  label?: string
  className?: string
}

/** Pictogramme au trait d'une catégorie d'aliment : couleur héritée (`currentColor`), trait 1,75. */
export function FoodPictogram({ category, size = 24, label, className }: FoodPictogramProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={className}
    >
      {foodPictograms[category].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}

export interface FoodTileProps {
  category: FoodCategory
  /** Photo Open Food Facts (produit scanné) ; repli sur le pictogramme si absente ou en erreur. */
  photoUrl?: string
  /** Badge code-barres posé sur le visuel (produit scanné). */
  badge?: 'barcode'
  /** Portion venant du frigo : fond ember-soft. */
  fromFridge?: boolean
  /** Côté en px (40 par défaut). */
  size?: number
  className?: string
}

/** Visuel d'une ligne d'aliment : tuile rayon sm sur surface-sunken, photo ou pictogramme. */
export function FoodTile({
  category,
  photoUrl,
  badge,
  fromFridge = false,
  size = 40,
  className,
}: FoodTileProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showPhoto = photoUrl !== undefined && photoUrl !== failedUrl
  return (
    <div
      className={cx(
        'relative grid shrink-0 place-items-center rounded-sm text-ink-muted',
        fromFridge ? 'bg-ember-soft text-ink' : 'bg-surface-sunken',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {showPhoto ? (
        <img
          src={photoUrl}
          alt=""
          loading="lazy"
          onError={() => setFailedUrl(photoUrl)}
          className="size-full rounded-sm object-cover"
        />
      ) : (
        <FoodPictogram category={category} size={Math.round(size * 0.55)} />
      )}
      {badge === 'barcode' && (
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-1 grid size-[18px] place-items-center rounded-full bg-inverse text-on-inverse"
        >
          <ScanBarcode size={12} strokeWidth={1.75} />
        </span>
      )}
    </div>
  )
}
