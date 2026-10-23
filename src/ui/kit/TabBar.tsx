import { CalendarDays, ChartColumn, Apple, Dumbbell, Plus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cx } from './cx'

export type TabId = 'today' | 'training' | 'nutrition' | 'progress'

const TABS: { id: TabId; label: string; Icon: LucideIcon }[] = [
  { id: 'today', label: 'Aujourd’hui', Icon: CalendarDays },
  { id: 'training', label: 'Entraînement', Icon: Dumbbell },
  { id: 'nutrition', label: 'Nutrition', Icon: Apple },
  { id: 'progress', label: 'Progrès', Icon: ChartColumn },
]

export interface TabBarProps {
  /** Onglet affiché comme actif (`null` : aucun). */
  current: TabId | null
  /** Destination de chaque onglet (React Router). */
  hrefs: Record<TabId, string>
  /** Appui sur le bouton + (ouvre la feuille « Ajouter »). */
  onPlus: () => void
  /** Appelé au clic sur un onglet (utile pour suivre l'état dans une page de démonstration). */
  onSelect?: (id: TabId) => void
}

function Tab({
  id,
  label,
  Icon,
  href,
  active,
  onSelect,
}: {
  id: TabId
  label: string
  Icon: LucideIcon
  href: string
  active: boolean
  onSelect?: (id: TabId) => void
}) {
  return (
    <Link
      to={href}
      aria-current={active ? 'page' : undefined}
      onClick={() => onSelect?.(id)}
      className={cx(
        'focus-ring flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md font-sans no-underline',
        active ? 'text-ink' : 'text-ink-muted',
      )}
    >
      <Icon
        size={24}
        strokeWidth={1.75}
        aria-hidden="true"
        className={active ? 'text-ink' : 'text-ink-faint'}
      />
      <span className="text-tiny">{label}</span>
      <span aria-hidden="true" className={cx('size-1 rounded-full', active && 'bg-ember')} />
    </Link>
  )
}

/**
 * Barre d'onglets flottante : Aujourd'hui · Entraînement · [+] · Nutrition · Progrès.
 * Positionnée en `fixed` en bas de l'écran (safe area comprise) ; la page doit laisser ~112 px de marge en bas.
 */
export function TabBar({ current, hrefs, onPlus, onSelect }: TabBarProps) {
  const [today, training, nutrition, progress] = TABS
  const tab = (t: (typeof TABS)[number] | undefined) =>
    t && <Tab key={t.id} {...t} href={hrefs[t.id]} active={current === t.id} onSelect={onSelect} />
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 px-4"
      style={{
        bottom: 'max(1.5rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
      }}
    >
      <nav
        aria-label="Navigation principale"
        className="pointer-events-auto mx-auto grid h-[68px] max-w-xl grid-cols-[1fr_1fr_72px_1fr_1fr] items-center rounded-xl bg-surface-raised px-2 shadow-float"
      >
        {tab(today)}
        {tab(training)}
        <button
          type="button"
          aria-label="Ajouter"
          onClick={onPlus}
          className="focus-ring -mt-[30px] grid size-[60px] place-items-center justify-self-center rounded-full border-4 border-canvas bg-ember text-ink shadow-float active:opacity-80"
        >
          <Plus size={28} strokeWidth={2.25} aria-hidden="true" />
        </button>
        {tab(nutrition)}
        {tab(progress)}
      </nav>
    </div>
  )
}
