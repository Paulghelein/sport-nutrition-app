/** Logique pure (sans React) du réglage de la caméra de scan : choix de l'objectif et capacités de la piste. */

export const STORAGE_KEY = 'scan.cameraDeviceId'

export const BASE_VIDEO: MediaTrackConstraints = {
  width: { ideal: 1920 },
  height: { ideal: 1080 },
}

/** Contraintes par défaut : caméra arrière, haute définition. */
export function facingConstraints(): MediaStreamConstraints {
  return { audio: false, video: { ...BASE_VIDEO, facingMode: { ideal: 'environment' } } }
}

/** Contraintes pour un appareil précis (exact : échoue plutôt que de changer d'objectif). */
export function deviceConstraints(deviceId: string): MediaStreamConstraints {
  return { audio: false, video: { ...BASE_VIDEO, deviceId: { exact: deviceId } } }
}

/** Capacités absentes de lib.dom. */
export interface ExtendedCapabilities extends MediaTrackCapabilities {
  focusMode?: string[]
  zoom?: { min: number; max: number; step?: number }
  torch?: boolean
}

interface ExtendedConstraintSet extends MediaTrackConstraintSet {
  focusMode?: string
  zoom?: number
  torch?: boolean
}

const FRONT = /\b(front|avant|frontale?)\b/i
const BACK = /(back|arrière|arriere|rear)/i

/** Rang de préférence d'un libellé d'appareil multi-objectifs (0 = meilleur), null si ce n'en est pas un. */
export function multiLensRank(label: string): number | null {
  if (!label || FRONT.test(label) || !BACK.test(label)) return null
  const l = label.toLowerCase()
  if (/triple/.test(l)) return 0
  if (/(dual|double)/.test(l) && /(wide|grand)/.test(l)) return 1
  if (/(dual|double)/.test(l)) return 2
  return null
}

/** Meilleur `videoinput` arrière multi-objectifs, ou null. */
export function pickMultiLensDevice(devices: readonly MediaDeviceInfo[]): MediaDeviceInfo | null {
  let best: { d: MediaDeviceInfo; rank: number } | null = null
  for (const d of devices) {
    if (d.kind !== 'videoinput' || !d.deviceId) continue
    const rank = multiLensRank(d.label)
    if (rank !== null && (best === null || rank < best.rank)) best = { d, rank }
  }
  return best?.d ?? null
}

/**
 * Mise au point continue + zoom 2× (ramené dans la plage [min, max]). Hypothèse : sur la caméra virtuelle iOS
 * multi-objectifs, zoom 1 = ultra grand-angle (0,5×), le code serait minuscule à 15–20 cm sans zoom ; iOS bascule
 * de lui-même en macro de près. Un seul `applyConstraints` ; s'il lève, chaque réglage est retenté seul.
 * Retourne les réglages réellement appliqués (à renvoyer avec `{ torch }`, voir `setTorch`). Ne lève jamais.
 */
export async function tuneTrack(track: MediaStreamTrack): Promise<MediaTrackConstraintSet[]> {
  let caps: ExtendedCapabilities
  try {
    caps = (track.getCapabilities?.() ?? {}) as ExtendedCapabilities
  } catch {
    return []
  }
  const wanted: ExtendedConstraintSet[] = []
  if (caps.focusMode?.includes('continuous')) wanted.push({ focusMode: 'continuous' })
  const z = caps.zoom
  if (z && Number.isFinite(z.min) && Number.isFinite(z.max) && z.max > z.min) {
    wanted.push({ zoom: Math.min(z.max, Math.max(z.min, 2)) })
  }
  if (wanted.length === 0) return []
  try {
    await track.applyConstraints({ advanced: wanted })
    return wanted
  } catch {
    const kept: ExtendedConstraintSet[] = []
    for (const c of wanted) {
      try {
        await track.applyConstraints({ advanced: [c] })
        kept.push(c)
      } catch {
        // contrainte refusée : le scan continue sans
      }
    }
    return kept
  }
}

export function supportsTorch(track: MediaStreamTrack): boolean {
  try {
    return (track.getCapabilities?.() as ExtendedCapabilities | undefined)?.torch === true
  } catch {
    return false
  }
}

/** Allume/éteint la lampe en renvoyant les réglages (zoom, mise au point) pour ne pas les perdre. */
export async function setTorch(
  track: MediaStreamTrack,
  on: boolean,
  settings: readonly MediaTrackConstraintSet[] = [],
): Promise<void> {
  await track.applyConstraints({ advanced: [...settings, { torch: on } as ExtendedConstraintSet] })
}

/** Erreur « cet appareil n'est plus utilisable » (id mémorisé périmé). */
export function isDeviceGone(e: unknown): boolean {
  const name = (e as { name?: unknown } | null)?.name
  return name === 'OverconstrainedError' || name === 'NotFoundError'
}

export function readRememberedDevice(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function rememberDevice(id: string | null): void {
  try {
    if (id) localStorage.setItem(STORAGE_KEY, id)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // stockage indisponible
  }
}
