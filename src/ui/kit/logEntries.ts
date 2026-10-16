import { FilePlus, Video } from 'lucide-react'
import type { LogEntry } from './LogSheet'

/** Entrées « Créer » par défaut (F4 et F5, R3). */
export const DEFAULT_CREATE_ENTRIES: readonly LogEntry[] = [
  { action: 'recipe-from-scan', label: 'Recette par scan', Icon: FilePlus },
  { action: 'recipe-from-video', label: 'Recette d’une vidéo', Icon: Video },
]
