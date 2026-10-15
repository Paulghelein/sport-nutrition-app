import { useEffect, useMemo, useState } from 'react'
import { getCiqualFood, getFoodRow, listCiqualFoods, listFoodRows } from '../../db'
import { buildFoodIndex, mergeFoods } from '../../domain/nutrition'
import type { FoodIndex } from '../../domain/nutrition'
import type { Food } from '../../types'
import { useLiveQuery } from '../../ui'
import { ensureCiqualLoaded } from './ciqualLoader'

export interface FoodsState {
  foods: Food[] | undefined
  index: FoodIndex | undefined
  /** Premier chargement de la base Ciqual en cours. */
  preparing: boolean
  error: unknown
  /** Relance le chargement de la base Ciqual après une erreur. */
  retry: () => void
}

/** Tous les aliments (Ciqual + surcharges + perso) et leur index de recherche, réactifs aux changements. */
export function useFoods(): FoodsState {
  const [attempt, setAttempt] = useState(0)
  const [prep, setPrep] = useState<{ ready: boolean; error: unknown }>({ ready: false, error: null })

  useEffect(() => {
    let alive = true
    ensureCiqualLoaded().then(
      () => alive && setPrep({ ready: true, error: null }),
      (error: unknown) => alive && setPrep({ ready: false, error }),
    )
    return () => {
      alive = false
    }
  }, [attempt])

  const live = useLiveQuery(
    async () => mergeFoods(await listCiqualFoods(), await listFoodRows()),
    [prep.ready],
  )
  const foods = live.data
  const index = useMemo(() => (foods ? buildFoodIndex(foods) : undefined), [foods])
  return {
    foods,
    index,
    preparing: !prep.ready && prep.error === null,
    error: prep.error ?? live.error,
    retry: () => {
      setPrep({ ready: false, error: null })
      setAttempt((n) => n + 1)
    },
  }
}

/** Un aliment par id : la ligne `foods` (perso, OFF, surcharge) gagne sur la table Ciqual. */
export async function loadFood(id: string): Promise<Food | undefined> {
  const row = await getFoodRow(id)
  if (row) return row
  const ciqual = await getCiqualFood(id)
  return ciqual ? mergeFoods([ciqual], [])[0] : undefined
}

export function useFood(id: string | undefined) {
  return useLiveQuery(async () => (id ? loadFood(id) : undefined), [id])
}
