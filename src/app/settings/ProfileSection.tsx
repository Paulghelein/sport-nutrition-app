import { useState } from 'react'
import { checkProfile, getProfile, saveProfile } from '../../db'
import { toLocalDate } from '../../domain/shared'
import { draftToProfile, errorMessage, profileToDraft, useLiveQuery } from '../../ui'
import { Button, Card } from '../../ui/kit'
import { Note } from '../../ui/kit/Note'
import type { Profile } from '../../types'
import { GoalFields, IdentityFields } from './ProfileFields'
import { SettingsSection } from './SettingsSection'

function ProfileEditor({ profile }: { profile: Profile }) {
  const [draft, setDraft] = useState(() => profileToDraft(profile))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // Si le profil change ailleurs (import d'une sauvegarde), le formulaire se remet à jour.
  const [seenAt, setSeenAt] = useState(profile.updatedAt)
  const [ownSaveAt, setOwnSaveAt] = useState<string | null>(null)
  if (profile.updatedAt !== seenAt) {
    setSeenAt(profile.updatedAt)
    if (profile.updatedAt !== ownSaveAt) {
      setDraft(profileToDraft(profile))
      setSaved(false)
    }
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const now = new Date().toISOString()
      const next = draftToProfile(draft, profile, now)
      const message = checkProfile(next, toLocalDate(new Date()))
      if (message) {
        setError(message)
        return
      }
      setOwnSaveAt(now)
      await saveProfile(next, now)
      setSaved(true)
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’enregistrer le profil. Réessaie.'))
    } finally {
      setBusy(false)
    }
  }

  const change = (next: typeof draft) => {
    setSaved(false)
    setDraft(next)
  }

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="flex flex-col gap-6">
          <IdentityFields draft={draft} onChange={change} />
          <GoalFields draft={draft} onChange={change} />
          <Button variant="dark" fullWidth onClick={() => void save()} disabled={busy}>
            Enregistrer le profil
          </Button>
        </div>
      </Card>
      {error ? <Note tone="error">{error}</Note> : null}
      {saved ? <Note tone="success">Profil enregistré.</Note> : null}
    </div>
  )
}

export function ProfileSection() {
  const { data: profile, loading, error } = useLiveQuery(() => getProfile(), [])
  return (
    <SettingsSection title="Profil">
      {error ? <Note tone="error">Impossible de lire le profil.</Note> : null}
      {!loading && !error && !profile ? (
        <Card>
          <p className="m-0 text-body text-ink-muted">Aucun profil enregistré dans les données actuelles.</p>
        </Card>
      ) : null}
      {profile ? <ProfileEditor profile={profile} /> : null}
    </SettingsSection>
  )
}
