import { useState } from 'react'
import { MAX_TEMPLATE_NAME_LENGTH, createTemplate } from '../../db'
import { templateFromSession } from '../../domain/training'
import type { Session, SessionBlock, SessionDuration } from '../../types'
import { errorMessage } from '../../ui'
import { Button, Sheet } from '../../ui/kit'
import { TextField } from '../../ui/kit/Fields'
import { Note } from '../../ui/kit/Note'

interface Props {
  source: Session | readonly SessionBlock[]
  durationMin: SessionDuration
  defaultName: string
  deload?: boolean
}

/** Bouton « Enregistrer comme modèle » + feuille de saisie du nom. */
export function SaveTemplate({ source, durationMin, defaultName, deload }: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(defaultName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      const row = await createTemplate(
        templateFromSession(source, name, durationMin, { deload: deload === true }),
      )
      setSaved(row.name)
      setOpen(false)
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’enregistrer le modèle. Réessaie.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {saved ? (
        <Note tone="success">{`Modèle « ${saved} » enregistré. Tu le retrouveras dans « Modèles ».`}</Note>
      ) : null}
      <Button
        variant="secondary"
        fullWidth
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
      >
        Enregistrer comme modèle
      </Button>
      {open ? (
        <Sheet title="Enregistrer comme modèle" onClose={() => setOpen(false)} busy={busy}>
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
            <p className="m-0 text-caption text-ink-muted">
              Le modèle garde les exercices, le nombre de séries et les repos. Les charges seront recalculées
              d’après ta progression à chaque départ.
            </p>
            {error ? <Note tone="error">{error}</Note> : null}
            <div className="flex flex-col gap-2">
              <Button type="submit" fullWidth disabled={busy}>
                Enregistrer
              </Button>
              <Button variant="secondary" fullWidth onClick={() => setOpen(false)} disabled={busy}>
                Annuler
              </Button>
            </div>
          </form>
        </Sheet>
      ) : null}
    </div>
  )
}
