import { useEffect, useMemo, useState } from 'react'
import { getProfile, getSettings, listExerciseStates, listSessions } from '../../db'
import { toLocalDate } from '../../domain/shared'
import type { EngineInput } from '../../types'
import { useLiveQuery } from '../../ui'
import { useLibrary } from './useLibrary'

/** Entrées du moteur sans la durée (choisie par l'écran). */
export type EngineBase = Omit<EngineInput, 'durationMin'>

/**
 * Assemble les entrées du moteur à partir des requêtes live (bibliothèque, matériel, profil, états, séances, réglages).
 * `data` est `undefined` tant que tout n'est pas chargé. Importe le contenu embarqué : à n'utiliser que depuis des écrans lazy.
 */
export function useEngineInput(): { data: EngineBase | undefined; error: unknown } {
  const lib = useLibrary()
  // Date figée à l'ouverture de l'écran (sert aussi de graine : le plan ne change pas en cours de lecture).
  const [date, setDate] = useState(() => toLocalDate(new Date()))
  // Retour au premier plan (app restée ouverte la nuit) : on recalcule le jour.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setDate(toLocalDate(new Date()))
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
  const rest = useLiveQuery(async () => {
    const [profile, states, sessions, settings] = await Promise.all([
      getProfile(),
      listExerciseStates(),
      listSessions(),
      getSettings(),
    ])
    return { profile, states, sessions, settings }
  }, [])
  const data = useMemo<EngineBase | undefined>(() => {
    if (!lib.data || !rest.data?.profile) return undefined
    return {
      date,
      profileLevel: rest.data.profile.level,
      equipment: lib.data.equipment,
      library: lib.data.library,
      states: rest.data.states,
      sessions: rest.data.sessions,
      settings: rest.data.settings.engine,
    }
  }, [lib.data, rest.data, date])
  const profileMissing = rest.data !== undefined && !rest.data.profile
  const error = lib.error ?? rest.error ?? (profileMissing ? new Error('Profil absent') : null)
  return { data, error }
}
