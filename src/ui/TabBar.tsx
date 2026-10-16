import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

const iconProps = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

const tabs: { to: string; label: string; icon: ReactNode }[] = [
  {
    to: '/seance',
    label: 'Séance',
    icon: (
      <svg {...iconProps}>
        <path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11" />
      </svg>
    ),
  },
  {
    to: '/nutrition',
    label: 'Nutrition',
    icon: (
      <svg {...iconProps}>
        <path d="M12 7c-2-2-6-1-6 4 0 4 3 9 6 9s6-5 6-9c0-5-4-6-6-4zM12 7c0-2 1-3 3-4" />
      </svg>
    ),
  },
  {
    to: '/progres',
    label: 'Progrès',
    icon: (
      <svg {...iconProps}>
        <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />
      </svg>
    ),
  },
  {
    to: '/reglages',
    label: 'Réglages',
    icon: (
      <svg {...iconProps}>
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
        <circle cx="16" cy="7" r="2" />
        <circle cx="8" cy="17" r="2" />
      </svg>
    ),
  },
]

/** Barre d'onglets dans le flux (dernier enfant de la colonne plein écran), jamais `fixed` : même hauteur partout. */
export function TabBar() {
  return (
    <nav
      aria-label="Navigation principale"
      className="z-50 shrink-0 border-t border-white/10 bg-v1-bg"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <ul className="m-0 flex list-none p-0">
        {tabs.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavLink
              to={tab.to}
              className={({ isActive }) =>
                `flex min-h-[56px] min-w-[44px] flex-col items-center justify-center gap-1 text-xs font-medium no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-400 ${
                  isActive ? 'text-orange-400' : 'text-zinc-400'
                }`
              }
            >
              {tab.icon}
              <span>{tab.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
