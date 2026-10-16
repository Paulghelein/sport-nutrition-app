import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getSettings, updateSettings } from '../../db'
import { COACH_PROJECT_INSTRUCTIONS } from '../../domain/claude/instructions'
import { CLAUDE_CODE_URL } from '../../types/claude'
import {
  Button,
  ErrorNote,
  Section,
  SuccessNote,
  TextField,
  errorMessage,
  linkButtonClass,
  useLiveQuery,
} from '../../ui'
import { copyToClipboard } from '../claude/clipboard'
import { CLAUDE_RESPONSE_PATH } from '../routes'
import { checkCoachUrlInput } from './coachUrl'

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
    <div className="flex flex-col gap-2">
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
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {done ? <SuccessNote>Adresse enregistrée.</SuccessNote> : null}
      <Button variant="secondary" onClick={() => void save()} disabled={busy}>
        Enregistrer l’adresse
      </Button>
    </div>
  )
}

export default function ClaudeSection() {
  const { data } = useLiveQuery(() => getSettings(), [])
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null)
  const [showText, setShowText] = useState(false)

  return (
    <Section title="Claude">
      <p className="mb-3 text-zinc-400">
        Les boutons « Demander à Claude » copient un message à coller dans ton Projet Coach. Rien n’est envoyé
        sans que tu le colles toi-même.
      </p>
      {data ? <CoachUrlForm saved={data.coachUrl} /> : <div aria-busy="true" className="h-24" />}

      <div className="mt-5 flex flex-col gap-2">
        <Button
          variant="secondary"
          onClick={() =>
            void copyToClipboard(COACH_PROJECT_INSTRUCTIONS).then((ok) => setCopied(ok ? 'ok' : 'failed'))
          }
        >
          Copier les instructions du Projet Coach
        </Button>
        {copied === 'ok' ? (
          <SuccessNote>Instructions copiées. Colle-les dans les instructions du Projet.</SuccessNote>
        ) : null}
        {copied === 'failed' ? (
          <ErrorNote>Copie impossible : ouvre le texte ci-dessous et copie-le à la main.</ErrorNote>
        ) : null}
        <button
          type="button"
          aria-expanded={showText}
          onClick={() => setShowText((v) => !v)}
          className="flex min-h-11 items-center justify-center rounded-xl text-base font-semibold text-orange-300 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400"
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
            className="w-full rounded-xl border border-line bg-surface-hi px-3 py-2.5 font-mono text-xs text-zinc-200"
          />
        ) : null}
      </div>

      <div className="mt-5 flex flex-col gap-2">
        <Link to={CLAUDE_RESPONSE_PATH} className={linkButtonClass('secondary')}>
          Coller une réponse de Claude
        </Link>
        <a
          href={CLAUDE_CODE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={linkButtonClass('secondary')}
        >
          Faire évoluer l’app
        </a>
      </div>
    </Section>
  )
}
