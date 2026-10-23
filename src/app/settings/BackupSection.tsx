import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { backupFileName, exportBackup, getSettings, importBackup, markExported, parseBackup } from '../../db'
import type { TableCounts } from '../../db'
import { errorMessage, formatDateTimeFr, useLiveQuery } from '../../ui'
import { Button, Card } from '../../ui/kit'
import { ConfirmSheet } from '../../ui/kit/ConfirmSheet'
import { Note } from '../../ui/kit/Note'
import { SettingsSection } from './SettingsSection'
import { TABLE_NAMES } from '../../types'
import type { BackupFile, ImportMode, TableName } from '../../types'

const tableLabels: Record<TableName, string> = {
  profile: 'Profil',
  weighIns: 'Pesées',
  measurements: 'Mensurations',
  equipment: 'Matériel',
  exercises: 'Exercices',
  exercisePrefs: 'Préférences d’exercices',
  exerciseState: 'Progression par exercice',
  sessions: 'Séances',
  sessionTemplates: 'Modèles de séance',
  foods: 'Aliments',
  recipes: 'Recettes',
  fridge: 'Frigo',
  foodLog: 'Journal alimentaire',
  shoppingLists: 'Listes de courses',
  settings: 'Réglages',
}

/** Propose le fichier au téléchargement (repli quand le partage iOS n'est pas disponible). */
function downloadFile(file: File): void {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const canShareFile = (file: File): boolean =>
  typeof navigator.share === 'function' &&
  typeof navigator.canShare === 'function' &&
  navigator.canShare({ files: [file] })

interface Prepared {
  file: File
  /** `exportedAt` du fichier : c'est l'heure enregistrée comme « dernier export ». */
  exportedAt: string
  summary: string
}

const sizeLabel = (bytes: number): string =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} Ko`
    : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`

interface Pending {
  fileName: string
  backup: BackupFile
  summary: TableCounts
}

