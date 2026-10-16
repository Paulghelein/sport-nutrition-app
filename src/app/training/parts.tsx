import type { ReactNode, SVGProps } from 'react'
import { Link } from 'react-router-dom'
import type { ExercisePreference, TrainingLevel } from '../../types'
import { levelLabel, preferenceLabel } from '../../ui'

export const LIBRARY_PATH = '/entrainement/exercices'

/** Bouton retour en haut des écrans enfants (cible 44 px). */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-base font-medium text-orange-400 no-underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 5l-7 7 7 7" />
      </svg>
      {children}
    </Link>
  )
}

const levelStyle: Record<TrainingLevel, string> = {
  1: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  2: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  3: 'border-rose-400/40 bg-rose-400/10 text-rose-300',
}

export function LevelBadge({ level }: { level: TrainingLevel }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${levelStyle[level]}`}
    >
      {levelLabel(level)}
    </span>
  )
}

const icon: SVGProps<SVGSVGElement> = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

/** Icône de préférence ; rien pour « neutre ». */
export function PreferenceIcon({ preference }: { preference: ExercisePreference }) {
  if (preference === 'neutral') return null
  const label = preferenceLabel(preference)
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={preference === 'liked' ? 'text-orange-400' : 'text-zinc-400'}
    >
      {preference === 'liked' ? (
        <svg {...icon} fill="currentColor">
          <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
        </svg>
      ) : preference === 'disliked' ? (
        <svg {...icon}>
          <path d="M10 14V4M10 14l-5-1V6l5-2h7l2 6v3h-6l1 5-3 1-3-5z" transform="rotate(180 12 12)" />
        </svg>
      ) : (
        <svg {...icon}>
          <path d="M3 3l18 18M10.6 6.1A9 9 0 0 1 12 6c5 0 8.5 4.5 9.5 6a14 14 0 0 1-3 3.4M6.6 7.6A14 14 0 0 0 2.5 12C3.5 13.5 7 18 12 18c1.3 0 2.5-.3 3.5-.8M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </svg>
      )}
    </span>
  )
}

export function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 text-base text-amber-200">
      <svg {...icon} className="mt-0.5 shrink-0" aria-hidden="true">
        <path d="M12 4l9 16H3zM12 10v4M12 17h.01" />
      </svg>
      <span>{children}</span>
    </p>
  )
}

export function NotFound({ message }: { message: string }) {
  return (
    <section>
      <BackLink to={LIBRARY_PATH}>Bibliothèque</BackLink>
      <h1 className="mt-2 text-2xl font-bold">Exercice introuvable</h1>
      <p className="mt-2 text-base text-zinc-300">{message}</p>
      <Link
        to={LIBRARY_PATH}
        className="mt-5 flex min-h-12 items-center justify-center rounded-xl bg-orange-400 px-4 text-base font-semibold text-zinc-950 no-underline"
      >
        Retour à la bibliothèque
      </Link>
    </section>
  )
}

/** Entrée « Bibliothèque d'exercices » de l'écran Séance. */
export function EntryCard({ count }: { count: number | null }) {
  return (
    <Link
      to={LIBRARY_PATH}
      className="flex min-h-20 items-center gap-4 rounded-2xl border border-orange-400/40 bg-orange-400/10 p-4 no-underline active:bg-orange-400/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400"
    >
      <span className="flex flex-1 flex-col">
        <span className="text-xl font-bold text-zinc-100">Bibliothèque d’exercices</span>
        <span className="text-base text-zinc-300">
          {count === null
            ? 'Fiches, variantes, préférences'
            : `${count} exercice${count > 1 ? 's' : ''} · fiches et préférences`}
        </span>
      </span>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0 text-orange-400"
        aria-hidden="true"
      >
        <path d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}
