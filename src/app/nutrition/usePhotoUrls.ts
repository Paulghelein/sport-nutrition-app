import { useEffect, useRef, useState } from 'react'
import { getFoodPhotos } from '../../db'
import type { Id } from '../../types'
import { useLiveQuery } from '../../ui'

const NONE: ReadonlyMap<Id, string> = new Map()
/** Délai avant de révoquer une URL remplacée : laisse le rendu suivant retirer l'ancienne image (pas de clignotement). */
const REVOKE_DELAY_MS = 300

interface Held {
  url: string
  /** Empreinte de la photo (date de récupération + taille) : change quand la photo est remplacée. */
  stamp: string
}

/**
 * Photos des aliments (Open Food Facts, stockées dans Dexie) sous forme d'URL d'objet : `foodId` -> `blob:…`.
 * Seules les photos nouvelles ou modifiées reçoivent une nouvelle URL (une liste qui change garde les URL inchangées) ;
 * une URL retirée ou remplacée est révoquée peu après, toutes le sont au démontage (pas de fuite).
 */
export function usePhotoUrls(foodIds: readonly Id[]): ReadonlyMap<Id, string> {
  // Clé stable : l'identité du tableau change à chaque rendu, son contenu non.
  const key = [...new Set(foodIds)].sort().join('|')
  const { data } = useLiveQuery(() => getFoodPhotos(key === '' ? [] : key.split('|')), [key])
  const [urls, setUrls] = useState<ReadonlyMap<Id, string>>(NONE)
  // Map modifiée sur place (jamais remplacée) : le nettoyage au démontage voit toujours l'état courant.
  const held = useRef(new Map<Id, Held>())

  useEffect(() => {
    const map = held.current
    const stale: string[] = []
    const next = new Map<Id, string>()
    for (const [id, photo] of data ?? []) {
      const stamp = `${photo.fetchedAt}/${photo.bytes.byteLength}/${photo.mime}`
      const existing = map.get(id)
      if (existing && existing.stamp === stamp) {
        next.set(id, existing.url)
        continue
      }
      if (existing) stale.push(existing.url)
      const url = URL.createObjectURL(new Blob([photo.bytes], { type: photo.mime }))
      map.set(id, { url, stamp })
      next.set(id, url)
    }
    for (const [id, h] of [...map]) {
      if (!next.has(id)) {
        stale.push(h.url)
        map.delete(id)
      }
    }
    // Les URL ne peuvent être créées qu'ici (effet de bord à nettoyer) : le setState suit donc la création.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrls(next.size === 0 ? NONE : next)
    if (stale.length === 0) return
    const timer = setTimeout(() => stale.forEach((u) => URL.revokeObjectURL(u)), REVOKE_DELAY_MS)
    return () => {
      // Démontage ou nouvelle photo avant l'échéance : on révoque tout de suite.
      clearTimeout(timer)
      stale.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [data])

  useEffect(() => {
    const map = held.current
    return () => {
      for (const h of map.values()) URL.revokeObjectURL(h.url)
      map.clear()
    }
  }, [])

  return urls
}
