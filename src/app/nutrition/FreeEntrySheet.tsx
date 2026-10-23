import { useState } from 'react'
import type { FreeEntryInput } from '../../types'
import { errorMessage } from '../../ui'
import { Button } from '../../ui/kit/Button'
import { Note } from '../../ui/kit/Note'
import { Sheet } from '../../ui/kit/Sheet'
import { FreeFields } from './freeEntry'
import { emptyFreeDraft, parseFreeDraft } from './freeDraft'

/** Saisie libre : nom + kcal obligatoires, macros facultatives. */
export function FreeEntrySheet({
  onSubmit,
  onClose,
}: {
  onSubmit: (input: FreeEntryInput) => Promise<void>
  onClose: () => void
}) {
  const [draft, setDraft] = useState(emptyFreeDraft)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const parsed = parseFreeDraft(draft)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSubmit(parsed.value)
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’ajouter. Réessaie.'))
      setBusy(false)
    }
  }

  return (
    <Sheet title="Saisie libre" onClose={onClose} busy={busy}>
      <FreeFields draft={draft} onChange={setDraft} />
      {error ? <Note tone="error">{error}</Note> : null}
      <Button fullWidth onClick={() => void submit()} disabled={busy}>
        Ajouter
      </Button>
    </Sheet>
  )
}
