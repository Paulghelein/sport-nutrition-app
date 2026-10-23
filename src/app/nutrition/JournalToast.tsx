import { useEffect, useState } from 'react'

export interface ToastState {
  message: string
  /** Annule l'action (bouton « Annuler »). */
  undo?: () => Promise<void> | void
}

/**
 * Message de confirmation v2 (fond inverse) avec « Annuler » facultatif ; l'échec de l'annulation est affiché.
 * Disparaît seul après 7 s (10 s après un échec). À placer dans une zone collante en bas de l'écran.
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
          className={`mb-2 flex items-center justify-between gap-3 rounded-md py-1 pl-4 pr-2 font-sans text-body shadow-float ${failed ? 'bg-critical text-on-inverse' : 'bg-inverse text-on-inverse'}`}
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
              className="focus-ring min-h-11 shrink-0 rounded-full px-4 text-body-strong text-ember-soft active:opacity-70"
            >
              {failed ? 'Réessayer' : 'Annuler'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
