import type { FoodCategory } from '../../types/visuals'
import { cx } from './cx'
import { FoodTile } from './FoodPictogram'
import { formatDecimal, formatInt } from './format'

export interface FoodRowProps {
  /** Nom de l'aliment (headline). */
  name: string
  /** Quantité : « 150 g », « 1,5 portion ». */
  quantity: string
  /** Macros de la ligne en grammes (déjà arrondies par l'appelant). */
  protein: number
  carbs: number
  fat: number
  kcal: number
  /** Catégorie : choisit le pictogramme quand il n'y a pas de photo. */
  category: FoodCategory
  /** Photo Open Food Facts (URL d'objet) d'un produit scanné. */
  photoUrl?: string
  /** Produit scanné : badge code-barres sur le visuel et mot « scanné ». */
  scanned?: boolean
  /** Portion venant du frigo : visuel sur ember-soft. */
  fromFridge?: boolean
  /** Si fourni, toute la ligne est un bouton (cible ≥ 48 px). */
  onPress?: () => void
  /** Nom accessible du bouton (par défaut : le texte de la ligne). */
  ariaLabel?: string
  className?: string
}

/**
 * Ligne d'aliment d'une carte de repas : visuel 40 px, nom, quantité + P/G/L, kcal à droite. À poser dans un
 * `<li>` qui porte le filet (`border-t border-line first:border-t-0`) : la ligne est le premier enfant de son `<li>`,
 * le filet ne peut donc pas venir d'elle.
 */
export function FoodRow({
  name,
  quantity,
  protein,
  carbs,
  fat,
  kcal,
  category,
  photoUrl,
  scanned = false,
  fromFridge = false,
  onPress,
  ariaLabel,
  className,
}: FoodRowProps) {
  const detail = [
    quantity,
    `P\u00a0${formatDecimal(protein)}`,
    `G\u00a0${formatDecimal(carbs)}`,
    `L\u00a0${formatDecimal(fat)}`,
    ...(scanned ? ['scanné'] : []),
  ].join(' · ')
  const body = (
    <>
      <FoodTile
        category={category}
        photoUrl={photoUrl}
        badge={scanned ? 'barcode' : undefined}
        fromFridge={fromFridge}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-px text-left">
        <span className="line-clamp-2 text-body-strong">{name}</span>
        <span className="text-caption text-ink-muted">{detail}</span>
      </span>
      <span className="shrink-0 font-display text-body-strong tabular-nums">{formatInt(kcal)}</span>
    </>
  )
  const base = 'flex min-h-12 w-full items-center gap-3 py-2'
  if (onPress) {
    return (
      <button
        type="button"
        onClick={onPress}
        aria-label={ariaLabel}
        className={cx(base, 'focus-ring text-left text-ink active:opacity-70', className)}
      >
        {body}
      </button>
    )
  }
  return <div className={cx(base, className)}>{body}</div>
}
