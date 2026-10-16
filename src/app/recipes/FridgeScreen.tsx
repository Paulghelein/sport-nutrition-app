import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteFridgeItem, updateFridgeItem } from '../../db'
import { fridgeViews, recipeNutrition } from '../../domain/nutrition'
import { formatDateFr, toLocalDate } from '../../domain/shared/dates'
import type { FridgeView } from '../../types'
import {
  Button,
  Card,
  ConfirmSheet,
  DateField,
  ErrorNote,
  Sheet,
  errorMessage,
  linkButtonClass,
} from '../../ui'
import { BackLink } from '../nutrition/parts'
import { expiryLabel, fmtPortions, portionsWord } from './format'
import { LogRecipeSheet } from './LogRecipeSheet'
import { Loading, Notice, RECIPES_PATH, focusRing } from './parts'
import type { NoticeState } from './parts'
import { useFridge, useRecipeLibrary } from './useRecipes'

const roundBtn = `flex size-14 shrink-0 items-center justify-center rounded-xl border border-v1-line bg-v1-surface-hi text-3xl font-semibold active:bg-zinc-700 disabled:text-zinc-600 ${focusRing}`

function ExpirySheet({ view, onClose }: { view: FridgeView; onClose: () => void }) {
  const [date, setDate] = useState<string>(view.item.expiresOn)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await updateFridgeItem(view.item.id, { expiresOn: date })
      onClose()
    } catch (e) {
      setError(errorMessage(e, 'Date invalide. Réessaie.'))
      setBusy(false)
    }
  }
  return (
    <Sheet title="Date limite" onClose={onClose} busy={busy}>
      <div className="flex flex-col gap-4">
        <p className="-mt-2 text-base text-zinc-300">{view.recipe?.name ?? 'Recette supprimée'}</p>
        <DateField label="À consommer avant le" value={date} onChange={setDate} />
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button onClick={() => void save()} disabled={busy}>
          Enregistrer
        </Button>
      </div>
    </Sheet>
  )
}

