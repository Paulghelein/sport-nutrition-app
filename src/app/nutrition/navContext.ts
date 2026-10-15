import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

/**
 * Contexte repas/date de l'écran Ajouter, à propager vers la fiche, le formulaire et retour :
 * `search` vaut `?repas=…&date=…` (ou chaîne vide si l'URL n'en porte pas).
 */
export function useAddContext(): { search: string; addPath: string } {
  const [params] = useSearchParams()
  const next = new URLSearchParams()
  const repas = params.get('repas')
  const date = params.get('date')
  if (repas) next.set('repas', repas)
  if (date) next.set('date', date)
  const text = next.toString()
  const search = text ? `?${text}` : ''
  return { search, addPath: `/nutrition/ajouter${search}` }
}

/** Revient en arrière dans l'historique (pas de doublon d'écran) ; ouvert directement : `fallback`. */
export function useGoBack(): (fallback: string) => void {
  const navigate = useNavigate()
  const location = useLocation()
  return (fallback) => {
    // `idx` : position dans l'historique propre à l'app (0 = premier écran chargé, rien à quoi revenir).
    const idx: unknown = (window.history.state as { idx?: unknown } | null)?.idx
    if (location.key !== 'default' && typeof idx === 'number' && idx > 0) navigate(-1)
    else navigate(fallback, { replace: true })
  }
}

const SEED_KEY = 'food-search-seed'
/** Mémorise une recherche à pré-remplir au retour sur l'écran Ajouter (aliment tout juste créé). */
export const setSearchSeed = (q: string): void => sessionStorage.setItem(SEED_KEY, q)
export const peekSearchSeed = (): string => sessionStorage.getItem(SEED_KEY) ?? ''
export const clearSearchSeed = (): void => sessionStorage.removeItem(SEED_KEY)
