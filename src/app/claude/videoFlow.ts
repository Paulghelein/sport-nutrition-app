// Parcours « Recette d'une vidéo » (F5) : logique pure, sans React ni DOM.
import { extractVideoLink } from '../../domain/claude/videoLink'
import type { VideoLink, VideoPlatform } from '../../types/claude'
import type { ClipboardRead } from './clipboard'

export const PLATFORM_LABEL: Record<VideoPlatform, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  other: 'Autre site',
}

export type LinkState = { status: 'empty' } | { status: 'invalid' } | { status: 'ok'; link: VideoLink }

/** État du lien d'après le texte collé : vide, sans lien valide, ou lien nettoyé. */
export function linkState(text: string): LinkState {
  if (text.trim() === '') return { status: 'empty' }
  const link = extractVideoLink(text)
  return link === null ? { status: 'invalid' } : { status: 'ok', link }
}

export const INVALID_LINK_MESSAGE =
  'Aucun lien de vidéo trouvé dans ce texte. Le lien doit commencer par https://. Copie-le depuis « Partager » puis « Copier le lien ».'

const FAILURE_MESSAGE = {
  unavailable:
    'Ton navigateur ne permet pas de lire le presse-papiers. Colle le lien dans la zone ci-dessous.',
  denied: 'Lecture du presse-papiers refusée. Colle le lien à la main dans la zone ci-dessous.',
  empty:
    'Le presse-papiers est vide. Copie d’abord le lien de la vidéo, ou colle-le dans la zone ci-dessous.',
} as const

/** Suite à donner au bouton « Coller le lien » : texte à garder, ou zone de collage avec un message. */
export function pasteOutcome(read: ClipboardRead): {
  text: string | null
  showArea: boolean
  notice: string | null
} {
  if (!read.ok) return { text: null, showArea: true, notice: FAILURE_MESSAGE[read.reason] }
  const state = linkState(read.text)
  return {
    text: read.text,
    showArea: state.status !== 'ok',
    notice: state.status === 'ok' ? null : INVALID_LINK_MESSAGE,
  }
}
