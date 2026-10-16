import { Trophy } from 'lucide-react'
import { Card, ListRow } from '../../ui/kit'
import type { RecordRowModel } from './calendarModel'
import { Note, ScreenSection } from './parts'

/**
 * Records récents : les derniers records battus (6 semaines), du plus récent au plus ancien. Le premier est mis en
 * avant par la pastille `ember-ink` ; la nature du record et le jour sont écrits, rien ne repose sur la couleur.
 */
export function RecordsSection({ records }: { records: readonly RecordRowModel[] }) {
  return (
    <ScreenSection title="Records récents" hiddenTitle>
      <Card padding="none" className="px-4 py-1.5">
        {records.length === 0 ? (
          <Note className="py-3">
            Pas de record ces dernières semaines. Ils apparaissent quand tu bats une de tes performances
            passées.
          </Note>
        ) : (
          records.map((r, i) => (
            <ListRow
              key={r.key}
              leading={
                <span
                  aria-hidden="true"
                  className={`grid size-9 place-items-center rounded-ds-sm ${
                    i === 0 ? 'bg-ember-ink text-on-inverse' : 'bg-canvas text-ink'
                  }`}
                >
                  <Trophy size={20} strokeWidth={1.75} />
                </span>
              }
              title={r.name}
              subtitle={r.detail}
              trailing={<span className="font-display text-base font-bold tabular-nums">{r.value}</span>}
            />
          ))
        )}
      </Card>
    </ScreenSection>
  )
}
