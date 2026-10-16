import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface SheetProps {
  title: string
  onClose: () => void
  /** Opération en cours : la feuille ne peut pas être fermée (fond, Échap). */
  busy?: boolean
  children: ReactNode
}

/**
 * Pile des feuilles ouvertes (la dernière est au-dessus). Seule la feuille du dessus reçoit Échap / Tab ;
 * les autres et `#root` sont `inert` tant qu'une feuille les recouvre.
 */
const stack: HTMLElement[] = []

function syncInert(): void {
  const root = document.getElementById('root')
  if (stack.length > 0) root?.setAttribute('inert', '')
  else root?.removeAttribute('inert')
  stack.forEach((el, i) => {
    if (i < stack.length - 1) el.setAttribute('inert', '')
    else el.removeAttribute('inert')
  })
}

/**
 * Feuille modale en bas d'écran. Se monte quand elle est affichée : `{open && <Sheet …>}`.
 * Empilable : une feuille ouverte depuis une autre passe au-dessus ; à sa fermeture, la précédente
 * reprend le focus et les touches.
 */
export function Sheet({ title, onClose, busy = false, children }: SheetProps) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = busy ? () => undefined : onClose
  })

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    // Le contenu sous la feuille ne reçoit ni focus ni défilement (iOS laisse sinon défiler <main>).
    const self = overlay.current
    if (self) stack.push(self)
    syncInert()
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (self !== stack[stack.length - 1]) return
      if (e.key === 'Escape') {
        closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel.current) return
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) {
        e.preventDefault()
        return
      }
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === panel.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      const i = self ? stack.indexOf(self) : -1
      if (i >= 0) stack.splice(i, 1)
      syncInert()
      previous?.focus?.()
    }
  }, [])

  return createPortal(
    <div
      ref={overlay}
      className="fixed inset-0 z-[60] flex items-end bg-black/70"
      onClick={() => closeRef.current()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="mx-auto max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-b-0 border-v1-line bg-v1-surface px-4 pt-3 text-zinc-100 outline-none"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-600" />
        <h2 id={titleId} className="mb-4 text-xl font-bold">
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body,
  )
}

interface ConfirmSheetProps {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  danger?: boolean
}

export function ConfirmSheet({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  danger = true,
}: ConfirmSheetProps) {
  return (
    <Sheet title={title} onClose={onCancel} busy={busy}>
      <p className="mb-5 text-base text-zinc-300">{message}</p>
      <div className="flex flex-col gap-2">
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Annuler
        </Button>
      </div>
    </Sheet>
  )
}
