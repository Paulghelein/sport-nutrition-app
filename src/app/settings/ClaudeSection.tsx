import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getSettings, updateSettings } from '../../db'
import { COACH_PROJECT_INSTRUCTIONS } from '../../domain/claude/instructions'
import { CLAUDE_CODE_URL } from '../../types/claude'
import { errorMessage, useLiveQuery } from '../../ui'
import { Button, Card, buttonClass } from '../../ui/kit'
import { TextField } from '../../ui/kit/Fields'
import { Note } from '../../ui/kit/Note'
import { copyToClipboard } from '../claude/clipboard'
import { CLAUDE_RESPONSE_PATH } from '../routes'
import { checkCoachUrlInput } from './coachUrl'
import { SettingsSection } from './SettingsSection'

function CoachUrlForm({ saved }: { saved: string | null }) {
  const [draft, setDraft] = useState(saved ?? '')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const save = async () => {
    const check = checkCoachUrlInput(draft)
    setDone(false)
    if (!check.ok) {
      setError(check.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await updateSettings({ coachUrl: check.value })
      setDraft(check.value ?? '')
      setDone(true)
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’enregistrer l’adresse. Réessaie.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-4">
        <TextField
          label="Adresse du Projet Coach"
          value={draft}
          onChange={(v) => {
            setDraft(v)
            setDone(false)
          }}
          type="url"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://claude.ai/project/…"
          hint="Laisse vide pour ouvrir claude.ai/new."
        />
        <Button variant="dark" fullWidth onClick={() => void save()} disabled={busy}>
          Enregistrer l’adresse
        </Button>
      </Card>
      {error ? <Note tone="error">{error}</Note> : null}
      {done ? <Note tone="success">Adresse enregistrée.</Note> : null}
    </div>
  )
}

export default function ClaudeSection() {
  const { data } = useLiveQuery(() => getSettings(), [])
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null)
  const [showText, setShowText] = useState(false)

  return (
    <SettingsSection
      title="Claude"
      intro="Les boutons « Demander à Claude » copient un message à coller dans ton Projet Coach. Rien n’est envoyé sans que tu le colles toi-même."
    >
      {data ? <CoachUrlForm saved={data.coachUrl} /> : <div aria-busy="true" className="h-24" />}

      <Card className="flex flex-col gap-3">
        <Button
          variant="flat"
          fullWidth
          onClick={() =>
            void copyToClipboard(COACH_PROJECT_INSTRUCTIONS).then((ok) => setCopied(ok ? 'ok' : 'failed'))
          }
        >
          Copier les instructions du Projet Coach
        </Button>
        <button
          type="button"
          aria-expanded={showText}
          onClick={() => setShowText((v) => !v)}
          className="focus-ring flex min-h-11 items-center justify-center rounded-full text-body-strong text-ember-ink underline underline-offset-4"
        >
          {showText ? 'Masquer les instructions' : 'Voir les instructions'}
        </button>
        {showText ? (
          <textarea
            readOnly
            aria-label="Instructions du Projet Coach"
            rows={12}
            value={COACH_PROJECT_INSTRUCTIONS}
            onFocus={(e) => e.currentTarget.select()}
            className="focus-ring w-full rounded-md bg-canvas px-3.5 py-3 font-mono text-input text-ink"
          />
        ) : null}
      </Card>
      {copied === 'ok' ? (
        <Note tone="success">Instructions copiées. Colle-les dans les instructions du Projet.</Note>
      ) : null}
      {copied === 'failed' ? (
        <Note tone="error">
          Copie impossible : ouvre « Voir les instructions » et copie le texte à la main.
        </Note>
      ) : null}

      <div className="flex flex-col gap-2">
        <Link to={CLAUDE_RESPONSE_PATH} className={buttonClass('secondary', 'normal', true)}>
          Coller une réponse de Claude
        </Link>
        <a
          href={CLAUDE_CODE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass('secondary', 'normal', true)}
        >
          Faire évoluer l’app
        </a>
      </div>
    </SettingsSection>
  )
}
