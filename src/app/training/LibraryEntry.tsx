import { EntryCard } from './parts'
import { useLibrary } from './useLibrary'

/** Entrée « Bibliothèque d'exercices » de l'écran Séance (chargée à la demande : le contenu reste hors du démarrage). */
export default function LibraryEntry() {
  const { data } = useLibrary()
  const count = data ? data.library.filter((e) => e.preference !== 'hidden').length : null
  return <EntryCard count={count} />
}
