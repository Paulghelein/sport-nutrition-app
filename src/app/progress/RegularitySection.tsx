import { formatDateFr } from '../../domain/shared/dates'
import { Card, Section } from '../../ui'
import type { Regularity } from '../../types'
import { formatNumber } from './progressModel'

/** Barres simples (divs), une par semaine, la plus récente à droite. */
export function RegularitySection({ regularity, target }: { regularity: Regularity; target: number }) {
  const max = Math.max(target, ...regularity.weeks.map((w) => w.sessions), 1)
  const total = regularity.weeks.reduce((a, w) => a + w.sessions, 0)
  const first = regularity.weeks[0]
  return (
    <Section title="Régularité (12 semaines)">
      <Card>
        {total === 0 ? (
          <p className="text-base text-zinc-300">
            Pas encore de séance. Lance ta première séance pour démarrer ta série.
          </p>
        ) : null}
        <div
          role="img"
          aria-label={`Séances par semaine : ${regularity.weeks.map((w) => w.sessions).join(', ')}`}
          className="mt-1 flex h-28 items-end gap-1"
        >
          {regularity.weeks.map((w) => (
            <div key={w.weekStart} className="flex h-full min-w-0 flex-1 flex-col justify-end text-center">
              <span className="text-xs tabular-nums text-zinc-300">{w.sessions}</span>
              <div
                className={`mt-0.5 w-full rounded-t ${w.sessions >= target ? 'bg-emerald-400' : 'bg-orange-400'}`}
                style={{ height: `${Math.max(w.sessions > 0 ? 4 : 1, (w.sessions / max) * 80)}%` }}
              />
            </div>
          ))}
        </div>
        {first ? (
          <p className="mt-1 flex justify-between text-xs text-zinc-400">
            <span>{formatDateFr(first.weekStart)}</span>
            <span>Cette semaine</span>
          </p>
        ) : null}
        <p className="mt-1 text-xs text-zinc-400">
          Vert : au moins {target} séance{target > 1 ? 's' : ''} dans la semaine.
        </p>
        <dl className="m-0 mt-4 grid grid-cols-3 gap-3">
          <div>
            <dt className="text-xs text-zinc-400">Série en cours</dt>
            <dd className="m-0 mt-1 text-2xl font-bold tabular-nums">{regularity.currentStreak} sem.</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">Meilleure série</dt>
            <dd className="m-0 mt-1 text-2xl font-bold tabular-nums">{regularity.bestStreak} sem.</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-400">Minutes</dt>
            <dd className="m-0 mt-1 text-2xl font-bold tabular-nums">
              {formatNumber(regularity.totalMinutes)}
            </dd>
          </div>
        </dl>
      </Card>
    </Section>
  )
}
