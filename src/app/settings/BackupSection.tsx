import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  backupFileName,
  exportBackup,
  getSettings,
  importBackup,
  markExported,
  parseBackup,
} from '../../db'
import type { TableCounts } from '../../db'
import { Button, Card, ConfirmSheet, ErrorNote, Section, SuccessNote, errorMessage, formatDateTimeFr, useLiveQuery } from '../../ui'
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
  typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })

interface Prepared {
  file: File
  /** `exportedAt` du fichier : c'est l'heure enregistrée comme « dernier export ». */
  exportedAt: string
  summary: string
}

const sizeLabel = (bytes: number): string =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`

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
    <Section title="Sauvegarde">
      <Card>
        <h3 className="text-base font-semibold">Exporter mes données</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Crée un fichier avec tout le contenu de l’app. Enregistre-le dans Fichiers ou iCloud : c’est ta seule copie
          de secours.
        </p>
        <p className="mt-2 text-sm text-zinc-300">
          {settings?.lastExportAt
            ? `Dernier export : ${formatDateTimeFr(settings.lastExportAt)}`
            : 'Aucun export pour l’instant.'}
        </p>
        <div className="mt-3 flex flex-col gap-3">
          {exportError ? <ErrorNote>{exportError}</ErrorNote> : null}
          {exportNotice ? (
            <p role="status" className="rounded-xl border border-line bg-surface-hi px-3 py-2.5 text-sm text-zinc-200">
              {exportNotice}
            </p>
          ) : null}
          {exportDone ? <SuccessNote>Sauvegarde exportée.</SuccessNote> : null}

          {prepared ? (
            <div className="rounded-xl border border-line bg-surface-hi p-3">
              <p className="text-sm font-semibold break-all">{prepared.file.name}</p>
              <p className="mt-1 text-sm text-zinc-400">{prepared.summary}</p>
              <div className="mt-3 flex flex-col gap-2">
                {canShareFile(prepared.file) ? <Button onClick={share}>Enregistrer ou partager</Button> : null}
                <Button variant={canShareFile(prepared.file) ? 'secondary' : 'primary'} onClick={download}>
                  Télécharger le fichier
                </Button>
                {awaitingConfirm ? (
                  <Button variant="secondary" onClick={() => void confirmExported()}>
                    C’est enregistré
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={() => { sharing.current = false; setPrepared(null); resetExportMessages() }}>
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => void prepare()} disabled={busy}>
              Préparer la sauvegarde
            </Button>
          )}
        </div>
      </Card>

      <Card className="mt-3">
        <h3 className="text-base font-semibold">Importer une sauvegarde</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Choisis un fichier <span className="whitespace-nowrap">forge-sauvegarde-….json</span>. Rien n’est modifié
          avant ta confirmation.
        </p>
        <div className="mt-3 flex flex-col gap-3">
          <label className="relative inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl border border-line bg-surface-hi px-4 text-base font-semibold active:bg-zinc-700 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-orange-400">
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

          {importErrors.length > 0 ? (
            <ErrorNote>
              Ce fichier ne peut pas être importé :
              <ul className="mt-1 list-disc pl-5">
                {importErrors.map((message, i) => (
                  <li key={i}>{message}</li>
                ))}
              </ul>
            </ErrorNote>
          ) : null}
          {importDone ? <SuccessNote>{importDone}</SuccessNote> : null}

          {pending ? (
            <div className="rounded-xl border border-line bg-surface-hi p-3">
              <p className="text-sm font-semibold break-all">{pending.fileName}</p>
              <p className="mt-1 text-sm text-zinc-400">Exporté le {formatDateTimeFr(pending.backup.exportedAt)}</p>
              {nonEmpty.length > 0 ? (
                <ul className="mt-2 grid list-none grid-cols-1 gap-1 p-0">
                  {nonEmpty.map((name) => (
                    <li key={name} className="flex justify-between text-sm">
                      <span>{tableLabels[name]}</span>
                      <span className="font-semibold tabular-nums">{pending.summary[name]}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-zinc-400">Ce fichier ne contient aucune donnée.</p>
              )}
              {importError ? (
                <div className="mt-3">
                  <ErrorNote>{importError}</ErrorNote>
                </div>
              ) : null}
              <div className="mt-4 flex flex-col gap-2">
                <Button variant="secondary" onClick={() => void runImport('merge')} disabled={busy}>
                  Fusionner avec mes données
                </Button>
                <p className="-mt-1 text-xs text-zinc-400">
                  Fusionner garde tes données actuelles ; en cas de doublon, la version du fichier l’emporte.
                </p>
                <Button variant="danger" onClick={() => setConfirmReplace(true)} disabled={busy}>
                  Remplacer toutes mes données
                </Button>
                <Button variant="ghost" onClick={() => setPending(null)} disabled={busy}>
                  Annuler l’import
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </Card>

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
    </Section>
  )
}
