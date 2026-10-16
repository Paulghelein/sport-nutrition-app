// Presse-papiers (J9) : copie avec repli, lecture avec raison de l'échec. Aucune dépendance : importable partout.

/** Repli quand l'API asynchrone est absente ou refusée (ancien WebKit, contexte non sécurisé). */
function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  area.setSelectionRange(0, text.length)
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}

/**
 * Copie `text`. `writeText` est appelé tout de suite (donc dans le geste de l'utilisateur) ; le résultat est
 * attendu ensuite. `false` = échec : l'appelant affiche un message et laisse l'utilisateur copier à la main.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // refus ou API indisponible : repli ci-dessous
  }
  return legacyCopy(text)
}

export type ClipboardRead =
  { ok: true; text: string } | { ok: false; reason: 'unavailable' | 'denied' | 'empty' }

/** Lit le presse-papiers (à appeler dans un geste de l'utilisateur ; iOS affiche alors sa bulle « Coller »). */
export async function readFromClipboard(): Promise<ClipboardRead> {
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.readText !== 'function') {
    return { ok: false, reason: 'unavailable' }
  }
  try {
    const text = await navigator.clipboard.readText()
    return text.trim() === '' ? { ok: false, reason: 'empty' } : { ok: true, text }
  } catch {
    return { ok: false, reason: 'denied' }
  }
}

export const CLIPBOARD_READ_MESSAGE: Record<'unavailable' | 'denied' | 'empty', string> = {
  unavailable:
    'Ton navigateur ne permet pas de lire le presse-papiers. Colle la réponse dans la zone ci-dessous.',
  denied: 'Lecture du presse-papiers refusée. Colle la réponse à la main dans la zone ci-dessous.',
  empty:
    'Le presse-papiers est vide. Copie d’abord la réponse de Claude, ou colle-la dans la zone ci-dessous.',
}
