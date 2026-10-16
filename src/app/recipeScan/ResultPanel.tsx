import { ChevronRight, Minus, Plus } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { Macros } from '../../types'
import { Button } from '../../ui/kit'
import { Note } from '../../ui/kit/Note'
import { formatInt } from '../../ui/kit/format'

const stepClass =
  'focus-ring grid size-11 shrink-0 place-items-center rounded-full bg-surface-sunken text-ink active:opacity-70 disabled:text-ink-faint'

function MacroDot({ color, children }: { color: string; children: string }) {
  return (
    <span className="whitespace-nowrap">
      <span aria-hidden="true" className={`mr-1 inline-block size-2 rounded-full ${color}`} />
      {children}
    </span>
  )
}

/**
 * Feuille du bas, fixe : « Ça donne N [unité] » (−/+, touche = réglages), macros par portion, erreur éventuelle,
 * bouton de création. `onHeight` donne sa hauteur à l'écran pour réserver la place sous la liste.
 */
export function ResultPanel({
  servingsText,
  servings,
  maxServings,
  perServing,
  macrosNote,
  problem,
  createError,
  createLabel,
  creating,
  onStep,
  onEdit,
  onCreate,
  onHeight,
}: {
  servingsText: string
  servings: number
  maxServings: number
  /** `null` : rien à calculer (liste vide) ou base en préparation. */
  perServing: Macros | null
  macrosNote: string | null
  problem: string | null
  createError: string | null
  createLabel: string
  creating: boolean
  onStep: (delta: 1 | -1) => void
  onEdit: () => void
  onCreate: () => void
  onHeight: (px: number) => void
}) {
  const ref = useRef<HTMLElement>(null)
  const heightRef = useRef(onHeight)
  useEffect(() => {
    heightRef.current = onHeight
  })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const report = () => heightRef.current(el.offsetHeight)
    report()
    if (typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(report)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return (
    <section
      ref={ref}
      aria-label="Résultat"
      className="fixed inset-x-0 bottom-0 z-50 rounded-t-ds-xl bg-surface-raised text-ink shadow-float"
    >
      <div
        className="mx-auto flex max-w-xl flex-col gap-3 px-4 pt-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Ça donne ${servingsText}. Régler les portions et le frigo`}
            className="focus-ring -ml-1 flex min-h-11 min-w-0 flex-col items-start justify-center rounded-ds-md px-1 text-left"
          >
            <span className="text-caption font-semibold text-ink-muted">Ça donne</span>
            <span className="flex items-center gap-1 font-display text-title font-extrabold">
              <span className="truncate">{servingsText}</span>
              <ChevronRight
                size={18}
                strokeWidth={1.75}
                aria-hidden="true"
                className="shrink-0 text-ink-muted"
              />
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              className={stepClass}
              aria-label="Une portion de moins"
              disabled={servings <= 1}
              onClick={() => onStep(-1)}
            >
              <Minus size={22} strokeWidth={1.75} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={stepClass}
              aria-label="Une portion de plus"
              disabled={servings >= maxServings}
              onClick={() => onStep(1)}
            >
              <Plus size={22} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div
          aria-label="Macros par portion"
          className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-caption font-semibold text-ink-muted"
        >
          <span>Par portion</span>
          {perServing ? (
            <>
              <span className="font-display text-ink">{formatInt(perServing.kcal)} kcal</span>
              <MacroDot color="bg-protein">{`P ${formatInt(perServing.protein)} g`}</MacroDot>
              <MacroDot color="bg-carbs">{`G ${formatInt(perServing.carbs)} g`}</MacroDot>
              <MacroDot color="bg-fat">{`L ${formatInt(perServing.fat)} g`}</MacroDot>
            </>
          ) : (
            <span>{macrosNote ?? '—'}</span>
          )}
        </div>
        {perServing && macrosNote ? <p className="m-0 text-caption text-warning">{macrosNote}</p> : null}

        <div aria-live="polite">
          {problem ? <Note tone="error">{problem}</Note> : null}
          {createError ? <Note tone="error">{createError}</Note> : null}
        </div>

        <Button className="min-h-[52px]" fullWidth disabled={creating} onClick={onCreate}>
          {creating ? 'Création…' : createLabel}
        </Button>
      </div>
    </section>
  )
}
