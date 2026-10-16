import { useEffect, useReducer, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ValidationError,
  addLogEntries,
  cacheOffFood,
  deleteLogEntry,
  findFoodByEan,
  getFoodRow,
  listLogForDate,
} from '../../db'
import { foodLogEntry, lookupOff, normalizeEan, offProductToFood } from '../../domain/nutrition'
import { isValidLocalDate, toLocalDate } from '../../domain/shared/dates'
import type { Ean, Food, ScanErrorKind } from '../../types'
import { Button, ErrorNote, TextField, errorMessage, linkButtonClass, useLiveQuery } from '../../ui'
import { QuantitySheet } from '../nutrition/QuantitySheet'
import { SLOT_LABEL, isMealSlot, slotForNow } from '../nutrition/format'
import { BackLink } from '../nutrition/parts'
import { CameraView } from './CameraView'
import { scanErrorText, scanReducer } from './scanLogic'

/** Bip court de lecture caméra : un seul AudioContext, déverrouillé au premier toucher, fermé au démontage. */
function useBeep(): () => void {
  const ctx = useRef<AudioContext | null>(null)
  useEffect(() => {
    const unlock = () => {
      try {
        ctx.current ??= new window.AudioContext()
        void ctx.current.resume()
      } catch {
        // pas de son : l'animation du cadre suffit
      }
    }
    document.addEventListener('pointerdown', unlock, { once: true })
    return () => {
      document.removeEventListener('pointerdown', unlock)
      void ctx.current?.close().catch(() => undefined)
      ctx.current = null
    }
  }, [])
  return () => {
    const c = ctx.current
    if (!c || c.state !== 'running') return
    const osc = c.createOscillator()
    osc.frequency.value = 880
    osc.connect(c.destination)
    osc.start()
    osc.stop(c.currentTime + 0.12)
  }
}

export default function ScanScreen() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const today = toLocalDate(new Date())
  const askedDate = params.get('date')
  const date = askedDate !== null && isValidLocalDate(askedDate) ? askedDate : today
  const askedSlot = params.get('repas')
  const slot = isMealSlot(askedSlot) ? askedSlot : slotForNow()
  const context = `?repas=${slot}&date=${date}`
  const addPath = `/nutrition/ajouter${context}`
  const back = `/nutrition${date === today ? '' : `?date=${date}`}`
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
      const cached = await findFoodByEan(ean)
      if (ctrl.signal.aborted) return
      if (cached) return void dispatch({ type: 'resolved', food: cached })
      const res = await lookupOff(ean, (input, init) => fetch(input, init), { signal: ctrl.signal })
      if (ctrl.signal.aborted) return
      if (res.status === 'found') {
        let food: Food
        try {
          food = await cacheOffFood(offProductToFood(res.product, new Date().toISOString()))
        } catch (e) {
          if (!(e instanceof ValidationError)) throw e
          // Valeurs OFF incohérentes : formulaire pré-rempli plutôt qu'un « Réessayer » sans issue.
          if (ctrl.signal.aborted) return
          const q = new URLSearchParams({
            repas: slot,
            date,
            ean,
            origine: 'incomplete',
            nom: res.product.name,
          })
          if (res.product.brand) q.set('marque', res.product.brand)
          busy.current = false
          navigate(`/nutrition/aliments/nouveau?${q.toString()}`, { replace: true })
          return
        }
        if (ctrl.signal.aborted) return
        dispatch({ type: 'resolved', food })
      } else if (res.status === 'error') {
        fail(res.message)
      } else {
        const q = new URLSearchParams({ repas: slot, date, ean, origine: res.status })
        if (res.status === 'incomplete') {
          if (res.name) q.set('nom', res.name)
          if (res.brand) q.set('marque', res.brand)
        }
        busy.current = false
        navigate(`/nutrition/aliments/nouveau?${q.toString()}`, { replace: true })
      }
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
    `/nutrition/aliments/nouveau?${new URLSearchParams({ repas: slot, date, ean, origine: 'not_found' }).toString()}`

  return (
    <>
      <BackLink to={addPath}>Ajouter</BackLink>
      <h1 className="mt-1 text-2xl font-bold">Scanner un produit</h1>
      <p className="mt-1 text-base text-zinc-300">Pour : {SLOT_LABEL[slot].toLowerCase()}</p>

      <div className="mt-4">
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
            <ErrorNote>
              <strong>{errorText?.title}</strong>
              <br />
              {errorText?.body}
            </ErrorNote>
            {cameraError !== 'insecure_context' && cameraError !== 'unsupported' ? (
              <Button
                variant="secondary"
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
          <p className="mt-2 text-center text-base text-zinc-300">Place le code-barres dans le cadre.</p>
        ) : null}
      </div>

      {handoffError ? (
        <div className="mt-4">
          <ErrorNote>{handoffError}</ErrorNote>
        </div>
      ) : null}

      {state.phase === 'lookup' ? (
        <div
          role="status"
          className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3"
        >
          <span className="text-base">Recherche du produit {state.ean}…</span>
          <Button variant="secondary" width="auto" onClick={cancel}>
            Annuler
          </Button>
        </div>
      ) : null}

      {state.phase === 'error' ? (
        <div className="mt-4 flex flex-col gap-3">
          <ErrorNote>{state.message}</ErrorNote>
          <Button onClick={() => void lookup(state.ean)}>Réessayer</Button>
          <Link to={createLink(state.ean)} replace className={linkButtonClass('secondary')}>
            Créer l’aliment avec ce code
          </Link>
          <Button variant="secondary" onClick={cancel}>
            Scanner à nouveau
          </Button>
        </div>
      ) : null}

      {state.phase === 'added' ? (
        <div
          role="status"
          className="mt-4 flex flex-col gap-3 rounded-xl border border-emerald-400/40 bg-emerald-950 p-3 text-emerald-100"
        >
          <p className="text-base font-semibold">Ajouté : {state.name}</p>
          {addError ? <ErrorNote>{addError}</ErrorNote> : null}
          <Button onClick={() => dispatch({ type: 'again' })}>Scanner un autre produit</Button>
          <Button variant="secondary" onClick={finish}>
            Terminer ({addedCount} ajouté{addedCount > 1 ? 's' : ''} · {SLOT_LABEL[slot]})
          </Button>
          <Button variant="secondary" onClick={() => void undo()}>
            Annuler l’ajout
          </Button>
        </div>
      ) : null}

      <form
        className="mt-6 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          submitManual()
        }}
      >
        <TextField
          label="Saisir le code à la main"
          value={manual}
          onChange={(v) => setManual(v.replace(/[^\d\s]/g, ''))}
          inputMode="numeric"
          pattern="[0-9 ]*"
          autoComplete="off"
          hint="Les 8, 12 ou 13 chiffres sous le code-barres."
        />
        {manualError ? <ErrorNote>{manualError}</ErrorNote> : null}
        <Button type="submit" variant="secondary" disabled={state.phase === 'lookup'}>
          Chercher ce code
        </Button>
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
    </>
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
