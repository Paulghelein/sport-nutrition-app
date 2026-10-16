// Scan de code-barres et Open Food Facts (J7, SPEC §4.4).
import type { Per100g } from './nutrition'

/** Code-barres normalisé (chiffres seuls, clé de contrôle vérifiée) : EAN-8 ou EAN-13 ; un UPC-A (12) est converti en EAN-13 (`0` + code) pour unifier le cache. */
export type Ean = string

/**
 * Produit extrait d'une réponse OFF `GET /api/v2/product/{ean}.json` (fonction pure `parseOffProduct`).
 * kcal : `energy-kcal_100g`, sinon `energy_100g` (kJ) / 4,184. Fibres facultatives.
 */
export interface OffProduct {
  ean: Ean
  name: string
  brand?: string
  per100g: Per100g
  /** `serving_quantity` en grammes quand il est cohérent (> 0, ≤ 1000) : portion proposée à la saisie. */
  servingG?: number
}

/**
 * Résultat d'une recherche de code-barres :
 * - `cached` : déjà en base (table `foods`, n'importe quelle source avec ce `ean`) — aucun appel réseau ;
 * - `found` : trouvé sur OFF avec kcal + 3 macros ; l'appelant l'enregistre en cache (`off-<ean>`) ;
 * - `incomplete` : produit OFF sans valeurs exploitables → formulaire de création pré-rempli (EAN, nom, marque) ;
 * - `not_found` : inconnu d'OFF (statut 0 ou HTTP 404) → formulaire pré-rempli avec l'EAN ;
 * - `error` : réseau absent, délai dépassé, réponse illisible → réessayer ou saisir à la main.
 */
export type OffLookupResult =
  | { status: 'cached'; foodId: string }
  | { status: 'found'; product: OffProduct }
  | { status: 'incomplete'; ean: Ean; name?: string; brand?: string }
  | { status: 'not_found'; ean: Ean }
  | { status: 'error'; ean: Ean; message: string }

/** Échec de démarrage de la caméra, traduit en message français par l'écran. */
export type ScanErrorKind =
  /** Permission refusée (NotAllowedError) : expliquer Réglages iOS → Safari → Caméra. */
  | 'permission_denied'
  /** Aucune caméra (NotFoundError / OverconstrainedError). */
  | 'no_camera'
  /** Page non servie en HTTPS (hors localhost) : `getUserMedia` indisponible. */
  | 'insecure_context'
  /** Navigateur sans `navigator.mediaDevices`. */
  | 'unsupported'
  /** Caméra occupée (NotReadableError) ou autre. */
  | 'unknown'