export default function FridgeScreen() {
  const { data: lib, error: libError } = useRecipeLibrary()
  const { data: items, error: fridgeError } = useFridge()
  const today = toLocalDate(new Date())
  const views = useMemo(
    () => (lib && items ? fridgeViews(items, lib.recipes, today) : undefined),
    [lib, items, today],
  )
  const [logging, setLogging] = useState<FridgeView | null>(null)
  const [expiry, setExpiry] = useState<FridgeView | null>(null)
  const [removing, setRemoving] = useState<FridgeView | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<NoticeState | null>(null)

  const run = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(errorMessage(e, 'Action impossible. Réessaie.'))
    } finally {
      setBusyId(null)
      setRemoving(null)
    }
  }

  const loggingNutrition = logging?.recipe && lib ? recipeNutrition(logging.recipe, lib.lookup) : null

  return (
    <section>
      <BackLink to={RECIPES_PATH}>Recettes</BackLink>
      <h1 className="mt-1 text-3xl font-bold">Frigo</h1>
      <p className="mt-2 text-base text-zinc-400">
        Les portions préparées à l’avance. Loguer une portion depuis ici la retire du frigo.
      </p>

      {libError || fridgeError || error ? (
        <div className="mt-4">
          <ErrorNote>{error ?? 'Impossible de lire le frigo. Ferme l’app puis rouvre-la.'}</ErrorNote>
        </div>
      ) : null}
      <div className="mt-3">
        <Notice notice={notice} />
      </div>

      {!views ? (
        <Loading />
      ) : views.length === 0 ? (
        <Card className="mt-5 text-center">
          <p className="text-lg font-semibold">Le frigo est vide</p>
          <p className="mt-1 text-base text-zinc-400">
            Ouvre une recette et choisis « Préparer pour le frigo » après avoir cuisiné un batch.
          </p>
          <Link to={RECIPES_PATH} className={`${linkButtonClass('secondary')} mt-4`}>
            Voir les recettes
          </Link>
        </Card>
      ) : (
        <ul className="m-0 mt-5 flex list-none flex-col gap-3 p-0">
          {views.map((v) => {
            const left = v.item.portionsLeft
            const busy = busyId === v.item.id
            return (
              <li key={v.item.id}>
                <Card className={v.expired ? 'border-red-400/50' : ''}>
                  <h2 className="text-xl font-bold leading-snug">{v.recipe?.name ?? 'Recette supprimée'}</h2>
                  <button
                    type="button"
                    onClick={() => setExpiry(v)}
                    aria-label={`Changer la date limite de ${v.recipe?.name ?? 'cette ligne'}`}
                    className={`mt-1 flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-left text-base ${focusRing} ${
                      v.expired ? 'font-semibold text-red-300' : 'text-zinc-300'
                    }`}
                  >
                    <span>{expiryLabel(v.daysLeft)}</span>
                    <span className="text-sm text-zinc-400">{formatDateFr(v.item.expiresOn)}</span>
                  </button>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      className={roundBtn}
                      disabled={busy}
                      aria-label={`Une portion de moins : ${v.recipe?.name ?? 'recette'}`}
                      onClick={() => {
                        if (left <= 1) setRemoving(v)
                        else
                          void run(v.item.id, () => updateFridgeItem(v.item.id, { portionsLeft: left - 1 }))
                      }}
                    >
                      −
                    </button>
                    <output
                      aria-live="polite"
                      className="text-center text-4xl font-bold tabular-nums"
                      data-testid="fridge-left"
                    >
                      {fmtPortions(left)}
                      <span className="block text-sm font-medium text-zinc-400">
                        {portionsWord(left)} restante{left >= 2 ? 's' : ''}
                      </span>
                    </output>
                    <button
                      type="button"
                      className={roundBtn}
                      disabled={busy}
                      aria-label={`Une portion de plus : ${v.recipe?.name ?? 'recette'}`}
                      onClick={() =>
                        void run(v.item.id, () => updateFridgeItem(v.item.id, { portionsLeft: left + 1 }))
                      }
                    >
                      +
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
                    {v.recipe ? (
                      <Button
                        onClick={() => setLogging(v)}
                        aria-label={`Loguer une portion de ${v.recipe.name}`}
                      >
                        Loguer une portion
                      </Button>
                    ) : (
                      <span />
                    )}
                    <Button
                      variant="danger"
                      width="auto"
                      onClick={() => setRemoving(v)}
                      aria-label={`Retirer ${v.recipe?.name ?? 'cette ligne'} du frigo`}
                    >
                      Retirer
                    </Button>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {logging?.recipe && loggingNutrition && items ? (
        <LogRecipeSheet
          recipe={logging.recipe}
          nutrition={loggingNutrition}
          ciqualFailed={lib?.ciqualFailed ?? false}
          fridge={items}
          initialFridgeItemId={logging.item.id}
          onClose={() => setLogging(null)}
          onLogged={(entries) =>
            setNotice({
              message: (() => {
                const o = entries[0]?.origin
                const n = o?.kind === 'recipe' ? o.portions : 1
                return `${fmtPortions(n)} ${portionsWord(n)} ajoutée${n >= 2 ? 's' : ''} au journal.`
              })(),
              to: `/nutrition?date=${entries[0]?.date ?? ''}`,
              linkLabel: 'Journal',
            })
          }
        />
      ) : null}
      {expiry ? <ExpirySheet view={expiry} onClose={() => setExpiry(null)} /> : null}
      {removing ? (
        <ConfirmSheet
          title="Retirer du frigo ?"
          message={`Retirer ${fmtPortions(removing.item.portionsLeft)} ${portionsWord(removing.item.portionsLeft)} de « ${removing.recipe?.name ?? 'cette recette'} » du frigo, sans rien ajouter au journal ?`}
          confirmLabel="Retirer"
          busy={busyId !== null}
          onCancel={() => setRemoving(null)}
          onConfirm={() => void run(removing.item.id, () => deleteFridgeItem(removing.item.id))}
        />
      ) : null}
    </section>
  )
}
