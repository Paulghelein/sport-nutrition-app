import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { getSettings, requestPersistentStorage } from '../db'
import { useLiveQuery } from '../ui'
import { DEV_UI_ENABLED } from './devUi'
import { Onboarding } from './Onboarding'
import {
  ADD_FOOD_PATH,
  CLAUDE_RESPONSE_PATH,
  COOK_ROUTE,
  DELETED_EXERCISES_PATH,
  DEV_UI_PATH,
  EDIT_EXERCISE_ROUTE,
  EDIT_FOOD_ROUTE,
  EDIT_RECIPE_ROUTE,
  EXERCISE_ROUTE,
  FOOD_ROUTE,
  FRIDGE_PATH,
  GUIDED_PATH,
  HISTORY_DETAIL_ROUTE,
  HISTORY_PATH,
  HOME_PATH,
  IMPORT_PATH,
  LIBRARY_PATH,
  NEW_EXERCISE_PATH,
  NEW_FOOD_PATH,
  NEW_RECIPE_PATH,
  NUTRITION_PATH,
  PREVIEW_PATH,
  PROGRESS_PATH,
  RECAP_ROUTE,
  RECIPES_PATH,
  RECIPE_ROUTE,
  RECIPE_SCAN_PATH,
  SCAN_PATH,
  SETTINGS_PATH,
  SHOPPING_PATH,
  TEMPLATES_PATH,
  TRAINING_PATH,
  VIDEO_RECIPE_PATH,
} from './routes'
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
          <Route path={TRAINING_PATH} element={<SessionScreen />} />
          <Route path={PREVIEW_PATH} element={<PreviewScreen />} />
          <Route path={LIBRARY_PATH} element={<LibraryScreen />} />
          <Route path={NEW_EXERCISE_PATH} element={<ExerciseFormScreen />} />
          <Route path={DELETED_EXERCISES_PATH} element={<DeletedScreen />} />
          <Route path={EXERCISE_ROUTE} element={<ExerciseScreen />} />
          <Route path={EDIT_EXERCISE_ROUTE} element={<ExerciseFormScreen />} />
          <Route path={RECAP_ROUTE} element={<RecapScreen />} />
          <Route path={HISTORY_PATH} element={<HistoryScreen />} />
          <Route path={HISTORY_DETAIL_ROUTE} element={<HistoryDetailScreen />} />
          <Route path={TEMPLATES_PATH} element={<TemplatesScreen />} />
          <Route path={NUTRITION_PATH} element={<JournalScreen />} />
          <Route path={ADD_FOOD_PATH} element={<AddFoodScreen />} />
          <Route path={NEW_FOOD_PATH} element={<FoodFormScreen />} />
          <Route path={FOOD_ROUTE} element={<FoodScreen />} />
          <Route path={EDIT_FOOD_ROUTE} element={<FoodFormScreen />} />
          <Route path={RECIPES_PATH} element={<RecipesScreen />} />
          <Route path={NEW_RECIPE_PATH} element={<RecipeFormScreen />} />
          <Route path={RECIPE_ROUTE} element={<RecipeScreen />} />
          <Route path={EDIT_RECIPE_ROUTE} element={<RecipeFormScreen />} />
          <Route path={COOK_ROUTE} element={<CookScreen />} />
          <Route path={FRIDGE_PATH} element={<FridgeScreen />} />
          <Route path={SHOPPING_PATH} element={<ShoppingScreen />} />
          <Route path={SCAN_PATH} element={<ScanScreen />} />
          <Route path={PROGRESS_PATH} element={<ProgressScreen />} />
          <Route path={SETTINGS_PATH} element={<SettingsScreen />} />
          <Route path={IMPORT_PATH} element={<ImportScreen />} />
          <Route path={CLAUDE_RESPONSE_PATH} element={<ClaudeResponseScreen />} />
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
    <Suspense fallback={<div aria-busy="true" className="ds-session flex-1" />}>
      <GuidedScreen />
    </Suspense>
  )
}

/** Page de composants v2 : plein écran clair, hors de la mise en page à onglets. */
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
        <p role="alert" className="text-ink-muted">
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
      <div className="fixed inset-0 flex flex-col overflow-hidden bg-canvas text-ink">
        <Gate />
      </div>
    </BrowserRouter>
  )
}
