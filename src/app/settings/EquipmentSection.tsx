import { useState } from 'react'
import { checkEquipment, getEquipment, saveEquipment } from '../../db'
import {
  Button,
  Card,
  EquipmentFields,
  ErrorNote,
  Section,
  SuccessNote,
  draftToEquipment,
  equipmentToDraft,
  errorMessage,
  useLiveQuery,
} from '../../ui'
import type { Equipment } from '../../types'

function EquipmentEditor({ equipment }: { equipment: Equipment }) {
  const [draft, setDraft] = useState(() => equipmentToDraft(equipment))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // Si le matériel change ailleurs (import d'une sauvegarde), le formulaire se remet à jour.
  const [seenAt, setSeenAt] = useState(equipment.updatedAt)
  const [ownSaveAt, setOwnSaveAt] = useState<string | null>(null)
  if (equipment.updatedAt !== seenAt) {
    setSeenAt(equipment.updatedAt)
    if (equipment.updatedAt !== ownSaveAt) {
      setDraft(equipmentToDraft(equipment))
      setSaved(false)
    }
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const now = new Date().toISOString()
      const next = draftToEquipment(draft, now)
      const message = checkEquipment(next)
      if (message) {
        setError(message)
        return
      }
      setOwnSaveAt(now)
      await saveEquipment(next, now)
      setSaved(true)
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’enregistrer le matériel. Réessaie.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-6">
        <EquipmentFields
          draft={draft}
          onChange={(next) => {
            setSaved(false)
            setDraft(next)
          }}
        />
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {saved ? <SuccessNote>Matériel enregistré.</SuccessNote> : null}
        <Button onClick={() => void save()} disabled={busy}>
          Enregistrer le matériel
        </Button>
      </div>
    </Card>
  )
}

export function EquipmentSection() {
  const { data: equipment, error } = useLiveQuery(() => getEquipment(), [])
  return (
    <Section title="Matériel">
      {error ? <ErrorNote>Impossible de lire le matériel.</ErrorNote> : null}
      {equipment ? <EquipmentEditor equipment={equipment} /> : null}
    </Section>
  )
}
