// Types de base partagés par tous les modules.

/** Jour calendaire local au format `YYYY-MM-DD` (jamais d'heure ni de fuseau). */
export type LocalDate = string

/** Instant au format ISO 8601 complet (`new Date().toISOString()`). */
export type IsoDateTime = string

/** Identifiant d'entité (UUID généré par `crypto.randomUUID()`, ou id lisible pour le contenu de départ). */
export type Id = string

/** Clé des enregistrements uniques (profil, matériel, réglages). */
export const SINGLETON_ID = 'me' as const
export type SingletonId = typeof SINGLETON_ID

/**
 * Origine d'un contenu.
 * - `seed` : fourni avec l'app (src/content/) ; une ligne `seed` en base est une surcharge de l'original.
 * - `user` : créé par l'utilisateur.
 */
export type ContentSource = 'seed' | 'user'

/** Intervalle fermé `[min, max]`. */
export type Range = [min: number, max: number]
