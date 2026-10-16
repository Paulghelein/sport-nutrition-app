import { cx } from './cx'

export type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'text'
/** `normal` : 48 px ; `session` : 64 px (mode séance, collé en bas, à portée de pouce). */
export type ButtonSize = 'normal' | 'session'

const variantClass: Record<ButtonVariant, string> = {
  // Le texte sur ember est toujours ink, jamais blanc.
  primary: 'bg-ember text-ink font-bold disabled:bg-surface-sunken disabled:text-ink-muted',
  secondary: 'bg-surface text-ink shadow-card disabled:text-ink-muted',
  dark: 'bg-inverse text-on-inverse disabled:bg-surface-sunken disabled:text-ink-muted',
  text: 'bg-transparent text-ember-ink disabled:text-ink-muted',
}

const sizeClass: Record<ButtonSize, string> = {
  normal: 'min-h-12 px-5 text-body-strong',
  session: 'min-h-16 px-6 text-headline',
}

/** Classes d'un bouton v2, utilisables aussi pour un lien : `<Link className={buttonClass('primary')}>`. */
export function buttonClass(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'normal',
  fullWidth = false,
): string {
  return cx(
    'focus-ring inline-flex items-center justify-center gap-2 rounded-ds-pill font-sans no-underline',
    'transition-opacity active:opacity-80 disabled:cursor-not-allowed disabled:shadow-none disabled:active:opacity-100',
    sizeClass[size],
    variantClass[variant],
    fullWidth && 'w-full',
  )
}
