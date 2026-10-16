import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

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
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {children}
    </Link>
  )
}

export interface ToastState {
  message: string
  /** Annule l'action (bouton « Annuler »). */
  undo?: () => Promise<void> | void
}

/**
 * Zone collante en bas de la zone qui défile (jamais `fixed`). `sticky` se mesure depuis le bord du CONTENU de <main>
 * (remplissage exclu) : le remplissage du bas réserve déjà la place de la barre, donc pas de décalage de barre ici.
 * Empile le message au-dessus du bouton d'action.
 */
export function StickyStack({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-2 z-10 mt-4 flex flex-col">{children}</div>
}

/**
 * Message de confirmation avec « Annuler » facultatif (annulation en erreur : message affiché).
 * Disparaît seul après 7 s. À placer dans un `StickyStack`.
 */
export function Toast({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
  const [failedFor, setFailedFor] = useState<ToastState | null>(null)
  const failed = toast !== null && failedFor === toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDismiss, failed ? 10000 : 7000)
    return () => clearTimeout(t)
  }, [toast, onDismiss, failed])

  return (
    <div role="status" aria-live="polite">
      {toast ? (
        <div
          className={`mb-2 flex items-center justify-between gap-3 rounded-2xl border py-1.5 pl-4 pr-2 text-base shadow-lg ${failed ? 'border-red-400/40 bg-red-950 text-red-100' : 'border-emerald-400/40 bg-emerald-950 text-emerald-100'}`}
        >
          <span className="min-w-0 py-2">{failed ? 'Annulation impossible. Réessaie.' : toast.message}</span>
          {toast.undo ? (
            <button
              type="button"
              onClick={() => {
                const undo = toast.undo
                void (async () => {
                  try {
                    await undo?.()
                    onDismiss()
                  } catch {
                    setFailedFor(toast)
                  }
                })()
              }}
              className="min-h-11 shrink-0 rounded-xl px-3 font-semibold text-orange-300 active:bg-white/10"
            >
              {failed ? 'Réessayer' : 'Annuler'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
