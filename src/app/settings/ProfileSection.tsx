import { useState } from 'react'
import { checkProfile, getProfile, saveProfile } from '../../db'
import { toLocalDate } from '../../domain/shared'
import {
  Button,
  Card,
  ErrorNote,
  GoalFields,
  IdentityFields,
  Section,
  SuccessNote,
  draftToProfile,
  errorMessage,
  profileToDraft,
  useLiveQuery,
} from '../../ui'
import type { Profile } from '../../types'

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
    <Card>
      <div className="flex flex-col gap-6">
        <IdentityFields draft={draft} onChange={change} />
        <GoalFields draft={draft} onChange={change} />
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {saved ? <SuccessNote>Profil enregistré.</SuccessNote> : null}
        <Button onClick={() => void save()} disabled={busy}>
          Enregistrer le profil
        </Button>
      </div>
    </Card>
  )
}

export function ProfileSection() {
  const { data: profile, loading, error } = useLiveQuery(() => getProfile(), [])
  return (
    <Section title="Profil">
      {error ? <ErrorNote>Impossible de lire le profil.</ErrorNote> : null}
      {!loading && !error && !profile ? (
        <Card>
          <p className="text-zinc-300">Aucun profil enregistré dans les données actuelles.</p>
        </Card>
      ) : null}
      {profile ? <ProfileEditor profile={profile} /> : null}
    </Section>
  )
}
