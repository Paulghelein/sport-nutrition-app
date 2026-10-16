// Rappel de sauvegarde (SPEC §5 : export hebdomadaire). Fonction pure : l'instant courant est un paramètre.
import type { IsoDateTime } from '../../types/common'
import type { BackupReminder } from '../../types/progress'
import { BACKUP_REMINDER_DAYS } from '../../types/progress'
import { daysBetween, toLocalDate } from '../shared/dates'

/**
 * Rappel de sauvegarde depuis `Settings.lastExportAt` :
 * - `null` → `never` (`daysSince: null`) ;
 * - `daysSince` = jours calendaires locaux entre la date de l'export et celle de `now` (un export hier à
 *   23 h compte 1 jour à 0 h 30) ; `due` à partir de `BACKUP_REMINDER_DAYS`, sinon `ok`.
 * Cas anormaux, traités dans le sens le plus sûr (rappeler) : date d'export illisible, date d'export à un
 * jour postérieur à `now` (horloge changée, import d'une sauvegarde d'un autre appareil), `now` invalide ou
 * année hors de 0000–9999 → `due` avec `daysSince: null` (durée inconnue : l'interface ne doit pas afficher
 * un nombre de jours faux).
 * Un export plus tard le même jour (décalage de quelques minutes) reste `ok`, 0 jour.
 */
export function backupReminder(lastExportAt: IsoDateTime | null, now: Date): BackupReminder {
  if (lastExportAt === null) return { status: 'never', daysSince: null }
  const exported = new Date(lastExportAt)
  if (Number.isNaN(exported.getTime()) || Number.isNaN(now.getTime()))
    return { status: 'due', daysSince: null }
  let days: number
  try {
    days = daysBetween(toLocalDate(exported), toLocalDate(now))
  } catch {
    return { status: 'due', daysSince: null } // année hors de 0000–9999
  }
  if (days < 0) return { status: 'due', daysSince: null }
  return { status: days >= BACKUP_REMINDER_DAYS ? 'due' : 'ok', daysSince: days }
}
