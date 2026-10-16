import type { TabId } from '../../ui/kit'
import {
  COOK_PATH_PATTERN,
  GUIDED_PATH,
  HOME_PATH,
  NUTRITION_PATH,
  PROGRESS_PATH,
  SETTINGS_PATH,
  TRAINING_PATH,
} from '../routes'

const PREFIXES: readonly (readonly [string, TabId])[] = [
  [TRAINING_PATH, 'training'],
  [NUTRITION_PATH, 'nutrition'],
  [PROGRESS_PATH, 'progress'],
  [SETTINGS_PATH, 'today'],
]

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`)

/**
 * Onglet actif déduit du chemin (préfixe). Réglages s'ouvre depuis Aujourd'hui : on garde cet onglet allumé pour
 * ne pas laisser la barre sans repère. Les autres chemins (ex. /claude/reponse) n'allument rien.
 */
export function activeTab(pathname: string): TabId | null {
  if (pathname === HOME_PATH) return 'today'
  for (const [prefix, id] of PREFIXES) if (under(pathname, prefix)) return id
  return null
}

/**
 * Mode cuisine : plein écran, sans barre d'onglets. Le mode séance (`GUIDED_PATH`) est servi hors de `TabsLayout`
 * (App.tsx) et n'arrive donc jamais ici ; la branche reste par sécurité si la route changeait de place.
 */
export function hidesTabBar(pathname: string): boolean {
  return under(pathname, GUIDED_PATH) || COOK_PATH_PATTERN.test(pathname)
}

/** Seuls les écrans refaits en v2 sont en clair (canvas) ; les autres restent sombres (fond v1). */
export function usesCanvas(pathname: string): boolean {
  return pathname === HOME_PATH || under(pathname, PROGRESS_PATH)
}
