import { useEffect, useReducer, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { addLogEntries, deleteLogEntry, getFoodRow, listLogForDate } from '../../db'
import { foodLogEntry, normalizeEan } from '../../domain/nutrition'
import { isValidLocalDate, toLocalDate } from '../../domain/shared/dates'
import type { Ean, Food, ScanErrorKind } from '../../types'
import { errorMessage, useLiveQuery } from '../../ui'
import { Button, Card, buttonClass } from '../../ui/kit'
import { TextField } from '../../ui/kit/Fields'
import { Note } from '../../ui/kit/Note'
import { ADD_FOOD_PATH, NEW_FOOD_PATH, NUTRITION_PATH } from '../routes'
import { QuantitySheet } from '../nutrition/QuantitySheet'
import { SLOT_LABEL, isMealSlot, slotForNow } from '../nutrition/format'
import { BackLink } from '../../ui/kit/BackLink'
import { CameraView } from './CameraView'
import { resolveScan } from './resolveScan'
import { scanErrorText, scanReducer } from './scanLogic'
import { useBeep } from './useBeep'

export default function ScanScreen() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const today = toLocalDate(new Date())
  const askedDate = params.get('date')
  const date = askedDate !== null && isValidLocalDate(askedDate) ? askedDate : today
  const askedSlot = params.get('repas')
  const slot = isMealSlot(askedSlot) ? askedSlot : slotForNow()
  const context = `?repas=${slot}&date=${date}`
  const addPath = `${ADD_FOOD_PATH}${context}`
  const back = `${NUTRITION_PATH}${date === today ? '' : `?date=${date}`}`
  const addedKey = `added:${slot}:${date}`

  const [state, dispatch] = useReducer(scanReducer, { phase: 'scanning' })
  const [cameraError, setCameraError] = useState<ScanErrorKind | null>(null)
  const [cameraAttempt, setCameraAttempt] = useState(0)
  const [manual, setManual] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const [lastEntry, setLastEntry] = useState<string | null>(null)
  const [handoffError, setHandoffError] = useState<string | null>(null)
  const [storedAdded, setStoredAdded] = useState(() => readAdded(addedKey))
  const dayLog = useLiveQuery(() => listLogForDate(date), [date])
  const existing = dayLog.data ? new Set(dayLog.data.map((e) => e.id)) : undefined
  const addedCount = (existing ? storedAdded.filter((id) => existing.has(id)) : storedAdded).length
  const beep = useBeep()
  const busy = useRef(false)
  const abort = useRef<AbortController | null>(null)

  const lookup = async (ean: Ean) => {
    if (busy.current) return
    busy.current = true
    dispatch({ type: 'detected', ean })
    const ctrl = new AbortController()
    abort.current = ctrl
    const fail = (message: string) => {
      busy.current = false
      dispatch({ type: 'failed', ean, message })
    }
    try {
      const res = await resolveScan(ean, (input, init) => fetch(input, init), ctrl.signal)
      if (res.status === 'aborted' || ctrl.signal.aborted) return
      if (res.status === 'food') return void dispatch({ type: 'resolved', food: res.food })
      if (res.status === 'error') return fail(res.message)
      const q = new URLSearchParams({ repas: slot, date, ean, origine: res.origin })
      if (res.name) q.set('nom', res.name)
      if (res.brand) q.set('marque', res.brand)
      if (res.packageG !== undefined) q.set('paquet', String(res.packageG))
      busy.current = false
      navigate(`${NEW_FOOD_PATH}?${q.toString()}`, { replace: true })
    } catch (e) {
      if (!ctrl.signal.aborted) fail(errorMessage(e, 'Recherche impossible. Réessaie.'))
    }
  }

  const cancel = () => {
    abort.current?.abort()
    busy.current = false
    dispatch({ type: 'cancel' })
  }

  // Retour du formulaire de création : l'aliment tout juste enregistré passe directement à la quantité.
  const handoff = params.get('ajout')
  useEffect(() => {
    if (handoff === null) return
    let alive = true
    void getFoodRow(handoff).then((food) => {
      if (!alive) return
      if (food) {
        busy.current = true
        dispatch({ type: 'resolved', food })
      } else {
        setHandoffError('L’aliment créé est introuvable. Scanne le produit de nouveau.')
      }
      setParams(
        (p) => {
          p.delete('ajout')
          return p
        },
        { replace: true },
      )
    })
    return () => {
      alive = false
    }
  }, [handoff, setParams])

  useEffect(() => () => abort.current?.abort(), [])

  const submitManual = () => {
    const ean = normalizeEan(manual)
    if (!ean) {
      setManualError('Code invalide : 8, 12 ou 13 chiffres, clé de contrôle comprise. Vérifie les chiffres.')
      return
    }
    setManualError(null)
    setManual('')
    void lookup(ean)
  }

  const addFood = async (food: Food, grams: number) => {
    const entry = foodLogEntry(food, grams, slot, date, {
      id: crypto.randomUUID(),
      now: new Date().toISOString(),
    })
    await addLogEntries([entry])
    const ids = [...readAdded(addedKey), entry.id]
    sessionStorage.setItem(addedKey, JSON.stringify(ids))
    setStoredAdded(ids)
    setLastEntry(entry.id)
    busy.current = false
    dispatch({ type: 'added', name: entry.name })
  }

  const undo = async () => {
    if (!lastEntry) return
    setAddError(null)
    try {
      await deleteLogEntry(lastEntry)
      const ids = readAdded(addedKey).filter((id) => id !== lastEntry)
      sessionStorage.setItem(addedKey, JSON.stringify(ids))
      setStoredAdded(ids)
      setLastEntry(null)
      dispatch({ type: 'again' })
    } catch (e) {
      setAddError(errorMessage(e, 'Annulation impossible. Réessaie.'))
    }
  }

  const finish = () => {
    sessionStorage.removeItem(addedKey)
    navigate(back, { replace: true })
  }

  const errorText = cameraError ? scanErrorText(cameraError) : null
  const createLink = (ean: Ean) =>
    `${NEW_FOOD_PATH}?${new URLSearchParams({ repas: slot, date, ean, origine: 'not_found' }).toString()}`

  return (
    <div className="flex flex-col gap-3.5">
      <BackLink to={addPath}>Ajouter</BackLink>
      <header className="flex flex-col gap-1">
        <h1 className="m-0 font-display text-display-l">Scanner un produit</h1>
        <p className="m-0 text-body text-ink-muted">Pour : {SLOT_LABEL[slot].toLowerCase()}</p>
      </header>

      <div>
        {cameraError === null ? (
          <CameraView
            key={cameraAttempt}
            active
            flash={state.phase === 'lookup'}
            onCode={(ean) => {
              // Le flux reste ouvert entre deux produits : les lectures hors phase « scanning » sont ignorées.
              if (state.phase !== 'scanning' || busy.current) return
              beep()
              void lookup(ean)
            }}
            onError={setCameraError}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <Note tone="error">
              <strong>{errorText?.title}</strong>
              <br />
              {errorText?.body}
            </Note>
            {cameraError !== 'insecure_context' && cameraError !== 'unsupported' ? (
              <Button
                variant="secondary"
                fullWidth
                onClick={() => {
                  setCameraError(null)
                  setCameraAttempt((n) => n + 1)
                }}
              >
                Réessayer la caméra
              </Button>
            ) : null}
          </div>
        )}
        {cameraError === null ? (
          <p className="m-0 mt-2 text-center text-body text-ink-muted">Place le code-barres dans le cadre.</p>
        ) : null}
      </div>

      {handoffError ? <Note tone="error">{handoffError}</Note> : null}

      {state.phase === 'lookup' ? (
        <Card role="status" className="flex items-center justify-between gap-3">
          <span className="min-w-0 text-body">Recherche du produit {state.ean}…</span>
          <Button variant="flat" onClick={cancel}>
            Annuler
          </Button>
        </Card>
      ) : null}

      {state.phase === 'error' ? (
        <div className="flex flex-col gap-2">
          <Note tone="error">{state.message}</Note>
          <Button fullWidth onClick={() => void lookup(state.ean)}>
            Réessayer
          </Button>
          <Link to={createLink(state.ean)} replace className={buttonClass('secondary', 'normal', true)}>
            Créer l’aliment avec ce code
          </Link>
          <Button variant="secondary" fullWidth onClick={cancel}>
            Scanner à nouveau
          </Button>
        </div>
      ) : null}

      {state.phase === 'added' ? (
        <div className="flex flex-col gap-2">
          <Note tone="success">
            <p className="m-0 text-body-strong">Ajouté : {state.name}</p>
          </Note>
          {addError ? <Note tone="error">{addError}</Note> : null}
          <Button fullWidth onClick={() => dispatch({ type: 'again' })}>
            Scanner un autre produit
          </Button>
          <Button variant="secondary" fullWidth onClick={finish}>
            Terminer ({addedCount} ajouté{addedCount > 1 ? 's' : ''} · {SLOT_LABEL[slot]})
          </Button>
          <Button variant="text" fullWidth onClick={() => void undo()}>
            Annuler l’ajout
          </Button>
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submitManual()
        }}
      >
        <Card padding="large" className="flex flex-col gap-3">
          <TextField
            label="Saisir le code à la main"
            value={manual}
            onChange={(v) => setManual(v.replace(/[^\d\s]/g, ''))}
            inputMode="numeric"
            pattern="[0-9 ]*"
            autoComplete="off"
            hint="Les 8, 12 ou 13 chiffres sous le code-barres."
          />
          {manualError ? <Note tone="error">{manualError}</Note> : null}
          <Button type="submit" variant="flat" fullWidth disabled={state.phase === 'lookup'}>
            Chercher ce code
          </Button>
        </Card>
      </form>

      {state.phase === 'quantity' ? (
        <QuantitySheet
          key={state.food.id}
          food={state.food}
          contextSearch={context}
          initialGrams={state.food.defaultPortionG ?? 100}
          onSubmit={(grams) => addFood(state.food, grams)}
          onClose={cancel}
        />
      ) : null}
    </div>
  )
}

function readAdded(key: string): string[] {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]')
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