export function BackupSection() {
  const { data: settings } = useLiveQuery(() => getSettings(), [])
  const fileInput = useRef<HTMLInputElement>(null)
  // Partage en cours : ignore les appuis suivants sans désactiver le bouton.
  const sharing = useRef(false)
  const [busy, setBusy] = useState(false)
  const [prepared, setPrepared] = useState<Prepared | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportNotice, setExportNotice] = useState<string | null>(null)
  const [exportDone, setExportDone] = useState(false)
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)
  const [importErrors, setImportErrors] = useState<string[]>([])
  const [pending, setPending] = useState<Pending | null>(null)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importDone, setImportDone] = useState<string | null>(null)

  const resetExportMessages = () => {
    setExportError(null)
    setExportNotice(null)
    setExportDone(false)
    setAwaitingConfirm(false)
  }

  /** Étape 1 : lit la base et construit le fichier (aucun partage ici : le geste utilisateur serait perdu). */
  const prepare = async () => {
    setBusy(true)
    resetExportMessages()
    try {
      const now = new Date().toISOString()
      const backup = await exportBackup(now)
      const file = new File([JSON.stringify(backup)], backupFileName(now), { type: 'application/json' })
      const counts = TABLE_NAMES.filter((name) => backup.tables[name].length > 0).map(
        (name) => `${tableLabels[name].toLowerCase()} : ${backup.tables[name].length}`,
      )
      const time = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' }).format(new Date(now))
      setPrepared({
        file,
        exportedAt: backup.exportedAt,
        summary: `Préparée à ${time} — ${sizeLabel(file.size)} — ${counts.join(', ') || 'aucune donnée'}`,
      })
    } catch (e) {
      setExportError(errorMessage(e, 'La préparation a échoué. Réessaie.'))
    } finally {
      setBusy(false)
    }
  }

  const confirmExported = async () => {
    if (!prepared) return
    try {
      await markExported(prepared.exportedAt)
      setAwaitingConfirm(false)
      setExportNotice(null)
      setExportDone(true)
      setPrepared(null)
    } catch (e) {
      setExportError(errorMessage(e, 'Impossible de noter l’export. Réessaie.'))
    }
  }

  /** Étape 2 : `share()` est appelé directement dans le geste (pas d'await avant). Le bouton reste utilisable. */
  const share = () => {
    if (!prepared || sharing.current) return
    sharing.current = true
    resetExportMessages()
    navigator.share({ files: [prepared.file], title: 'Sauvegarde Forge' }).then(
      () => {
        sharing.current = false
        void confirmExported()
      },
      (e: unknown) => {
        sharing.current = false
        // Annulé, ou un partage est déjà ouvert : rien à afficher.
        if (e instanceof DOMException && (e.name === 'AbortError' || e.name === 'InvalidStateError')) return
        setExportError('Le partage n’a pas pu s’ouvrir. Tu peux télécharger le fichier à la place.')
      },
    )
  }

  /** Repli : le téléchargement ne prouve rien, c'est l'utilisateur qui confirme. */
  const download = () => {
    if (!prepared) return
    resetExportMessages()
    downloadFile(prepared.file)
    setExportNotice('Fichier proposé au téléchargement — vérifie qu’il est bien dans Fichiers.')
    setAwaitingConfirm(true)
  }

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    setImportErrors([])
    setImportError(null)
    setImportDone(null)
    setPending(null)
    try {
      const result = parseBackup(await file.text())
      if (result.ok) setPending({ fileName: file.name, backup: result.backup, summary: result.summary })
      else setImportErrors(result.errors)
    } catch {
      setImportErrors(['Impossible de lire ce fichier.'])
    }
  }

  const runImport = async (mode: ImportMode) => {
    if (!pending) return
    setBusy(true)
    setImportError(null)
    try {
      const report = await importBackup(pending.backup, mode)
      const total = TABLE_NAMES.reduce((sum, name) => sum + report.counts[name], 0)
      setImportDone(
        `Sauvegarde importée (${mode === 'replace' ? 'données remplacées' : 'données fusionnées'}) : ${total} ligne${total > 1 ? 's' : ''} écrite${total > 1 ? 's' : ''}.`,
      )
      setPending(null)
    } catch (e) {
      setImportError(errorMessage(e, 'L’import a échoué. Tes données actuelles n’ont pas été modifiées.'))
    } finally {
      setBusy(false)
      setConfirmReplace(false)
    }
  }

  const nonEmpty = pending ? TABLE_NAMES.filter((name) => pending.summary[name] > 0) : []

  return (
    <SettingsSection title="Sauvegarde">
      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="m-0 font-display text-title">Exporter mes données</h3>
          <p className="m-0 text-body text-ink-muted">
            Crée un fichier avec tout le contenu de l’app. Enregistre-le dans Fichiers ou iCloud : c’est ta
            seule copie de secours.
          </p>
        </div>
        <p className="m-0 text-body-strong">
          {settings?.lastExportAt
            ? `Dernier export : ${formatDateTimeFr(settings.lastExportAt)}`
            : 'Aucun export pour l’instant.'}
        </p>
        {prepared ? (
          <div className="flex flex-col gap-3 rounded-md bg-canvas p-3.5">
            <div>
              <p className="m-0 break-all text-body-strong">{prepared.file.name}</p>
              <p className="m-0 mt-1 text-caption text-ink-muted">{prepared.summary}</p>
            </div>
            <div className="flex flex-col gap-2">
              {canShareFile(prepared.file) ? (
                <Button variant="dark" fullWidth onClick={share}>
                  Enregistrer ou partager
                </Button>
              ) : null}
              <Button
                variant={canShareFile(prepared.file) ? 'secondary' : 'dark'}
                fullWidth
                onClick={download}
              >
                Télécharger le fichier
              </Button>
              {awaitingConfirm ? (
                <Button variant="secondary" fullWidth onClick={() => void confirmExported()}>
                  C’est enregistré
                </Button>
              ) : null}
              <Button
                variant="text"
                fullWidth
                onClick={() => {
                  sharing.current = false
                  setPrepared(null)
                  resetExportMessages()
                }}
              >
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="dark" fullWidth onClick={() => void prepare()} disabled={busy}>
            Préparer la sauvegarde
          </Button>
        )}
      </Card>
      {exportError ? <Note tone="error">{exportError}</Note> : null}
      {exportNotice ? (
        <div role="status">
          <Note tone="warning">{exportNotice}</Note>
        </div>
      ) : null}
      {exportDone ? <Note tone="success">Sauvegarde exportée.</Note> : null}

      <Card className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="m-0 font-display text-title">Importer une sauvegarde</h3>
          <p className="m-0 text-body text-ink-muted">
            Choisis un fichier <span className="whitespace-nowrap">forge-sauvegarde-….json</span>. Rien n’est
            modifié avant ta confirmation.
          </p>
        </div>
        <label className="relative inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-full bg-canvas px-5 text-body-strong text-ink active:opacity-80 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus">
          Choisir un fichier
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(e) => void onFile(e)}
            disabled={busy}
          />
        </label>

        {pending ? (
          <div className="flex flex-col gap-3 rounded-md bg-canvas p-3.5">
            <div>
              <p className="m-0 break-all text-body-strong">{pending.fileName}</p>
              <p className="m-0 mt-1 text-caption text-ink-muted">
                Exporté le {formatDateTimeFr(pending.backup.exportedAt)}
              </p>
            </div>
            {nonEmpty.length > 0 ? (
              <ul className="m-0 flex list-none flex-col p-0">
                {nonEmpty.map((name) => (
                  <li
                    key={name}
                    className="flex justify-between gap-3 border-t border-line py-1.5 text-body first:border-t-0"
                  >
                    <span>{tableLabels[name]}</span>
                    <span className="font-display font-bold tabular-nums">{pending.summary[name]}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-body text-ink-muted">Ce fichier ne contient aucune donnée.</p>
            )}
            {importError ? <Note tone="error">{importError}</Note> : null}
            <div className="flex flex-col gap-2">
              <Button variant="dark" fullWidth onClick={() => void runImport('merge')} disabled={busy}>
                Fusionner avec mes données
              </Button>
              <p className="m-0 px-1 text-caption text-ink-muted">
                Fusionner garde tes données actuelles ; en cas de doublon, la version du fichier l’emporte.
              </p>
              <Button variant="danger" fullWidth onClick={() => setConfirmReplace(true)} disabled={busy}>
                Remplacer toutes mes données
              </Button>
              <Button variant="text" fullWidth onClick={() => setPending(null)} disabled={busy}>
                Annuler l’import
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
      {importErrors.length > 0 ? (
        <Note tone="error">
          Ce fichier ne peut pas être importé :
          <ul className="m-0 mt-1 list-disc pl-5">
            {importErrors.map((message, i) => (
              <li key={i}>{message}</li>
            ))}
          </ul>
        </Note>
      ) : null}
      {importDone ? <Note tone="success">{importDone}</Note> : null}

      {confirmReplace ? (
        <ConfirmSheet
          title="Tout remplacer ?"
          message="Toutes les données actuelles de l’app (profil, pesées, séances, journal…) seront effacées et remplacées par le contenu du fichier. Cette action est définitive : exporte d’abord tes données si tu hésites."
          confirmLabel="Oui, tout remplacer"
          busy={busy}
          onCancel={() => setConfirmReplace(false)}
          onConfirm={() => void runImport('replace')}
        />
      ) : null}
    </SettingsSection>
  )
}
