import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { UpdatePrompt } from '../../ui/UpdatePrompt'
import { TabBar } from '../../ui/kit'
import type { TabId } from '../../ui/kit'
import { HOME_PATH, NUTRITION_PATH, PROGRESS_PATH, TRAINING_PATH } from '../routes'
import { AddHost } from './AddHost'
import { activeTab, hidesTabBar } from './activeTab'
import { transitionFor } from './pageTransition'

const HREFS: Record<TabId, string> = {
  today: HOME_PATH,
  training: TRAINING_PATH,
  nutrition: NUTRITION_PATH,
  progress: PROGRESS_PATH,
}

/** Place laissée en bas de l'écran à la barre flottante (≈ 112 px + zone de sécurité). */
const BAR_CLEARANCE = 'calc(7rem + env(safe-area-inset-bottom))'
const NO_BAR_CLEARANCE = 'calc(2rem + env(safe-area-inset-bottom))'

/**
 * Mise en page à onglets : `<main>` est le seul élément qui défile (décision J4/J5), la barre du kit est `fixed`
 * et flotte par-dessus. Le fond de `<main>` est le canvas v2, pour ne laisser
 * aucune bande de couleur au rebond iOS. Barre masquée en mode cuisine ; le mode séance a sa propre mise en page.
 */
export function TabsLayout({ children }: { children: ReactNode }) {
  const mainRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  const navType = useNavigationType()
  const [addOpen, setAddOpen] = useState(false)
  const showBar = !hidesTabBar(pathname)
  const clearance = showBar ? BAR_CLEARANCE : NO_BAR_CLEARANCE

  // Transition d'entrée : calculée au changement de chemin (état dérivé pendant le rendu). `n` ne change que
  // pour un glissement ; sa parité choisit l'un des deux noms d'animation (voir index.css), ce qui relance l'animation
  // CSS sans démonter la page. Les autres navigations n'animent rien.
  const [page, setPage] = useState({ path: pathname, slide: false, n: 0 })
  if (page.path !== pathname) {
    const slide = transitionFor(page.path, pathname, navType) === 'slide'
    setPage({ path: pathname, slide, n: slide ? page.n + 1 : page.n })
  }

  // On remet <main> en haut à chaque changement d'écran (la query et le hash ne comptent pas : ancres gérées par l'écran).
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [pathname])

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      // `--bar-clearance` : place réservée en bas (remplissage de <main>, position du toast d'ajout). Les zones
      // collantes (`sticky bottom-0`) n'en ajoutent rien : Chromium et WebKit mesurent `sticky` depuis le contenu, remplissage exclu (à confirmer sur iPhone).
      style={{ '--bar-clearance': clearance } as CSSProperties}
    >
      <main
        ref={mainRef}
        className="ds-page relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain ds-main-pad"
        style={{ paddingBottom: clearance }}
      >
        <div className="mx-auto max-w-xl">
          {/* Enveloppe animée (jamais <main>) : ds-page-slide ne laisse aucun transform une fois terminée. */}
          <div className={page.slide ? (page.n % 2 === 0 ? 'ds-page-slide' : 'ds-page-slide-b') : undefined}>
            {children}
          </div>
        </div>
      </main>
      {/* Invite de mise à jour : `fixed` en haut de l'écran (sous la zone de sécurité), jamais sur la barre ni sur les zones collantes du bas. */}
      <UpdatePrompt />
      {showBar && (
        <>
          <TabBar current={activeTab(pathname)} hrefs={HREFS} onPlus={() => setAddOpen(true)} />
          <AddHost open={addOpen} onClose={() => setAddOpen(false)} />
        </>
      )}
    </div>
  )
}
