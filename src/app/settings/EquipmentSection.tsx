import { useState } from 'react'
import { checkEquipment, getEquipment, saveEquipment } from '../../db'
import { draftToEquipment, equipmentToDraft, errorMessage, useLiveQuery } from '../../ui'
import { Button, Card } from '../../ui/kit'
import { Note } from '../../ui/kit/Note'
import type { Equipment } from '../../types'
import { EquipmentFields } from './EquipmentFields'
import { SettingsSection } from './SettingsSection'

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
    <div className="flex flex-col gap-3">
      <Card>
        <div className="flex flex-col gap-6">
          <EquipmentFields
            draft={draft}
            onChange={(next) => {
              setSaved(false)
              setDraft(next)
            }}
          />
          <Button variant="dark" fullWidth onClick={() => void save()} disabled={busy}>
            Enregistrer le matériel
          </Button>
        </div>
      </Card>
      {error ? <Note tone="error">{error}</Note> : null}
      {saved ? <Note tone="success">Matériel enregistré.</Note> : null}
    </div>
  )
}

export function EquipmentSection() {
  const { data: equipment, error } = useLiveQuery(() => getEquipment(), [])
  return (
    <SettingsSection title="Matériel">
      {error ? <Note tone="error">Impossible de lire le matériel.</Note> : null}
      {equipment ? <EquipmentEditor equipment={equipment} /> : null}
    </SettingsSection>
  )
}
