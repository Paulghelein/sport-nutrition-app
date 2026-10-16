// « Recette d'une vidéo » (F5, R3) : lien collé -> message pour Claude -> réponse collée dans l'écran d'import.
// Aucune lecture du presse-papiers au montage ; rien n'est envoyé sans un tap. Importe `domain/claude/context`
// directement, jamais le barrel (Zod).
import { ArrowLeft, ClipboardPaste } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DEFAULT_REQUESTS, buildVideoRecipeMessage } from '../../domain/claude/context'
import { Button, Card } from '../../ui/kit'
import { TextField } from '../../ui/kit/Fields'
import { Note } from '../../ui/kit/Note'
import { buttonClass } from '../../ui/kit/buttonClass'
import { CLAUDE_RESPONSE_PATH, NUTRITION_PATH } from '../routes'
import { readFromClipboard } from './clipboard'
import { useClaudeBase } from './useClaudeBase'
import { useClaudeBridge } from './useClaudeBridge'
import { INVALID_LINK_MESSAGE, PLATFORM_LABEL, linkState, pasteOutcome } from './videoFlow'

const areaClass =
  'focus-ring w-full rounded-ds-md bg-canvas px-3.5 py-3 font-sans text-body text-ink placeholder:text-ink-muted'

function Step({ n, children }: { n: number; children: string }) {
  return (
    <li className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-body-strong"
      >
        {n}
      </span>
      <span className="text-body">{children}</span>
    </li>
  )
}

export default function VideoRecipeScreen() {
  const navigate = useNavigate()
  const { base, ready } = useClaudeBase()
  const [text, setText] = useState('')
  const [showArea, setShowArea] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [request, setRequest] = useState('')

  const state = useMemo(() => linkState(text), [text])
  const link = state.status === 'ok' ? state.link : null
  const message = useMemo(
    () => (base && link ? buildVideoRecipeMessage({ ...base, request, video: link }) : null),
    [base, link, request],
  )
  const { url, copy, opened, copyAndOpen, copyOnly, reset } = useClaudeBridge(message?.text ?? null)

  const paste = async () => {
    const outcome = pasteOutcome(await readFromClipboard())
    if (outcome.text !== null) setText(outcome.text)
    setShowArea(outcome.showArea)
    setNotice(outcome.notice)
    reset()
  }

  const onText = (value: string) => {
    setText(value)
    setNotice(null)
    reset()
  }

  const areaVisible = showArea || text !== ''
  const invalid = state.status === 'invalid'
  const linkClass =
    'focus-ring flex min-h-11 items-center justify-center rounded-ds-md text-body-strong text-ember-ink underline underline-offset-4'

  return (
    <div>
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <button
          type="button"
          onClick={() => {
            // PWA relancée directement sur cet écran : pas d'historique, `navigate(-1)` ne ferait rien.
            const idx = (window.history.state as { idx?: number } | null)?.idx
            if (typeof idx === 'number' && idx > 0) void navigate(-1)
            else void navigate(NUTRITION_PATH)
          }}
          aria-label="Retour"
          className="focus-ring flex size-11 items-center justify-center rounded-full bg-surface shadow-card"
        >
          <ArrowLeft size={22} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <h1 className="m-0 text-display-l">Recette d’une vidéo</h1>

        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          <Step n={1}>Dans TikTok, Instagram ou YouTube : Partager, puis Copier le lien.</Step>
          <Step n={2}>Colle le lien ici et envoie-le à Claude.</Step>
          <Step n={3}>Reviens coller sa réponse : la recette est ajoutée.</Step>
        </ol>

        {
          <Button
            variant={link === null ? 'primary' : 'secondary'}
            fullWidth
            icon={<ClipboardPaste size={20} strokeWidth={1.75} aria-hidden="true" />}
            onClick={() => void paste()}
          >
            Coller le lien
          </Button>
        }

        {areaVisible ? (
          <Card>
            <label htmlFor="video-link" className="mb-1.5 block text-caption text-ink-muted">
              Lien de la vidéo
            </label>
            <textarea
              id="video-link"
              rows={3}
              value={text}
              onChange={(e) => onText(e.target.value)}
              placeholder="https://…"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className={areaClass}
            />
          </Card>
        ) : null}

        {notice !== null ? <Note tone="warning">{notice}</Note> : null}
        {invalid && notice === null ? <Note tone="error">{INVALID_LINK_MESSAGE}</Note> : null}

        {link !== null ? (
          <Card aria-label="Vidéo détectée">
            <p className="m-0 text-label uppercase text-ink-muted">{PLATFORM_LABEL[link.platform]}</p>
            <p className="m-0 mt-1 break-all text-body">{link.url}</p>
          </Card>
        ) : null}

        {link !== null && !ready ? <p className="m-0 text-body text-ink-muted">Chargement…</p> : null}
        {link !== null && ready && !message ? (
          <Note tone="error">
            Il faut un profil et au moins une pesée pour préparer le message (ton poids sert aux objectifs).
          </Note>
        ) : null}

        {link !== null && message ? (
          <>
            <Card className="flex flex-col gap-4">
              <TextField
                label="Ta demande (facultatif)"
                value={request}
                onChange={(v) => {
                  setRequest(v)
                  reset()
                }}
                placeholder={DEFAULT_REQUESTS.video_recipe}
                hint="Par exemple : version sans lactose. Laisse vide pour la recette telle quelle."
              />
              <div>
                <label htmlFor="video-message" className="mb-1.5 block text-caption text-ink-muted">
                  Message qui sera copié (rien n’est envoyé avant que tu le colles dans Claude)
                </label>
                <textarea
                  id="video-message"
                  readOnly
                  rows={8}
                  value={message.text}
                  onFocus={(e) => e.currentTarget.select()}
                  className={`${areaClass} font-mono text-caption`}
                />
              </div>
            </Card>

            {copy === 'copied' ? (
              <Note tone="success">
                {opened
                  ? 'Message copié. Colle-le dans Claude (appui long, puis Coller).'
                  : 'Message copié. Ouvre Claude et colle-le (appui long, puis Coller).'}
              </Note>
            ) : null}
            {copy === 'failed' ? (
              <Note tone="error">
                Impossible de copier automatiquement. Appuie sur le message ci-dessus, « Tout sélectionner »
                puis « Copier », ou réessaie avec le bouton « Copier ».
              </Note>
            ) : null}

            <div className="flex flex-col gap-2">
              {copy === 'failed' ? (
                <Button fullWidth onClick={() => void copyOnly()}>
                  Copier
                </Button>
              ) : copy === 'copied' ? null : (
                <Button fullWidth onClick={() => void copyAndOpen()}>
                  Copier et ouvrir Claude
                </Button>
              )}
              {copy === 'failed' || (copy === 'copied' && opened === false) ? (
                <a href={url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                  Ouvrir Claude
                </a>
              ) : null}
              <Link
                to={CLAUDE_RESPONSE_PATH}
                className={buttonClass(copy === 'copied' ? 'primary' : 'secondary', 'normal', true)}
              >
                Coller la réponse
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
