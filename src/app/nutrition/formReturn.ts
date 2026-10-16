import { RECIPE_SCAN_PATH } from '../routes'

/** Écrans autorisés à recevoir l'aliment créé (liste blanche : jamais une URL ou un chemin arbitraire). */
const ALLOWED_RETURNS: readonly string[] = [RECIPE_SCAN_PATH]

/** Paramètre `retour` du formulaire d'aliment : le chemin s'il est exactement dans la liste blanche, sinon null. */
export function allowedReturn(raw: string | null): string | null {
  return raw !== null && ALLOWED_RETURNS.includes(raw) ? raw : null
}

/** Destination après enregistrement (`?ajout=<id>`) ou annulation (sans `ajout`). */
export function returnTarget(path: string, createdId?: string): string {
  return createdId === undefined ? path : `${path}?ajout=${encodeURIComponent(createdId)}`
}
