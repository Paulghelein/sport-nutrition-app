import { useMemo } from 'react'
import { getEquipment, getProfile, getSettings, listWeighIns } from '../../db'
import { useLiveQuery } from '../../ui'
import { useToday } from '../progress/useToday'
import { claudeBase } from './inputs'
import type { ClaudeBase } from './inputs'

/**
 * Profil, matériel et objectifs du jour pour les messages « Demander à Claude ».
 * `base` est `undefined` tant que les données se chargent ; `ready` distingue « en cours » de « pas de pesée ».
 */
export function useClaudeBase(): { base: ClaudeBase | undefined; ready: boolean } {
  const today = useToday()
  const { data } = useLiveQuery(async () => {
    const [profile, equipment, weighIns] = await Promise.all([getProfile(), getEquipment(), listWeighIns()])
    return { profile, equipment, weighIns }
  }, [])
  const base = useMemo(() => (data ? claudeBase({ ...data, today }) : undefined), [data, today])
  return { base, ready: data !== undefined }
}

/** URL du Projet « Coach » (`Settings.coachUrl`) ; `null` = pas réglée. `loaded` : lecture terminée. */
export function useCoachUrl(): { coachUrl: string | null; loaded: boolean } {
  const { data } = useLiveQuery(() => getSettings(), [])
  return { coachUrl: data?.coachUrl ?? null, loaded: data !== undefined }
}
