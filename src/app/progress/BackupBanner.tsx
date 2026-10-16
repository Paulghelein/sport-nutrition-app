import { Link } from 'react-router-dom'
import { linkButtonClass } from '../../ui'
import type { BackupReminder } from '../../types'
import { backupMessage } from './progressModel'

/** Rappel d'export (SPEC §5). Le lien mène à Réglages, section « Sauvegarde ». */
export function BackupBanner({ reminder }: { reminder: BackupReminder }) {
  return (
    <aside
      aria-label="Rappel de sauvegarde"
      className="mt-6 rounded-2xl border border-orange-400/40 bg-orange-400/10 p-4"
    >
      <p className="text-base font-semibold text-orange-100">Pense à sauvegarder tes données</p>
      <p className="mt-1 mb-3 text-sm text-orange-100/90">{backupMessage(reminder)}</p>
      <Link to="/reglages#sauvegarde" className={linkButtonClass('secondary')}>
        Aller aux réglages (Sauvegarde)
      </Link>
    </aside>
  )
}
