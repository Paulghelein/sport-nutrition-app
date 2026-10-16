import { useCallback, useState } from 'react'
import { resolveCoachUrl } from './bridge'
import { copyToClipboard } from './clipboard'
import { useCoachUrl } from './useClaudeBase'

export type CopyState = 'idle' | 'copied' | 'failed'

/**
 * Pont « copier le message puis ouvrir Claude » (SPEC §10.1), partagé par la feuille « Demander à Claude » et l'écran
 * « Recette d'une vidéo ». `copyAndOpen` doit être appelé directement par un tap : `writeText` part tout de suite
 * (dans le geste), la fenêtre s'ouvre juste après la copie. Rien n'est envoyé : l'utilisateur colle lui-même.
 */
export function useClaudeBridge(text: string | null) {
  const { coachUrl } = useCoachUrl()
  const [copy, setCopy] = useState<CopyState>('idle')
  const [opened, setOpened] = useState<boolean | null>(null)
  // Revérifié à chaque rendu : une valeur venue d'ailleurs (sauvegarde ancienne) ne doit jamais ouvrir un autre site.
  const url = resolveCoachUrl(coachUrl)

  const copyAndOpen = useCallback(async () => {
    if (text === null) return
    const ok = await copyToClipboard(text)
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
  }, [text, url])

  const copyOnly = useCallback(async () => {
    if (text === null) return
    const ok = await copyToClipboard(text)
    setCopy(ok ? 'copied' : 'failed')
    setOpened(false)
  }, [text])

  const reset = useCallback(() => {
    setCopy('idle')
    setOpened(null)
  }, [])

  return { url, copy, opened, copyAndOpen, copyOnly, reset }
}
