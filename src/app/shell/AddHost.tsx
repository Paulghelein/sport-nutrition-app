import { ClipboardPaste, FileJson, Ruler } from 'lucide-react'
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getActiveSession, listWeighIns } from '../../db'
import type { MealSlot, WeighIn } from '../../types'
import { formatKg } from '../../ui'
import { DEFAULT_CREATE_ENTRIES, LogSheet } from '../../ui/kit'
import type { LogEntry } from '../../ui/kit'
import { Toast } from '../nutrition/JournalToast'
import type { ToastState } from '../nutrition/JournalToast'
import { slotForNow } from '../nutrition/format'
import { GUIDED_PATH, PREVIEW_PATH } from '../routes'
import { loadDuration } from '../training/durations'
import { destinationFor } from './destinations'
import { LOG_MEALS } from './meals'

const WeightSheet = lazy(() => import('../forms/WeightSheet').then((m) => ({ default: m.WeightSheet })))

const OTHERS: readonly LogEntry[] = [
  { action: 'claude-response', label: 'Réponse de Claude', Icon: ClipboardPaste },
  { action: 'import-recipe', label: 'Importer des recettes', Icon: FileJson },
  { action: 'measurements', label: 'Mensurations', Icon: Ruler },
]

/** Feuille « Ajouter » branchée sur les écrans existants. Le repas ciblé est recalculé à chaque ouverture. */
function AddSheet({ onClose, onWeigh }: { onClose: () => void; onWeigh: () => void }) {
  const navigate = useNavigate()
  const [meal, setMeal] = useState<MealSlot>(() => slotForNow())
  // Verrou anti double toucher, et feuille encore ouverte (fermée entre-temps : aucune navigation).
  const busy = useRef(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const finish = (to: string) => {
    if (!alive.current) return
    onClose()
    navigate(to)
  }
  const once = (run: () => void) => {
    if (busy.current) return
    busy.current = true
    run()
  }

  return (
    <LogSheet
      meal={meal}
      meals={LOG_MEALS}
      onMealChange={setMeal}
      onAction={(action) => {
        const to = destinationFor(action, meal)
        if (to !== null) once(() => finish(to))
        else if (action === 'weigh-in') once(onWeigh)
      }}
      createEntries={DEFAULT_CREATE_ENTRIES}
      otherEntries={OTHERS}
      onStartSession={() =>
        once(() => {
          void getActiveSession()
            .catch(() => undefined)
            .then((active) => finish(active ? GUIDED_PATH : `${PREVIEW_PATH}?duree=${loadDuration()}`))
        })
      }
      onClose={onClose}
    />
  )
}

/** Feuille « Ajouter » (bouton +) et, par-dessus l'écran courant, la feuille de pesée. */
export function AddHost({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [weighIns, setWeighIns] = useState<WeighIn[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  // Stable : le minuteur du toast dépend de `onDismiss` et ne doit pas repartir à chaque rendu.
  const dismissToast = useCallback(() => setToast(null), [])
  const reading = useRef(false)

  useEffect(() => {
    if (!failed) return
    const t = setTimeout(() => setFailed(false), 5000)
    return () => clearTimeout(t)
  }, [failed])

  const weigh = () => {
    if (reading.current) return
    reading.current = true
    // Sans les pesées existantes, la feuille ne saurait pas qu'une pesée existe déjà ce jour-là : on n'ouvre rien.
    void listWeighIns()
      .then((list) => {
        // On ferme la feuille Ajouter avant d'ouvrir la pesée (deux feuilles superposées seraient inutiles ici).
        onClose()
        setWeighIns(list)
      })
      .catch(() => {
        onClose()
        setFailed(true)
      })
      .finally(() => {
        reading.current = false
      })
  }

  return (
    <>
      {open && <AddSheet onClose={onClose} onWeigh={weigh} />}
      {weighIns && (
        <Suspense fallback={null}>
          <WeightSheet
            weighIn={null}
            existing={weighIns}
            onClose={() => setWeighIns(null)}
            onSaved={(kg) => setToast({ message: `Pesée enregistrée : ${formatKg(kg)} kg.` })}
          />
        </Suspense>
      )}
      {/* Confirmation brève (7 s), au-dessus de la barre flottante comme les autres messages de ce shell. */}
      {toast && (
        <div style={{ bottom: 'var(--bar-clearance)' }} className="fixed inset-x-4 z-50 mx-auto max-w-xl">
          <Toast toast={toast} onDismiss={dismissToast} />
        </div>
      )}
      {failed && (
        <p
          role="alert"
          style={{ bottom: 'var(--bar-clearance)' }}
          className="fixed inset-x-4 z-50 m-0 rounded-ds-md bg-inverse px-4 py-3 text-body-strong text-on-inverse shadow-float"
        >
          Impossible de lire tes pesées. Réessaie dans un instant.
        </p>
      )}
    </>
  )
}
