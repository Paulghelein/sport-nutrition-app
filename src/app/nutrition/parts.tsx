import type { ReactNode } from 'react'

/**
 * Zone collante en bas de la zone qui défile (jamais `fixed`). `sticky` se mesure depuis le bord du CONTENU de <main>
 * (remplissage exclu) : le remplissage du bas réserve déjà la place de la barre, donc pas de décalage de barre ici.
 * Empile le message (`Toast` de `JournalToast`) au-dessus du bouton d'action.
 */
export function StickyStack({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-2 z-10 flex flex-col">{children}</div>
}
