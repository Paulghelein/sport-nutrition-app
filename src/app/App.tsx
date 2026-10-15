import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { getSettings, requestPersistentStorage } from '../db'
import { TabBar, useLiveQuery } from '../ui'
import { Onboarding } from './Onboarding'
import { NutritionScreen } from './screens/NutritionScreen'
import { ProgressScreen } from './screens/ProgressScreen'
import { SessionScreen } from './screens/SessionScreen'
import { SettingsScreen } from './screens/SettingsScreen'

function Tabs() {
  return (
    <>
      <main
        className="flex-1 overflow-y-auto overflow-x-hidden px-4"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 6rem)',
        }}
      >
        <div className="mx-auto max-w-xl">
          <Routes>
            <Route path="/seance" element={<SessionScreen />} />
            <Route path="/nutrition" element={<NutritionScreen />} />
            <Route path="/progres" element={<ProgressScreen />} />
            <Route path="/reglages" element={<SettingsScreen />} />
            <Route path="*" element={<Navigate to="/seance" replace />} />
          </Routes>
        </div>
      </main>
      <TabBar />
    </>
  )
}

/** Onboarding tant que le profil n'est pas créé ; écran neutre pendant la lecture des réglages. */
function Gate() {
  const settings = useLiveQuery(() => getSettings(), [])

  if (settings.error) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 text-center">
        <p role="alert" className="text-zinc-300">
          Impossible d’ouvrir les données de l’app. Ferme-la puis rouvre-la ; si le problème persiste, vérifie que
          le stockage du navigateur n’est pas bloqué.
        </p>
      </main>
    )
  }
  if (!settings.data) return <div className="flex-1" aria-busy="true" />
  if (!settings.data.onboardingCompleted) return <Onboarding />
  return <Tabs />
}

export function App() {
  useEffect(() => {
    void requestPersistentStorage()
  }, [])

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <div className="flex h-full flex-col bg-bg text-zinc-100">
        <Gate />
      </div>
    </BrowserRouter>
  )
}
