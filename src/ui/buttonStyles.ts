export type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

export type Width = 'full' | 'auto'

export const widths: Record<Width, string> = { full: 'w-full', auto: 'w-auto' }

export const variants: Record<Variant, string> = {
  primary: 'bg-orange-400 text-zinc-950 active:bg-orange-300 disabled:bg-zinc-700 disabled:text-zinc-400',
  secondary: 'bg-surface-hi text-zinc-100 border border-line active:bg-zinc-700 disabled:text-zinc-500',
  danger: 'bg-red-500/15 text-red-300 border border-red-400/40 active:bg-red-500/30 disabled:opacity-50',
  ghost: 'text-orange-400 active:bg-white/5 disabled:text-zinc-500',
}

export const buttonBase =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-base font-semibold no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400'

/** Classes d'un lien habillé en bouton (`<Link className={linkButtonClass('secondary')}>`). */
export const linkButtonClass = (variant: Variant = 'primary', width: Width = 'full'): string =>
  `${buttonBase} ${widths[width]} ${variants[variant]}`
