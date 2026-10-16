import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MAX_TEMPLATE_NAME_LENGTH, deleteTemplate, listTemplates, updateTemplate } from '../../db'
import type { SessionTemplate } from '../../types'
import {
  Button,
  Card,
  ConfirmSheet,
  ErrorNote,
  Sheet,
  TextField,
  errorMessage,
  linkButtonClass,
  useLiveQuery,
} from '../../ui'
import { BackLink } from './parts'
import { useLibrary } from './useLibrary'

function RenameSheet({ template, onClose }: { template: SessionTemplate; onClose: () => void }) {
  const [name, setName] = useState(template.name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await updateTemplate(template.id, {
        name,
        durationMin: template.durationMin,
        blocks: template.blocks,
      })
      onClose()
    } catch (e) {
      setError(errorMessage(e, 'Impossible de renommer le modèle. Réessaie.'))
      setBusy(false)
    }
  }
  return (
    <Sheet title="Renommer le modèle" onClose={onClose} busy={busy}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
        noValidate
      >
        <TextField
          label="Nom du modèle"
          value={name}
          onChange={setName}
          maxLength={MAX_TEMPLATE_NAME_LENGTH}
          autoComplete="off"
          autoFocus
        />
        {error ? (
          <div className="mt-3">
            <ErrorNote>{error}</ErrorNote>
          </div>
        ) : null}
        <div className="mt-4 flex flex-col gap-2">
          <Button type="submit" disabled={busy}>
            Enregistrer
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

export default function TemplatesScreen() {
  const templates = useLiveQuery(() => listTemplates(), [])
  const lib = useLibrary()
  const [renaming, setRenaming] = useState<SessionTemplate | null>(null)
  const [deleting, setDeleting] = useState<SessionTemplate | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const names = new Map((lib.data?.library ?? []).map((e) => [e.id, e.name]))

  const remove = async (t: SessionTemplate) => {
    setBusy(true)
    try {
      await deleteTemplate(t.id)
      setDeleting(null)
    } catch (e) {
      setDeleting(null)
      setError(errorMessage(e, 'Impossible de supprimer le modèle. Réessaie.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <BackLink to="/entrainement">Entraînement</BackLink>
      <h1 className="mt-2 text-3xl font-bold">Modèles de séance</h1>
      {templates.error ? (
        <div className="mt-4">
          <ErrorNote>Impossible de lire les modèles. Ferme l’app puis rouvre-la.</ErrorNote>
        </div>
      ) : null}
      {error ? (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}
      {!templates.data && !templates.error ? <div aria-busy="true" className="min-h-40" /> : null}
      {templates.data && templates.data.length === 0 ? (
        <p className="mt-5 text-base text-zinc-300">
          Aucun modèle. Depuis l’aperçu ou le récapitulatif d’une séance, appuie sur « Enregistrer comme
          modèle » pour la refaire plus tard.
        </p>
      ) : null}
      <ul className="m-0 mt-5 flex list-none flex-col gap-3 p-0">
        {templates.data?.map((t) => (
          <li key={t.id}>
            <Card>
              <h2 className="m-0 text-xl font-bold">{t.name}</h2>
              <p className="m-0 mt-1 text-base text-zinc-300">
                {t.durationMin} min · {t.blocks.length} exercice{t.blocks.length > 1 ? 's' : ''}
              </p>
              <p className="m-0 text-sm text-zinc-400">
                {t.blocks
                  .slice(0, 4)
                  .map((b) => names.get(b.exerciseId) ?? b.exerciseId)
                  .join(', ')}
                {t.blocks.length > 4 ? '…' : ''}
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <Link
                  to={`/entrainement/apercu?modele=${encodeURIComponent(t.id)}`}
                  className={linkButtonClass('primary')}
                  aria-label={`Démarrer ${t.name}`}
                >
                  Démarrer
                </Link>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setRenaming(t)}
                    aria-label={`Renommer ${t.name}`}
                  >
                    Renommer
                  </Button>
                  <Button variant="danger" onClick={() => setDeleting(t)} aria-label={`Supprimer ${t.name}`}>
                    Supprimer
                  </Button>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {renaming ? <RenameSheet template={renaming} onClose={() => setRenaming(null)} /> : null}
      {deleting ? (
        <ConfirmSheet
          title="Supprimer ce modèle ?"
          message={`« ${deleting.name} » sera supprimé. Les séances déjà faites ne changent pas.`}
          confirmLabel="Supprimer"
          busy={busy}
          onConfirm={() => void remove(deleting)}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </section>
  )
}
