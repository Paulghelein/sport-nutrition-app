import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { buttonClass } from './buttonClass'
import type { ButtonSize, ButtonVariant } from './buttonClass'
import { cx } from './cx'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Occupe toute la largeur disponible. */
  fullWidth?: boolean
  /** Icône avant le texte (composant lucide, 20 px). */
  icon?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'normal',
  fullWidth = false,
  icon,
  className,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={cx(buttonClass(variant, size, fullWidth), className)} {...props}>
      {icon}
      {children}
    </button>
  )
}
