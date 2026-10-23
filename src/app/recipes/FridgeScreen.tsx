import { AlertTriangle, Minus, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteFridgeItem, updateFridgeItem } from '../../db'
import { fridgeViews, recipeNutrition } from '../../domain/nutrition'
import { formatDateFr, toLocalDate } from '../../domain/shared/dates'
import type { FridgeView } from '../../types'
import { errorMessage } from '../../ui'
import { Button, Card, FoodTile, Sheet, cx } from '../../ui/kit'
import { buttonClass } from '../../ui/kit/buttonClass'
import { ConfirmSheet } from '../../ui/kit/ConfirmSheet'
import { TextField } from '../../ui/kit/Fields'
import { Note } from '../../ui/kit/Note'
import { formatDecimal } from '../../ui/kit/format'
import { NutritionTabs } from '../nutrition/NutritionTabs'
import { expiryLabel, portionUnit, portionsText } from './format'
import { Loading, Notice, RECIPES_PATH } from './parts'
import type { NoticeState } from './parts'
import { loggedNotice } from './loggedNotice'
import { RecipeLogSheet } from './RecipeLogSheet'
import { fridgePortionsTotal, useFridge } from './useFridge'
import { useRecipeLibrary } from './useRecipes'

const roundBtn =
  'focus-ring grid size-12 shrink-0 place-items-center rounded-full bg-canvas text-ink active:opacity-70 disabled:text-ink-faint'

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
    <Sheet
      title="Date limite"
      description={view.recipe?.name ?? 'Recette supprimée'}
      onClose={onClose}
      busy={busy}
    >
      <div className="flex flex-col gap-4">
        <TextField label="À consommer avant le" type="date" value={date} onChange={setDate} />
        {error ? <Note tone="error">{error}</Note> : null}
        <Button fullWidth onClick={() => void save()} disabled={busy}>
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
    <div className="flex flex-col gap-3.5">
      <header>
        <h1 className="m-0 font-display text-display-l">Frigo</h1>
      </header>
      <NutritionTabs current="fridge" fridgePortions={fridgePortionsTotal(items)} />
      <p className="m-0 text-body text-ink-muted">
        Les portions préparées à l’avance. Loguer une portion depuis ici la retire du frigo.
      </p>

      {libError || fridgeError || error ? (
        <Note tone="error">{error ?? 'Impossible de lire le frigo. Ferme l’app puis rouvre-la.'}</Note>
      ) : null}
      <Notice notice={notice} />

      {!views ? (
        <Loading />
      ) : views.length === 0 ? (
        <Card padding="large" className="flex flex-col items-center gap-1 text-center">
          <p className="m-0 font-display text-title">Le frigo est vide</p>
          <p className="m-0 text-body text-ink-muted">
            Ouvre une recette et choisis « Préparer pour le frigo » après avoir cuisiné un batch.
          </p>
          <Link to={RECIPES_PATH} className={cx(buttonClass('flat'), 'mt-3')}>
            Voir les recettes
          </Link>
        </Card>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3.5 p-0">
          {views.map((v) => {
            const left = v.item.portionsLeft
            const busy = busyId === v.item.id
            const name = v.recipe?.name ?? 'Recette supprimée'
            return (
              <li key={v.item.id}>
                <Card padding="large" className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <FoodTile category="dish" fromFridge size={48} />
                    <h2 className="m-0 min-w-0 flex-1 font-display text-title">{name}</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpiry(v)}
                    aria-label={`Changer la date limite de ${v.recipe?.name ?? 'cette ligne'}`}
                    className={cx(
                      'focus-ring -my-1 flex min-h-11 w-full items-center justify-between gap-2 rounded-sm text-left text-body',
                      v.expired ? 'font-bold text-critical' : 'text-ink',
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      {v.expired ? <AlertTriangle size={18} strokeWidth={1.75} aria-hidden="true" /> : null}
                      {expiryLabel(v.daysLeft)}
                    </span>
                    <span className="text-caption font-medium text-ink-muted">
                      {formatDateFr(v.item.expiresOn)}
                    </span>
                  </button>
                  <div className="flex items-center justify-between gap-3">
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
                      <Minus size={24} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                    <output
                      aria-live="polite"
                      className="text-center font-display text-display-l tabular-nums"
                      data-testid="fridge-left"
                    >
                      {formatDecimal(left, 2)}
                      <span className="block font-sans text-caption font-medium text-ink-muted">
                        {portionUnit(left, v.recipe?.servingUnit)} au frigo
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
                      <Plus size={24} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {v.recipe ? (
                      <Button
                        className="flex-1"
                        onClick={() => setLogging(v)}
                        aria-label={`Loguer une portion de ${v.recipe.name}`}
                      >
                        Loguer une portion
                      </Button>
                    ) : null}
                    <Button
                      variant="dangerSoft"
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
        <RecipeLogSheet
          recipe={logging.recipe}
          nutrition={loggingNutrition}
          ciqualFailed={lib?.ciqualFailed ?? false}
          fridge={items}
          initialFridgeItemId={logging.item.id}
          onClose={() => setLogging(null)}
          onLogged={(entries, fridgeBefore) =>
            setNotice(loggedNotice(entries, fridgeBefore, logging.recipe?.servingUnit))
          }
        />
      ) : null}
      {expiry ? <ExpirySheet view={expiry} onClose={() => setExpiry(null)} /> : null}
      {removing ? (
        <ConfirmSheet
          title="Retirer du frigo ?"
          message={`Retirer ${portionsText(removing.item.portionsLeft, removing.recipe?.servingUnit)} de « ${removing.recipe?.name ?? 'cette recette'} » du frigo, sans rien ajouter au journal ?`}
          confirmLabel="Retirer"
          busy={busyId !== null}
          onCancel={() => setRemoving(null)}
          onConfirm={() => void run(removing.item.id, () => deleteFridgeItem(removing.item.id))}
        />
      ) : null}
    </div>
  )
}
