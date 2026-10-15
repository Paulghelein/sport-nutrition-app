// Petits utilitaires partagés par sessions.ts et nutrition.ts.
import type { IsoDateTime } from '../types'
import { ValidationError } from './repositories'

export const nowIso = (): IsoDateTime => new Date().toISOString()
export const newId = (): string => crypto.randomUUID()

/** Lève une `ValidationError` si `message` n'est pas `null`. */
export function fail(message: string | null): void {
  if (message !== null) throw new ValidationError(message)
}
