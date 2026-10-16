import { useId } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BackLink } from '../nutrition/parts'
import { fmtPortions } from './format'

export const RECIPES_PATH = '/nutrition/recettes'

export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400'

/** Interrupteur (cible 48 px), même habillage que la bibliothèque d'exercices. */
export function Switch({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-v1-line bg-v1-surface-hi px-3 py-2 text-left ${focusRing}`}
    >
      <span className="flex flex-col">
        <span className="text-base font-medium">{label}</span>
        {hint ? <span className="text-sm text-zinc-400">{hint}</span> : null}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-orange-400' : 'bg-zinc-600'}`}
      >
        <span
          className={`absolute top-0.5 size-6 rounded-full bg-white transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`}
        />
      </span>
    </button>
  )
}

const stepButton = `flex size-14 shrink-0 items-center justify-center rounded-xl border border-v1-line bg-v1-surface-hi text-3xl font-semibold active:bg-zinc-700 disabled:text-zinc-600 ${focusRing}`

const round2 = (n: number): number => Math.round(n * 100) / 100

/** Choix d'un nombre de portions avec − / + (cibles de 56 px), pas configurable (0,5 ou 1). */
export function PortionsStepper({
  legend,
  value,
  min,
  max,
  step,
  onChange,
  disabled = false,
}: {
  legend: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id}>
      <p id={id} className="mb-1.5 text-sm font-medium text-zinc-300">
        {legend}
      </p>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className={stepButton}
          disabled={disabled || value <= min}
          onClick={() => onChange(Math.max(min, round2(value - step)))}
          aria-label={`Diminuer : ${legend}`}
        >
          −
        </button>
        <output
          aria-live="polite"
          aria-label={`${legend} : ${fmtPortions(value)}`}
          className="min-w-16 text-center text-4xl font-bold tabular-nums"
        >
          {fmtPortions(value)}
        </output>
        <button
          type="button"
          className={stepButton}
          disabled={disabled || value >= max}
          onClick={() => onChange(Math.min(max, round2(value + step)))}
          aria-label={`Augmenter : ${legend}`}
        >
          +
        </button>
      </div>
    </div>
  )
}

/** Pastille de choix multiple ou de filtre (case à cocher habillée, cible 44 px). */
export function ToggleChip({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-base font-medium has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-orange-400 ${
        checked
          ? 'border-orange-400 bg-orange-400/15 text-orange-300'
          : 'border-v1-line bg-v1-surface-hi text-zinc-200'
      }`}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'warn' | 'danger'
}) {
  const style =
    tone === 'warn'
      ? 'border-amber-400/40 text-amber-300'
      : tone === 'danger'
        ? 'border-red-400/40 text-red-300'
        : 'border-v1-line text-zinc-300'
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {children}
    </span>
  )
}

export function Star({ on, className = '' }: { on: boolean; className?: string }) {
  return (
    <span aria-hidden="true" className={`${on ? 'text-orange-400' : 'text-zinc-500'} ${className}`}>
      {on ? '★' : '☆'}
    </span>
  )
}

export function Chevron() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-zinc-500"
      aria-hidden="true"
    >
      <path d="M9 5l7 7-7 7" />
    </svg>
  )
}

export function Loading() {
  return (
    <p className="mt-6 text-base text-zinc-400" aria-busy="true">
      Chargement…
    </p>
  )
}

export function NotFound({ message }: { message: string }) {
  return (
    <section>
      <BackLink to={RECIPES_PATH}>Recettes</BackLink>
      <h1 className="mt-2 text-2xl font-bold">Recette introuvable</h1>
      <p className="mt-2 text-base text-zinc-300">{message}</p>
      <Link
        to={RECIPES_PATH}
        className="mt-4 inline-flex min-h-12 items-center text-base font-semibold text-orange-400"
      >
        Voir toutes les recettes
      </Link>
    </section>
  )
}

export interface NoticeState {
  message: string
  to?: string
  linkLabel?: string
}

/** Message de confirmation (role=status), avec lien facultatif. */
export function Notice({ notice }: { notice: NoticeState | null }) {
  return (
    <div role="status" aria-live="polite">
      {notice ? (
        <p className="flex flex-wrap items-center justify-between gap-x-3 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2.5 text-base text-emerald-100">
          <span>{notice.message}</span>
          {notice.to ? (
            <Link to={notice.to} className="flex min-h-11 items-center font-semibold text-orange-300">
              {notice.linkLabel ?? 'Voir'}
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}

export const iconButtonClass = `flex size-11 shrink-0 items-center justify-center rounded-xl border border-v1-line bg-v1-surface-hi text-zinc-300 active:bg-zinc-700 disabled:text-zinc-600 ${focusRing}`

export const searchInputClass = `min-h-12 w-full rounded-xl border border-v1-line bg-v1-surface-hi pl-10 pr-11 text-base text-zinc-100 [color-scheme:dark] placeholder:text-zinc-500 ${focusRing}`

export function SearchIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  )
}

/** Bandeau quand la base d'aliments n'a pas pu être chargée : les macros affichées sont incomplètes. */
export function CiqualBanner({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  if (!failed) return null
  return (
    <div
      role="alert"
      className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200"
    >
      <span>Base d’aliments non chargée : les macros sont incomplètes.</span>
      <button
        type="button"
        onClick={onRetry}
        className={`min-h-11 shrink-0 rounded-lg px-3 text-base font-semibold text-orange-300 active:bg-white/10 ${focusRing}`}
      >
        Réessayer
      </button>
    </div>
  )
}
