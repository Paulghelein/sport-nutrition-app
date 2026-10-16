import { Card, Section, muscleLabel } from '../../ui'
import type { GroupVolume } from '../../types'
import { VOLUME_STATUS_LABEL, formatNumber } from './progressModel'

const COLOR: Record<GroupVolume['status'], string> = {
  below: 'text-orange-300',
  within: 'text-emerald-300',
  above: 'text-sky-300',
  untracked: 'text-zinc-400',
}

/** Séries des 7 derniers jours par groupe face à la cible, en liste colorée. */
export function VolumeSection({ volumes }: { volumes: readonly GroupVolume[] }) {
  const tracked = volumes.filter((v) => v.status !== 'untracked')
  const untracked = volumes.filter((v) => v.status === 'untracked' && v.sets > 0)
  return (
    <Section title="Volume des 7 derniers jours">
      <Card>
        <ul className="m-0 flex list-none flex-col p-0">
          {tracked.map((v) => (
            <li
              key={v.group}
              className="flex min-h-11 items-center justify-between gap-3 border-b border-line py-1 last:border-b-0"
            >
              <span className="text-base font-medium">{muscleLabel(v.group)}</span>
              <span className="text-right text-sm tabular-nums">
                <span className="text-base font-semibold text-zinc-100">{formatNumber(v.sets)}</span>
                <span className="text-zinc-400">
                  {' '}
                  / {v.target[0]}–{v.target[1]} séries ·{' '}
                </span>
                <span className={`font-semibold ${COLOR[v.status]}`}>{VOLUME_STATUS_LABEL[v.status]}</span>
              </span>
            </li>
          ))}
        </ul>
        {untracked.length > 0 ? (
          <p className="mt-3 text-sm text-zinc-400">
            {VOLUME_STATUS_LABEL.untracked} (pas de cible) :{' '}
            {untracked.map((v) => `${muscleLabel(v.group)} ${formatNumber(v.sets)}`).join(', ')}.
          </p>
        ) : null}
      </Card>
    </Section>
  )
}
