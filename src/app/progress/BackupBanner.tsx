import { DatabaseBackup } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { BackupReminder } from '../../types'
import { backupMessage } from './progressModel'

/**
 * Rappel d'export (SPEC §5), compact pour ne pas repousser les chiffres de l'écran : carte `surface` avec une icône
 * (pas de fond ember, l'accent reste pour la donnée). Le lien est souligné, cible ≥ 44 px, vers Réglages › Sauvegarde.
 */
export function BackupBanner({ reminder }: { reminder: BackupReminder }) {
  return (
    <aside
      aria-label="Rappel de sauvegarde"
      className="flex items-start gap-3 rounded-ds-lg bg-surface px-4 py-3 text-ink shadow-card"
    >
      <DatabaseBackup size={22} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="flex min-w-0 flex-col">
        <p className="m-0 text-body-strong">Pense à sauvegarder tes données</p>
        <p className="m-0 text-caption text-ink-muted">{backupMessage(reminder)}</p>
        <Link
          to="/reglages#sauvegarde"
          className="focus-ring -mb-1 flex min-h-11 items-center text-body-strong underline underline-offset-4"
        >
          Aller aux réglages (Sauvegarde)
        </Link>
      </div>
    </aside>
  )
}
