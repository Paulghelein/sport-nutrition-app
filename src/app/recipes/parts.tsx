import { CheckCircle2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CardSkeleton, cx } from '../../ui/kit'
import { BackLink } from '../../ui/kit/BackLink'
import { buttonClass } from '../../ui/kit/buttonClass'
import { RECIPES_PATH } from '../routes'

// Éléments communs des écrans Recettes (liste, frigo, courses, fiche, cuisine, formulaire, import).

export { RECIPES_PATH }

export function Loading() {
  return <CardSkeleton lines={4} />
}

export function NotFound({ message }: { message: string }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <BackLink to={RECIPES_PATH}>Recettes</BackLink>
      </div>
      <h1 className="m-0 font-display text-display-l">Recette introuvable</h1>
      <p className="m-0 text-body text-ink-muted">{message}</p>
      <div>
        <Link to={RECIPES_PATH} className={buttonClass('secondary')}>
          Voir toutes les recettes
        </Link>
      </div>
    </section>
  )
}

export interface NoticeState {
  message: string
  to?: string
  linkLabel?: string
  /** Bouton « Annuler » (ex. retirer une portion loguée) ; proposé 7 s, l'échec est affiché dans le message. */
  undo?: () => Promise<void>
}

/** Durée pendant laquelle « Annuler » reste proposé (comme le toast du journal). */
const UNDO_MS = 7000

/**
 * Confirmation (zone `role=status` toujours présente, annoncée à l'apparition du message), lien et annulation
 * facultatifs. « Annuler » disparaît après 7 s (le message reste) et est désactivé pendant l'annulation.
 */
export function Notice({ notice }: { notice: NoticeState | null }) {
  const [failedFor, setFailedFor] = useState<NoticeState | null>(null)
  const [undoneFor, setUndoneFor] = useState<NoticeState | null>(null)
  const [expiredFor, setExpiredFor] = useState<NoticeState | null>(null)
  const [pending, setPending] = useState(false)
  const failed = notice !== null && failedFor === notice
  const undone = notice !== null && undoneFor === notice
  const canUndo = notice?.undo !== undefined && expiredFor !== notice && !undone
  useEffect(() => {
    if (!notice?.undo) return
    const t = setTimeout(() => setExpiredFor(notice), failed ? UNDO_MS * 1.5 : UNDO_MS)
    return () => clearTimeout(t)
  }, [notice, failed])
  const actionClass =
    'focus-ring flex min-h-11 items-center rounded-full px-3 text-body-strong text-ember-ink active:opacity-70 disabled:text-ink-muted'
  return (
    <div role="status" aria-live="polite">
      {notice ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3 rounded-md bg-surface py-1 pl-3.5 pr-1.5 shadow-card">
          <p className="m-0 flex min-w-0 items-center gap-2.5 py-2 text-body">
            <CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-good" />
            <span>{undone ? 'Annulé.' : failed ? 'Annulation impossible. Réessaie.' : notice.message}</span>
          </p>
          <span className="flex items-center">
            {canUndo ? (
              <button
                type="button"
                disabled={pending}
                className={actionClass}
                onClick={() => {
                  const undo = notice.undo
                  setPending(true)
                  void (async () => {
                    try {
                      await undo?.()
                      setUndoneFor(notice)
                    } catch {
                      setFailedFor(notice)
                    } finally {
                      setPending(false)
                    }
                  })()
                }}
              >
                {failed ? 'Réessayer' : 'Annuler'}
              </button>
            ) : null}
            {notice.to && !undone ? (
              <Link to={notice.to} className={cx(actionClass, 'no-underline')}>
                {notice.linkLabel ?? 'Voir'}
              </Link>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
  )
}

/** Bandeau quand la base d'aliments n'a pas pu être chargée : les macros affichées sont incomplètes. */
export function CiqualBanner({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  if (!failed) return null
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-md bg-surface py-1 pl-3.5 pr-1.5 text-body shadow-card"
    >
      <span className="py-2">Base d’aliments non chargée : les macros sont incomplètes.</span>
      <button
        type="button"
        onClick={onRetry}
        className="focus-ring min-h-11 shrink-0 rounded-full px-3 text-body-strong text-ember-ink active:opacity-70"
      >
        Réessayer
      </button>
    </div>
  )
}

/** Petite étiquette (Perso, Modifiée, tags). */
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-surface-sunken px-2.5 py-0.5 text-caption text-ink">
      {children}
    </span>
  )
}

/** Pastille de filtre (bouton à bascule, cible 44 px) : sélection = fond ember-soft, anneau ET graisse. */
export function FilterChip({
  label,
  pressed,
  onClick,
}: {
  label: string
  pressed: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cx(
        'focus-ring min-h-11 shrink-0 rounded-full px-4 text-body-strong',
        pressed ? 'bg-ember-soft font-bold text-ink ring-2 ring-ember' : 'bg-surface text-ink shadow-card',
      )}
    >
      {label}
    </button>
  )
}

/** Champ de recherche (loupe, bouton d'effacement 44 px). */
