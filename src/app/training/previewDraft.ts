// Édition de l'aperçu gardée en sessionStorage tant qu'on reste sur la même séance proposée (même jour, même durée
// ou même modèle) : un aller-retour vers une fiche d'exercice ne perd pas les modifications.
import type { SessionBlock } from '../../types'

const KEY = 'forge:preview-edit'

interface Stored {
  key: string
  blocks: SessionBlock[]
}

function isBlocks(v: unknown): v is SessionBlock[] {
  return (
    Array.isArray(v) &&
    v.every((b) => {
      if (typeof b !== 'object' || b === null) return false
      const r = b as Record<string, unknown>
      return (
        typeof r['id'] === 'string' &&
        (r['kind'] === 'single' || r['kind'] === 'superset' || r['kind'] === 'finisher') &&
        Array.isArray(r['exercises']) &&
        r['exercises'].every((e) => {
          if (typeof e !== 'object' || e === null) return false
          const x = e as Record<string, unknown>
          return (
            typeof x['exerciseId'] === 'string' &&
            typeof x['restSec'] === 'number' &&
            Array.isArray(x['sets'])
          )
        })
      )
    })
  )
}

/** Édition enregistrée pour cette séance proposée, ou `null`. */
export function loadPreviewEdit(key: string): SessionBlock[] | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const stored = parsed as Partial<Stored>
    return stored.key === key && isBlocks(stored.blocks) ? stored.blocks : null
  } catch {
    return null
  }
}

export function savePreviewEdit(key: string, blocks: SessionBlock[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ key, blocks } satisfies Stored))
  } catch {
    // Stockage indisponible : l'édition n'est simplement pas conservée.
  }
}

export function clearPreviewEdit(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Rien à faire.
  }
}
