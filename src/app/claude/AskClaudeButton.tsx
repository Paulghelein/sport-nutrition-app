import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { isAllowedCoachUrl } from '../../domain/claude/coachUrl'
import { DEFAULT_REQUESTS } from '../../domain/claude/context'
import { CLAUDE_DEFAULT_URL } from '../../types/claude'
import type { ClaudeContextKind, ClaudeMessage } from '../../types/claude'
import type { ClaudeBaseInput } from '../../domain/claude/context'
import { Button, ErrorNote, Sheet, SuccessNote } from '../../ui'
import { CLAUDE_RESPONSE_PATH } from '../routes'
import { copyToClipboard } from './clipboard'
import type { ClaudeBase } from './inputs'
import { useClaudeBase, useCoachUrl } from './useClaudeBase'

// Boutons d'envoi (SPEC §10.1). Importe `domain/claude/context` directement, jamais le barrel (Zod).

interface Props {
  kind: ClaudeContextKind
  /** Construit le message à partir de la base (profil, matériel, objectifs) ; `null` = données de l'écran pas prêtes. */
  build: ((base: ClaudeBaseInput) => ClaudeMessage) | null
  label?: string
  className?: string
  /** Ouvre l'aperçu d'envoi dès que les données sont prêtes (arrivée depuis la feuille Ajouter). Rien n'est copié ni envoyé. */
  defaultOpen?: boolean
  /** Appelé une fois l'ouverture automatique faite (l'appelant nettoie son paramètre d'URL). */
  onDefaultOpened?: () => void
}

type CopyState = 'idle' | 'copied' | 'failed'

const linkClass =
  'flex min-h-11 items-center justify-center rounded-xl text-base font-semibold text-orange-300 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400'

function AskSheet({
  kind,
  base,
  build,
  onClose,
}: {
  kind: ClaudeContextKind
  base: ClaudeBase | undefined
  build: (base: ClaudeBaseInput) => ClaudeMessage
  onClose: () => void
}) {
  const { coachUrl } = useCoachUrl()
  const [request, setRequest] = useState('')
  const [copy, setCopy] = useState<CopyState>('idle')
  const [opened, setOpened] = useState<boolean | null>(null)
  // Revérifié à l'ouverture : une valeur venue d'ailleurs (sauvegarde ancienne) ne doit jamais ouvrir un autre site.
  const url = coachUrl !== null && isAllowedCoachUrl(coachUrl) ? coachUrl : CLAUDE_DEFAULT_URL

  const message = useMemo(() => (base ? build({ ...base, request }) : null), [base, build, request])

  const copyAndOpen = async () => {
    if (!message) return
    // Le geste de l'utilisateur est celui de ce clic : `writeText` est lancé tout de suite (sans rien attendre
    // avant), puis la fenêtre s'ouvre juste après la copie. Voir le rapport J9 sur iOS.
    const ok = await copyToClipboard(message.text)
    if (!ok) {
      setCopy('failed')
      return
    }
    setCopy('copied')
    // Pas de 'noopener' : il ferait renvoyer toujours `null`, et on ne saurait plus si Safari a bloqué l'ouverture
    // (dans ce cas on affiche le lien « Ouvrir Claude »). Le lien avec l'ouvreur est coupé à la main.
    const win = window.open(url, '_blank')
    try {
      if (win) win.opener = null
    } catch {
      // fenêtre déjà passée sur un autre domaine : rien à couper
    }
    setOpened(win !== null)
  }

  const copyOnly = async () => {
    if (!message) return
    const ok = await copyToClipboard(message.text)
    setCopy(ok ? 'copied' : 'failed')
    setOpened(false)
  }

  return (
    <Sheet title="Demander à Claude" onClose={onClose}>
      {!base || !message ? (
        <ErrorNote>
          Il faut un profil et au moins une pesée pour préparer le message (ton poids sert aux objectifs).
        </ErrorNote>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="claude-request" className="mb-1.5 block text-sm font-medium text-zinc-300">
              Ta demande
            </label>
            <textarea
              id="claude-request"
              rows={3}
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              placeholder={DEFAULT_REQUESTS[kind]}
              className="w-full rounded-xl border border-v1-line bg-v1-surface-hi px-3 py-2.5 text-base text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400"
            />
            <p className="mt-1 text-sm text-zinc-400">Laisse vide pour poser la question proposée.</p>
          </div>
          <div>
            <label htmlFor="claude-message" className="mb-1.5 block text-sm font-medium text-zinc-300">
              Message qui sera copié (rien n’est envoyé avant que tu le colles dans Claude)
            </label>
            <textarea
              id="claude-message"
              readOnly
              rows={9}
              value={message.text}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-xl border border-v1-line bg-v1-surface-hi px-3 py-2.5 font-mono text-xs leading-relaxed text-zinc-200 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400"
            />
          </div>
          {copy === 'copied' ? (
            <SuccessNote>
              {opened
                ? 'Message copié. Colle-le dans Claude (appui long, puis Coller).'
                : 'Message copié. Ouvre Claude et colle-le (appui long, puis Coller).'}
            </SuccessNote>
          ) : null}
          {copy === 'failed' ? (
            <ErrorNote>
              Impossible de copier automatiquement. Appuie sur le message ci-dessus, « Tout sélectionner »
              puis « Copier », ou réessaie avec le bouton « Copier ».
            </ErrorNote>
          ) : null}
          <div className="flex flex-col gap-2">
            {copy === 'failed' ? (
              <Button onClick={() => void copyOnly()}>Copier</Button>
            ) : (
              <Button onClick={() => void copyAndOpen()}>Copier et ouvrir Claude</Button>
            )}
            {copy === 'failed' || (copy === 'copied' && opened === false) ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className={linkClass}>
                Ouvrir Claude
              </a>
            ) : null}
            <Link to={CLAUDE_RESPONSE_PATH} className={linkClass}>
              J’ai la réponse : coller la réponse
            </Link>
          </div>
        </div>
      )}
    </Sheet>
  )
}

/** Bouton « Demander à Claude » : ouvre l'aperçu du message, puis copie et ouvre le Projet Coach. */
export function AskClaudeButton({
  kind,
  build,
  label = 'Demander à Claude',
  className = '',
  defaultOpen = false,
  onDefaultOpened,
}: Props) {
  const [open, setOpen] = useState(false)
  const { base, ready } = useClaudeBase()
  // Ouverture automatique : pendant le rendu (pas dans un effet), puis l'appelant nettoie son paramètre d'URL.
  const [autoOpened, setAutoOpened] = useState(false)
  if (!defaultOpen && autoOpened) setAutoOpened(false)
  else if (defaultOpen && ready && build !== null && !autoOpened) {
    setAutoOpened(true)
    setOpen(true)
  }
  useEffect(() => {
    if (autoOpened) onDefaultOpened?.()
  }, [autoOpened, onDefaultOpened])
  return (
    <>
      <Button
        variant="secondary"
        className={className}
        disabled={build === null || !ready}
        aria-busy={!ready}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      {open && build ? (
        <AskSheet kind={kind} base={base} build={build} onClose={() => setOpen(false)} />
      ) : null}
    </>
  )
}
