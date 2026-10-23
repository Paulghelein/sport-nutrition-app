import { useEffect, useState } from 'react'
import type { DependencyList } from 'react'
import { observe } from '../db'

export interface LiveQueryState<T> {
  data: T | undefined
  error: unknown
  loading: boolean
}

/**
 * Abonne le composant à une requête Dexie : se met à jour à chaque changement des tables lues,
 * se désabonne au démontage ou quand `deps` change. L'ancienne valeur est conservée pendant un rechargement et en cas d'erreur.
 */
export function useLiveQuery<T>(query: () => Promise<T>, deps: DependencyList): LiveQueryState<T> {
  const [state, setState] = useState<LiveQueryState<T>>({ data: undefined, error: null, loading: true })

  useEffect(
    () => {
      // Nouvelle requête : on repasse en chargement (setState dans un callback différé, pas dans le corps de l'effet).
      const timer = setTimeout(
        () => setState((prev) => (prev.loading ? prev : { ...prev, loading: true })),
        0,
      )
      const stop = observe(
        query,
        (data) => {
          clearTimeout(timer)
          setState({ data, error: null, loading: false })
        },
        (error) => {
          clearTimeout(timer)
          setState((prev) => ({ data: prev.data, error, loading: false }))
        },
      )
      return () => {
        clearTimeout(timer)
        stop()
      }
    },
    // `query` est volontairement absent : les dépendances réelles sont passées par l'appelant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  )

  return state
}
