// Petits utilitaires partagés par sessions.ts et nutrition.ts.
import type { IsoDateTime } from '../types'

/** Erreur de validation dont le message (français) est affichable tel quel. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export const nowIso = (): IsoDateTime => new Date().toISOString()
export const newId = (): string => crypto.randomUUID()

/** Lève une `ValidationError` si `message` n'est pas `null`. */
export function fail(message: string | null): void {
  if (message !== null) throw new ValidationError(message)
}
