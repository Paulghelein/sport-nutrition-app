import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { getSettings, requestPersistentStorage } from '../db'
import { useLiveQuery } from '../ui'
import { DEV_UI_ENABLED } from './devUi'
import { Onboarding } from './Onboarding'
import { DEV_UI_PATH, GUIDED_PATH, HOME_PATH, RECIPE_SCAN_PATH, VIDEO_RECIPE_PATH } from './routes'
import { SessionScreen } from './screens/SessionScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { TabsLayout } from './shell/TabsLayout'
import { legacyRedirect } from './shell/legacyRedirect'
import { TodayScreen } from './today/TodayScreen'

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
// J6 — recettes, mode cuisine, frigo, courses, import JSON.
const RecipesScreen = lazy(() => import('./recipes/RecipesScreen'))
const RecipeScreen = lazy(() => import('./recipes/RecipeScreen'))
const RecipeFormScreen = lazy(() => import('./recipes/RecipeFormScreen'))
const CookScreen = lazy(() => import('./recipes/CookScreen'))
const FridgeScreen = lazy(() => import('./recipes/FridgeScreen'))
const ShoppingScreen = lazy(() => import('./recipes/ShoppingScreen'))
const ImportScreen = lazy(() => import('./recipes/ImportScreen'))
// J7 — scan de code-barres.
const ScanScreen = lazy(() => import('./scan/ScanScreen'))
// J8 — page Progrès (Recharts et contenu embarqué hors du démarrage).
const ProgressScreen = lazy(() => import('./progress/ProgressScreen'))
// J9 — bouton Claude : coller et appliquer la réponse.
const ClaudeResponseScreen = lazy(() => import('./claude/ClaudeResponseScreen'))
const VideoRecipeScreen = lazy(() => import('./claude/VideoRecipeScreen'))
// v2 (R3) — F4 : recette par scan (caméra en bandeau, brouillon conservé).
const RecipeScanScreen = lazy(() => import('./recipeScan/RecipeScanScreen'))
// v2 (R0) — page de démonstration du kit (développement et e2e seulement). La condition est écrite ici, à côté du
// `import()`, et non importée de devUi.ts : Rolldown (Vite 8) ne la prouve fausse que dans le même module, sinon il générerait
// quand même le chunk de la page. Doit rester identique à `DEV_UI_ENABLED`.
const UiScreen =
  import.meta.env.DEV || import.meta.env.VITE_DEV_UI === '1' ? lazy(() => import('./dev/UiScreen')) : null

function Tabs() {
  return (
    <TabsLayout>
      <Suspense fallback={<div aria-busy="true" className="min-h-40" />}>
        <Routes>
          <Route path={HOME_PATH} element={<TodayScreen />} />
          <Route path="/entrainement" element={<SessionScreen />} />
          <Route path="/entrainement/apercu" element={<PreviewScreen />} />
          <Route path="/entrainement/exercices" element={<LibraryScreen />} />
          <Route path="/entrainement/exercices/nouveau" element={<ExerciseFormScreen />} />
          <Route path="/entrainement/exercices/supprimes" element={<DeletedScreen />} />
          <Route path="/entrainement/exercices/:id" element={<ExerciseScreen />} />
          <Route path="/entrainement/exercices/:id/modifier" element={<ExerciseFormScreen />} />
          <Route path="/entrainement/recap/:id" element={<RecapScreen />} />
          <Route path="/entrainement/historique" element={<HistoryScreen />} />
          <Route path="/entrainement/historique/:id" element={<HistoryDetailScreen />} />
          <Route path="/entrainement/modeles" element={<TemplatesScreen />} />
          <Route path="/nutrition" element={<JournalScreen />} />
          <Route path="/nutrition/ajouter" element={<AddFoodScreen />} />
          <Route path="/nutrition/aliments/nouveau" element={<FoodFormScreen />} />
          <Route path="/nutrition/aliments/:id" element={<FoodScreen />} />
          <Route path="/nutrition/aliments/:id/modifier" element={<FoodFormScreen />} />
          <Route path="/nutrition/recettes" element={<RecipesScreen />} />
          <Route path="/nutrition/recettes/nouvelle" element={<RecipeFormScreen />} />
          <Route path="/nutrition/recettes/:id" element={<RecipeScreen />} />
          <Route path="/nutrition/recettes/:id/modifier" element={<RecipeFormScreen />} />
          <Route path="/nutrition/recettes/:id/cuisine" element={<CookScreen />} />
          <Route path="/nutrition/frigo" element={<FridgeScreen />} />
          <Route path="/nutrition/courses" element={<ShoppingScreen />} />
          <Route path="/nutrition/scanner" element={<ScanScreen />} />
          <Route path="/progres" element={<ProgressScreen />} />
          <Route path="/reglages" element={<SettingsScreen />} />
          <Route path="/reglages/importer" element={<ImportScreen />} />
          <Route path="/claude/reponse" element={<ClaudeResponseScreen />} />
          <Route path={VIDEO_RECIPE_PATH} element={<VideoRecipeScreen />} />
          <Route path={RECIPE_SCAN_PATH} element={<RecipeScanScreen />} />
          <Route path="*" element={<Navigate to={HOME_PATH} replace />} />
        </Routes>
      </Suspense>
    </TabsLayout>
  )
}

/** Ancienne route (`/seance/...`) : redirection en conservant le reste du chemin, la query et le hash. */
function LegacyRedirect() {
  const { pathname, search, hash } = useLocation()
  return <Navigate to={legacyRedirect(pathname, search, hash) ?? HOME_PATH} replace />
}

/** Mode guidé : plein écran, sans barre d'onglets ni invite de mise à jour (l'écran gère ses safe areas). */
function Guided() {
  return (
    <Suspense fallback={<div aria-busy="true" className="flex-1" />}>
      <GuidedScreen />
    </Suspense>
  )
}

/** Page de composants v2 : plein écran clair, hors de la mise en page à onglets v1. */
function DevUi() {
  if (!UiScreen) return <Navigate to={HOME_PATH} replace />
  return (
    <Suspense fallback={<div aria-busy="true" className="flex-1" />}>
      <UiScreen />
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
      {DEV_UI_ENABLED && <Route path={DEV_UI_PATH} element={<DevUi />} />}
      <Route path="/seance/*" element={<LegacyRedirect />} />
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
      {/* fixed inset-0 : colle aux vrais bords de l’écran (en standalone iOS, height: 100% peut s’arrêter avant le bas). */}
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-v1-bg text-zinc-100">
        <Gate />
      </div>
    </BrowserRouter>
  )
}
