import { Suspense, lazy, useEffect, useRef } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { getSettings, requestPersistentStorage } from '../db'
import { TabBar, useLiveQuery } from '../ui'
import { UpdatePrompt } from '../ui/UpdatePrompt'
import { Onboarding } from './Onboarding'
import { GUIDED_PATH } from './routes'
import { ProgressScreen } from './screens/ProgressScreen'
import { SessionScreen } from './screens/SessionScreen'
import { SettingsScreen } from './screens/SettingsScreen'

// Écrans de la bibliothèque chargés à la demande : `src/content` (exercices, SVG) reste hors du démarrage.
const LibraryScreen = lazy(() => import('./training/LibraryScreen'))
const ExerciseScreen = lazy(() => import('./training/ExerciseScreen'))
const ExerciseFormScreen = lazy(() => import('./training/ExerciseFormScreen'))
const PreviewScreen = lazy(() => import('./training/PreviewScreen'))
const DeletedScreen = lazy(() => import('./training/DeletedScreen'))
// J4 — séance guidée (plein écran, sans barre d'onglets), récapitulatif, historique, modèles.
const GuidedScreen = lazy(() => import('./training/GuidedScreen'))
const RecapScreen = lazy(() => import('./training/RecapScreen'))
const HistoryScreen = lazy(() => import('./training/HistoryScreen'))
const HistoryDetailScreen = lazy(() => import('./training/HistoryDetailScreen'))
const TemplatesScreen = lazy(() => import('./training/TemplatesScreen'))
// J5 — journal alimentaire.
const JournalScreen = lazy(() => import('./nutrition/JournalScreen'))
const AddFoodScreen = lazy(() => import('./nutrition/AddFoodScreen'))
const FoodScreen = lazy(() => import('./nutrition/FoodScreen'))
const FoodFormScreen = lazy(() => import('./nutrition/FoodFormScreen'))

function Tabs() {
  const mainRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  // <main> est le seul élément qui défile (et le bloc conteneur des éléments `absolute`, ex. radios sr-only :
  // sinon ils allongent le document et iOS le fait défiler au focus, ce qui décale la barre d’onglets).
  // On le remet en haut à chaque changement d’écran.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0)
  }, [pathname])

  return (
    <>
      <main
        ref={mainRef}
        className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
          paddingBottom: '2rem',
          paddingLeft: 'calc(env(safe-area-inset-left) + 1rem)',
          paddingRight: 'calc(env(safe-area-inset-right) + 1rem)',
        }}
      >
        <div className="mx-auto max-w-xl">
          <Suspense fallback={<div aria-busy="true" className="min-h-40" />}>
            <Routes>
              <Route path="/seance" element={<SessionScreen />} />
              <Route path="/seance/apercu" element={<PreviewScreen />} />
              <Route path="/seance/exercices" element={<LibraryScreen />} />
              <Route path="/seance/exercices/nouveau" element={<ExerciseFormScreen />} />
              <Route path="/seance/exercices/supprimes" element={<DeletedScreen />} />
              <Route path="/seance/exercices/:id" element={<ExerciseScreen />} />
              <Route path="/seance/exercices/:id/modifier" element={<ExerciseFormScreen />} />
              <Route path="/seance/recap/:id" element={<RecapScreen />} />
              <Route path="/seance/historique" element={<HistoryScreen />} />
              <Route path="/seance/historique/:id" element={<HistoryDetailScreen />} />
              <Route path="/seance/modeles" element={<TemplatesScreen />} />
              <Route path="/nutrition" element={<JournalScreen />} />
              <Route path="/nutrition/ajouter" element={<AddFoodScreen />} />
              <Route path="/nutrition/aliments/nouveau" element={<FoodFormScreen />} />
              <Route path="/nutrition/aliments/:id" element={<FoodScreen />} />
              <Route path="/nutrition/aliments/:id/modifier" element={<FoodFormScreen />} />
              <Route path="/progres" element={<ProgressScreen />} />
              <Route path="/reglages" element={<SettingsScreen />} />
              <Route path="*" element={<Navigate to="/seance" replace />} />
            </Routes>
          </Suspense>
        </div>
      </main>
      <UpdatePrompt />
      <TabBar />
    </>
  )
}

/** Mode guidé : plein écran, sans barre d'onglets ni invite de mise à jour (l'écran gère ses safe areas). */
function Guided() {
  return (
    <Suspense fallback={<div aria-busy="true" className="flex-1" />}>
      <GuidedScreen />
    </Suspense>
  )
}

/** Délai avant de préparer la base d'aliments en tâche de fond (après l'affichage du premier écran). */
const CIQUAL_PRELOAD_DELAY_MS = 2000

function Shell() {
  // Premier lancement (ou nouvelle version de Ciqual) : chargement dans Dexie en tâche de fond, pour que le journal
  // soit prêt quand on l'ouvre. Module et JSON chargés à la demande : rien dans le bundle de démarrage.
  useEffect(() => {
    const timer = setTimeout(() => {
      import('./nutrition/ciqualLoader')
        .then((m) => m.ensureCiqualLoaded())
        .catch((e: unknown) => console.warn('Préparation de la base d’aliments reportée', e))
    }, CIQUAL_PRELOAD_DELAY_MS)
    return () => clearTimeout(timer)
  }, [])

  return (
    <Routes>
      <Route path={GUIDED_PATH} element={<Guided />} />
      <Route path="*" element={<Tabs />} />
    </Routes>
  )
}

/** Onboarding tant que le profil n'est pas créé ; écran neutre pendant la lecture des réglages. */
function Gate() {
  const settings = useLiveQuery(() => getSettings(), [])

  if (settings.error) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 text-center">
        <p role="alert" className="text-zinc-300">
          Impossible d’ouvrir les données de l’app. Ferme-la puis rouvre-la ; si le problème persiste, vérifie
          que le stockage du navigateur n’est pas bloqué.
        </p>
      </main>
    )
  }
  if (!settings.data) return <div className="flex-1" aria-busy="true" />
  if (!settings.data.onboardingCompleted) return <Onboarding />
  return <Shell />
}

export function App() {
  useEffect(() => {
    void requestPersistentStorage()
  }, [])

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <div className="flex h-full flex-col overflow-hidden bg-bg text-zinc-100">
        <Gate />
      </div>
    </BrowserRouter>
  )
}
