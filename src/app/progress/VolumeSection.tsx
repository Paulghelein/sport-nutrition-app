import { muscleLabel } from '../../ui'
import { Card } from '../../ui/kit'
import { formatDecimal } from '../../ui/kit/format'
import type { GroupVolume } from '../../types'
import { Note, ScreenSection } from './parts'
import { VOLUME_STATUS_LABEL } from './progressModel'

const COLOR: Record<GroupVolume['status'], string> = {
  below: 'text-ember-ink',
  within: 'text-good',
  above: 'text-warning',
  untracked: 'text-ink-muted',
}

/** Séries des 7 derniers jours par groupe face à la cible : le mot d'état est toujours écrit, la couleur le renforce. */
export function VolumeSection({ volumes }: { volumes: readonly GroupVolume[] }) {
  const tracked = volumes.filter((v) => v.status !== 'untracked')
  const untracked = volumes.filter((v) => v.status === 'untracked' && v.sets > 0)
  return (
    <ScreenSection title="Volume des 7 derniers jours">
      <Card padding="none" className="px-4 py-1.5">
        <ul className="m-0 flex list-none flex-col p-0">
          {tracked.map((v) => (
            <li
              key={v.group}
              className="flex min-h-11 items-center justify-between gap-3 border-t border-line py-1.5 first:border-t-0"
            >
              <span className="text-body-strong">{muscleLabel(v.group)}</span>
              <span className="text-right text-caption tabular-nums text-ink-muted">
                <span className="font-display text-base font-bold text-ink">{formatDecimal(v.sets, 2)}</span>
                {` / ${v.target[0]}–${v.target[1]} séries · `}
                <span className={`font-bold ${COLOR[v.status]}`}>{VOLUME_STATUS_LABEL[v.status]}</span>
              </span>
            </li>
          ))}
        </ul>
        {untracked.length > 0 ? (
          <Note className="border-t border-line py-2.5 text-caption">
            {VOLUME_STATUS_LABEL.untracked} (pas de cible) :{' '}
            {untracked.map((v) => `${muscleLabel(v.group)} ${formatDecimal(v.sets, 2)}`).join(', ')}.
          </Note>
        ) : null}
      </Card>
    </ScreenSection>
  )
}
