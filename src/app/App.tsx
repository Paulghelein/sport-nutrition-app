import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { TabBar } from '../ui'
import { NutritionScreen } from './screens/NutritionScreen'
import { ProgressScreen } from './screens/ProgressScreen'
import { SessionScreen } from './screens/SessionScreen'
import { SettingsScreen } from './screens/SettingsScreen'

export function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <div className="flex h-full flex-col bg-[#0b0b0f] text-zinc-100">
        <main
          className="flex-1 overflow-y-auto overflow-x-hidden px-4"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
            paddingBottom: 'calc(env(safe-area-inset-bottom) + 6rem)',
          }}
        >
          <Routes>
            <Route path="/seance" element={<SessionScreen />} />
            <Route path="/nutrition" element={<NutritionScreen />} />
            <Route path="/progres" element={<ProgressScreen />} />
            <Route path="/reglages" element={<SettingsScreen />} />
            <Route path="*" element={<Navigate to="/seance" replace />} />
          </Routes>
        </main>
        <TabBar />
      </div>
    </BrowserRouter>
  )
}
