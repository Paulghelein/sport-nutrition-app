import { useMemo } from 'react'
import { getSession, listSessions } from '../../db'
import { summarizeSession } from '../../domain/training'
import type { Equipment, LibraryExercise, Session } from '../../types'
import type { SessionSummary } from '../../types/guided'
import { useLiveQuery } from '../../ui'
import { useLibrary } from './useLibrary'

export interface SessionData {
  session: Session | undefined
  summary: SessionSummary | undefined
  library: LibraryExercise[]
  equipment: Equipment | undefined
  names: Map<string, string>
}

/** Séance + récapitulatif (records comparés aux séances terminées antérieures) ; se met à jour avec la base. */
export function useSessionSummary(id: string): {
  data: SessionData | undefined
  notFound: boolean
  error: unknown
} {
  const lib = useLibrary()
  const q = useLiveQuery(async () => {
    const [session, sessions] = await Promise.all([getSession(id), listSessions()])
    return { session, sessions }
  }, [id])
  const data = useMemo<SessionData | undefined>(() => {
    if (!lib.data || !q.data) return undefined
    const { session, sessions } = q.data
    return {
      session,
      summary: session ? summarizeSession(session, lib.data.library, sessions) : undefined,
      library: lib.data.library,
      equipment: lib.data.equipment,
      names: new Map(lib.data.library.map((e) => [e.id, e.name])),
    }
  }, [lib.data, q.data])
  return { data, notFound: data !== undefined && data.session === undefined, error: lib.error ?? q.error }
}
