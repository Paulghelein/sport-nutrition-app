import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MAX_TEMPLATE_NAME_LENGTH, deleteTemplate, listTemplates, updateTemplate } from '../../db'
import type { SessionTemplate } from '../../types'
import { errorMessage, useLiveQuery } from '../../ui'
import { Button, Card, Sheet, buttonClass } from '../../ui/kit'
import { ConfirmSheet } from '../../ui/kit/ConfirmSheet'
import { TextField } from '../../ui/kit/Fields'
import { Note } from '../../ui/kit/Note'
import { PREVIEW_PATH, TRAINING_PATH } from '../routes'
import { BackLink, ScreenTitle } from './parts'
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
        className="flex flex-col gap-4"
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
        {error ? <Note tone="error">{error}</Note> : null}
        <div className="flex flex-col gap-2">
          <Button type="submit" fullWidth disabled={busy}>
            Enregistrer
          </Button>
          <Button variant="secondary" fullWidth onClick={onClose} disabled={busy}>
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
    <section className="flex flex-col gap-4">
      <BackLink to={TRAINING_PATH}>Entraînement</BackLink>
      <ScreenTitle>Modèles de séance</ScreenTitle>
      {templates.error ? (
        <Note tone="error">Impossible de lire les modèles. Ferme l’app puis rouvre-la.</Note>
      ) : null}
      {error ? <Note tone="error">{error}</Note> : null}
      {!templates.data && !templates.error ? <div aria-busy="true" className="min-h-40" /> : null}
      {templates.data && templates.data.length === 0 ? (
        <p className="m-0 text-body text-ink-muted">
          Aucun modèle. Depuis l’aperçu ou le récapitulatif d’une séance, appuie sur « Enregistrer comme
          modèle » pour la refaire plus tard.
        </p>
      ) : null}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {templates.data?.map((t) => (
          <li key={t.id}>
            <Card padding="large" className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <h2 className="m-0 font-display text-title">{t.name}</h2>
                <p className="m-0 text-body">
                  {t.durationMin} min · {t.blocks.length} exercice{t.blocks.length > 1 ? 's' : ''}
                </p>
                <p className="m-0 text-caption text-ink-muted">
                  {t.blocks
                    .slice(0, 4)
                    .map((b) => names.get(b.exerciseId) ?? b.exerciseId)
                    .join(', ')}
                  {t.blocks.length > 4 ? '…' : ''}
                </p>
              </div>
              <Link
                to={`${PREVIEW_PATH}?modele=${encodeURIComponent(t.id)}`}
                className={buttonClass('primary', 'normal', true)}
                aria-label={`Démarrer ${t.name}`}
              >
                Démarrer
              </Link>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  fullWidth
                  className="bg-canvas! shadow-none!"
                  onClick={() => setRenaming(t)}
                  aria-label={`Renommer ${t.name}`}
                >
                  Renommer
                </Button>
                <Button
                  variant="secondary"
                  fullWidth
                  className="bg-canvas! text-critical! shadow-none!"
                  onClick={() => setDeleting(t)}
                  aria-label={`Supprimer ${t.name}`}
                >
                  Supprimer
                </Button>
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
