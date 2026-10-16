import { ChevronLeft, ChevronRight, EyeOff, Heart, ThumbsDown, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ExercisePreference, TrainingLevel } from '../../types'
import { levelLabel, preferenceLabel } from '../../ui'
import { Card, buttonClass, cx } from '../../ui/kit'
import { LIBRARY_PATH } from '../routes'

/** Bouton retour en haut des écrans enfants : pastille claire avec chevron et libellé (cible 44 px). */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="focus-ring inline-flex min-h-11 items-center gap-1 self-start rounded-ds-pill bg-surface py-2 pl-2.5 pr-4 text-body-strong text-ink no-underline shadow-card active:opacity-70"
    >
      <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
      {children}
    </Link>
  )
}

/** Titre d'écran (un par écran) : display-l. */
export function ScreenTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cx('m-0 font-display text-display-l', className)}>{children}</h1>
}

/** Section d'écran : titre de carte (title) et action facultative à droite. */
export function Section({
  title,
  action,
  children,
  id,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  id?: string
}) {
  return (
    <section className="mt-7 flex flex-col gap-3" aria-labelledby={id}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="m-0 font-display text-title">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Niveau : un mot et une pastille (jamais la couleur seule). */
export function LevelBadge({ level }: { level: TrainingLevel }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-ds-pill bg-canvas px-2.5 py-0.5 text-caption font-semibold text-ink">
      {levelLabel(level)}
    </span>
  )
}

/** Étiquette neutre (« Masqué », « Perso », « Matériel manquant »). */
export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warning' }) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center rounded-ds-pill px-2.5 py-0.5 text-caption font-semibold',
        tone === 'warning' ? 'bg-ember-soft text-ink' : 'bg-canvas text-ink-muted',
      )}
    >
      {children}
    </span>
  )
}

/** Icône de préférence ; rien pour « neutre ». */
export function PreferenceIcon({ preference }: { preference: ExercisePreference }) {
  if (preference === 'neutral') return null
  const label = preferenceLabel(preference)
  const Icon = preference === 'liked' ? Heart : preference === 'disliked' ? ThumbsDown : EyeOff
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={preference === 'liked' ? 'text-ember-ink' : 'text-ink-muted'}
    >
      <Icon size={20} strokeWidth={1.75} fill={preference === 'liked' ? 'currentColor' : 'none'} />
    </span>
  )
}

export function Warning({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 flex gap-2.5 rounded-ds-md bg-ember-soft p-3 text-body text-ink">
      <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

export function NotFound({ message }: { message: string }) {
  return (
    <section className="flex flex-col gap-4">
      <BackLink to={LIBRARY_PATH}>Bibliothèque</BackLink>
      <ScreenTitle>Exercice introuvable</ScreenTitle>
      <p className="m-0 text-body text-ink-muted">{message}</p>
      <Link to={LIBRARY_PATH} className={buttonClass('primary', 'normal', true)}>
        Retour à la bibliothèque
      </Link>
    </section>
  )
}

/** Entrée « Bibliothèque d'exercices » de l'écran Entraînement. */
export function EntryCard({ count }: { count: number | null }) {
  return (
    <Link
      to={LIBRARY_PATH}
      className="focus-ring block no-underline"
      aria-label={`Bibliothèque d’exercices${count === null ? '' : `, ${count} exercice${count > 1 ? 's' : ''}`}`}
    >
      <Card className="flex min-h-[72px] items-center gap-4 active:opacity-80" padding="large">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-display text-title text-ink">Bibliothèque d’exercices</span>
          <span className="text-caption text-ink-muted">
            {count === null
              ? 'Fiches, variantes, préférences'
              : `${count} exercice${count > 1 ? 's' : ''} · fiches et préférences`}
          </span>
        </span>
        <ChevronRight size={22} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-ink-faint" />
      </Card>
    </Link>
  )
}
