import type { ButtonHTMLAttributes } from 'react'
import { buttonBase, variants, widths } from './buttonStyles'
import type { Variant, Width } from './buttonStyles'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  /** `full` (défaut) : toute la largeur ; `auto` : largeur du contenu. */
  width?: Width
}

export function Button({
  variant = 'primary',
  width = 'full',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${buttonBase} ${widths[width]} ${variants[variant]} ${className}`}
      {...props}
    />
  )
}
