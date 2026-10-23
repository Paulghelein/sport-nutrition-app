import { HOME_PATH, NUTRITION_PATH, PROGRESS_PATH, TRAINING_PATH } from '../routes'
import { hidesTabBar } from './activeTab'

export type PageTransition = 'slide' | 'none'
export type NavigationKind = 'PUSH' | 'POP' | 'REPLACE'

/** Racines des onglets (et des sections de Nutrition) : profondeur 0. */
const ROOTS: readonly string[] = [
  HOME_PATH,
  TRAINING_PATH,
  NUTRITION_PATH,
  `${NUTRITION_PATH}/recettes`,
  `${NUTRITION_PATH}/frigo`,
  `${NUTRITION_PATH}/courses`,
  PROGRESS_PATH,
]

const clean = (pathname: string): string => (pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname)

/** Profondeur d'un chemin : 0 pour une racine d'onglet, sinon le nombre de segments. */
export function routeDepth(pathname: string): number {
  const p = clean(pathname)
  if (ROOTS.includes(p)) return 0
  return p.split('/').filter(Boolean).length
}

/**
 * Plein écran : mode séance, mode cuisine et recette par scan ne glissent jamais (leur feuille `fixed` serait
 * emportée par l'enveloppe transformée pendant l'animation, puis sauterait à sa place).
 */
function immersive(pathname: string): boolean {
  return hidesTabBar(clean(pathname))
}

/**
 * Transition d'entrée d'un écran (DESIGN §3) : glissement depuis la droite seulement pour une navigation PUSH vers une
 * route plus profonde (détail, formulaire, sous-section, Réglages). Retour (POP), remplacement, changement d'onglet
 * (toujours vers une racine) et écrans de même niveau : aucune animation (comme une barre d'onglets iOS).
 * Un PUSH vers une route moins profonde ou de même profondeur (ex. fiche recette → /claude/reponse) ne glisse pas non plus.
 */
export function transitionFor(from: string, to: string, navType: NavigationKind): PageTransition {
  if (navType !== 'PUSH' || clean(from) === clean(to) || immersive(to)) return 'none'
  return routeDepth(to) > routeDepth(from) ? 'slide' : 'none'
}
