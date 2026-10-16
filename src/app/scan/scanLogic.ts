// Logique pure du scan (testée) : traduction des erreurs caméra, anti-rebond, machine d'état de l'écran.
import type { Ean, Food, ScanErrorKind } from '../../types'

export interface CameraEnv {
  isSecureContext: boolean
  hasMediaDevices: boolean
}

/** Traduit l'échec de `getUserMedia` (ou son absence) en `ScanErrorKind`. */
export function classifyCameraError(err: unknown, env: CameraEnv): ScanErrorKind {
  if (!env.isSecureContext) return 'insecure_context'
  if (!env.hasMediaDevices) return 'unsupported'
  const name =
    typeof err === 'object' && err !== null && 'name' in err ? String((err as { name: unknown }).name) : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
    case 'PermissionDeniedError':
      return 'permission_denied'
    case 'NotFoundError':
    case 'OverconstrainedError':
    case 'DevicesNotFoundError':
      return 'no_camera'
    default:
      return 'unknown'
  }
}

export interface ScanErrorText {
  title: string
  body: string
}

export function scanErrorText(kind: ScanErrorKind): ScanErrorText {
  switch (kind) {
    case 'permission_denied':
      return {
        title: 'Caméra refusée',
        body: 'Réglages → Apps → Safari → Caméra : choisis « Demander » ou « Autoriser », puis ferme complètement Forge (glisse-la vers le haut dans le sélecteur d’apps) et rouvre-la.',
      }
    case 'no_camera':
      return {
        title: 'Aucune caméra trouvée',
        body: 'Cet appareil n’a pas de caméra utilisable. Saisis le code à la main.',
      }
    case 'insecure_context':
      return {
        title: 'Caméra indisponible',
        body: 'La caméra ne fonctionne que sur une page sécurisée (HTTPS). Saisis le code à la main.',
      }
    case 'unsupported':
      return {
        title: 'Navigateur non compatible',
        body: 'Ce navigateur ne sait pas ouvrir la caméra. Saisis le code à la main.',
      }
    case 'unknown':
      return {
        title: 'Caméra inaccessible',
        body: 'La caméra est peut-être utilisée par une autre application. Ferme-la puis réessaie, ou saisis le code à la main.',
      }
  }
}

/** Anti-rebond : un même code n'est accepté qu'une fois par fenêtre ; un autre code est accepté tout de suite. */
export function createScanGate(windowMs = 3000): (code: string, now: number) => boolean {
  let last: { code: string; at: number } | null = null
  return (code, now) => {
    if (last && last.code === code && now - last.at < windowMs) return false
    last = { code, at: now }
    return true
  }
}

export type ScanState =
  | { phase: 'scanning' }
  | { phase: 'lookup'; ean: Ean }
  | { phase: 'quantity'; food: Food }
  | { phase: 'error'; ean: Ean; message: string }
  | { phase: 'added'; name: string }

export type ScanAction =
  | { type: 'detected'; ean: Ean }
  | { type: 'resolved'; food: Food }
  | { type: 'failed'; ean: Ean; message: string }
  | { type: 'cancel' }
  | { type: 'added'; name: string }
  | { type: 'again' }

export function scanReducer(state: ScanState, action: ScanAction): ScanState {
  switch (action.type) {
    case 'detected':
      // Un seul déclenchement : ignoré si une recherche ou une saisie est déjà en cours.
      return state.phase === 'scanning' || state.phase === 'added' || state.phase === 'error'
        ? { phase: 'lookup', ean: action.ean }
        : state
    case 'resolved':
      return state.phase === 'lookup' || state.phase === 'scanning'
        ? { phase: 'quantity', food: action.food }
        : state
    case 'failed':
      return state.phase === 'lookup' ? { phase: 'error', ean: action.ean, message: action.message } : state
    case 'cancel':
      return state.phase === 'lookup' || state.phase === 'quantity' || state.phase === 'error'
        ? { phase: 'scanning' }
        : state
    case 'added':
      return { phase: 'added', name: action.name }
    case 'again':
      return { phase: 'scanning' }
  }
}
