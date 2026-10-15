import type { SessionDuration } from '../../types'

export const DURATIONS: readonly SessionDuration[] = [20, 30, 45, 60]

export function parseDuration(raw: string | null): SessionDuration {
  const n = Number(raw)
  return DURATIONS.find((d) => d === n) ?? 30
}

const KEY = 'sn:lastDuration'

/** Dernière durée choisie (sessionStorage), 30 min par défaut. Le stockage peut être indisponible. */
export function loadDuration(): SessionDuration {
  try {
    return parseDuration(sessionStorage.getItem(KEY))
  } catch {
    return 30
  }
}

export function saveDuration(d: SessionDuration): void {
  try {
    sessionStorage.setItem(KEY, String(d))
  } catch {
    // Sans importance : la durée n'est qu'un confort.
  }
}
