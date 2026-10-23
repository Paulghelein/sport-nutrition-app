import { X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface SheetProps {
  title: string
  /** Ligne sous le titre (ex. « au déjeuner · modifiable »). */
  description?: ReactNode
  onClose: () => void
  /** Opération en cours : la feuille ne peut pas être fermée (fond, Échap, croix). */
  busy?: boolean
  children: ReactNode
}

/** Pile des feuilles ouvertes (la dernière est au-dessus) : seule celle du dessus reçoit Échap / Tab. */
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
 * Feuille du bas v2 (surface-raised, rayon 32, ombre `float`). Se monte quand elle est affichée :
 * `{open && <Sheet …>}`. Modale : focus piégé, Échap, `#root` rendu `inert`, focus rendu à la fermeture.
 */
export function Sheet({ title, description, onClose, busy = false, children }: SheetProps) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)

  useEffect(() => {
    closeRef.current = busy ? () => undefined : onClose
  })

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
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
      className="ds-fade-enter fixed inset-0 z-[60] flex items-end bg-inverse/36 font-sans"
      onClick={() => closeRef.current()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="ds-sheet-enter mx-auto flex max-h-[92dvh] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-t-xl bg-surface-raised px-4 pt-3 text-ink shadow-float outline-none"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
      >
        <span
          aria-hidden="true"
          className="h-[5px] w-9 shrink-0 self-center rounded-full bg-surface-sunken"
        />
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id={titleId} className="font-display text-title">
              {title}
            </h2>
            {description !== undefined && <div className="text-caption text-ink-muted">{description}</div>}
          </div>
          <button
            type="button"
            aria-label="Fermer"
            disabled={busy}
            onClick={() => closeRef.current()}
            className="focus-ring grid size-11 shrink-0 place-items-center rounded-full bg-canvas text-ink disabled:text-ink-muted"
          >
            <X size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}
