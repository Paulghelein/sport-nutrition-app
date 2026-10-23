import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { buildJournalMessage } from '../../domain/claude/context'
import {
  acceptKcalSuggestion,
  addLogEntries,
  deleteLogEntry,
  getCiqualFoodsByIds,
  getFoodRowsByIds,
  getProfile,
  listLogForDate,
  listWeighIns,
} from '../../db'
import { addDays, isValidLocalDate, toLocalDate } from '../../domain/shared/dates'
import type { FoodLogEntry, Id, LocalDate, MealSlot } from '../../types'
import { errorMessage, useLiveQuery } from '../../ui'
import { Button, Card, cx } from '../../ui/kit'
import { FoodRow } from '../../ui/kit/FoodRow'
import { Note } from '../../ui/kit/Note'
import { AskClaudeButton } from '../claude/AskClaudeButton'
import { DaySummary } from './DaySummary'
import { EntrySheet } from './EntrySheet'
import { Toast } from './JournalToast'
import type { ToastState } from './JournalToast'
import { ADD_FOOD_PATH } from '../routes'
import { NutritionTabs } from './NutritionTabs'
import { SLOT_LABEL, fmtInt } from './format'
import { buildJournalModel, dayLabel, mealCopies } from './journalModel'
import type { JournalMealModel } from './journalModel'
import { usePhotoUrls } from './usePhotoUrls'

/** « Plus tard » : masque la carte pour la session (jusqu'au rechargement de l'app). */
let suggestionHidden = false

const dayButton =
  'focus-ring grid size-11 shrink-0 place-items-center rounded-full text-ink disabled:text-ink-faint'
const textAction =
  'focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-ds-pill px-3 text-body-strong no-underline active:opacity-70'

function MealCard({
  meal,
  date,
  photoUrls,
  onOpen,
  onCopy,
}: {
  meal: JournalMealModel
  date: LocalDate
  photoUrls: ReadonlyMap<Id, string>
  onOpen: (entry: FoodLogEntry) => void
  onCopy: () => void
}) {
  const addTo = `${ADD_FOOD_PATH}?repas=${meal.slot}&date=${date}`
  const copy = meal.canCopy ? (
    <button
      type="button"
      aria-label={`Copier d’hier : ${meal.label}`}
      onClick={onCopy}
      className={cx(textAction, 'text-ink')}
    >
      Copier d’hier
    </button>
  ) : null

  // Repas vide : pastille « Dîner  + Ajouter » (maquette), la copie d'hier à côté si la veille a ce repas.
  if (meal.rows.length === 0) {
    return (
      <div
        role="group"
        aria-label={meal.label}
        className="flex items-center gap-1 rounded-ds-pill bg-surface pr-2 shadow-card"
      >
        <Link
          to={addTo}
          aria-label={`Ajouter au repas : ${meal.label}`}
          className="focus-ring flex min-h-[52px] min-w-0 flex-1 items-center justify-between gap-3 rounded-ds-pill pl-[18px] pr-2 text-body-strong text-ink no-underline active:opacity-70"
        >
          <span>{meal.label}</span>
          <span className="text-ember-ink">+ Ajouter</span>
        </Link>
        {copy}
      </div>
    )
  }

  return (
    <Card aria-label={meal.label} role="group" padding="none" className="px-4 pb-1.5 pt-3">
      <div className="flex items-baseline justify-between gap-3 pb-1.5">
        <h2 className="m-0 font-display text-title">{meal.label}</h2>
        <p className="m-0 font-display text-body-strong tabular-nums">
          {fmtInt(meal.kcal)}
          <span className="font-sans text-caption font-medium text-ink-muted">{' kcal'}</span>
        </p>
      </div>
      <ul className="m-0 list-none p-0">
        {meal.rows.map((row) => (
          <li key={row.entry.id} className="border-t border-line first:border-t-0">
            <FoodRow
              name={row.entry.name}
              quantity={row.quantity}
              protein={row.macros.protein}
              carbs={row.macros.carbs}
              fat={row.macros.fat}
              kcal={row.macros.kcal}
              category={row.visual.category}
              photoUrl={row.visual.photoFoodId ? photoUrls.get(row.visual.photoFoodId) : undefined}
              scanned={row.visual.scanned}
              fromFridge={row.visual.fromFridge}
              ariaLabel={row.ariaLabel}
              onPress={() => onOpen(row.entry)}
            />
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-line">
        <Link
          to={addTo}
          aria-label={`Ajouter au repas : ${meal.label}`}
          className={cx(textAction, 'text-ember-ink')}
        >
          <Plus size={18} strokeWidth={1.75} aria-hidden="true" />
          Ajouter
        </Link>
        {copy}
      </div>
    </Card>
  )
}

/** Jour courant, recalculé au retour au premier plan (l'app peut rester ouverte au-delà de minuit). */
function useToday(): LocalDate {
  const [today, setToday] = useState(() => toLocalDate(new Date()))
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') setToday(toLocalDate(new Date()))
    }
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [])
  return today
}

export default function JournalScreen() {
  const [params, setParams] = useSearchParams()
  const today = useToday()
  const asked = params.get('date')
  const date: LocalDate = asked !== null && isValidLocalDate(asked) ? asked : today
  const [openEntry, setOpenEntry] = useState<FoodLogEntry | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState(suggestionHidden)
  const [accepting, setAccepting] = useState(false)
  const busy = useRef(false)
  const dismissToast = useCallback(() => setToast(null), [])
  // `?claude=1` (feuille Ajouter › Décrire à Claude) : ouvre l'aperçu d'envoi, puis nettoie l'adresse (replace).
  const openClaude = params.get('claude') === '1'
  const claudeOpened = useCallback(
    () =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('claude')
          return next
        },
        { replace: true },
      ),
    [setParams],
  )

  const { data, error: loadError } = useLiveQuery(async () => {
    const [entries, yesterday, profile, weighIns] = await Promise.all([
      listLogForDate(date),
      listLogForDate(addDays(date, -1)),
      getProfile(),
      listWeighIns(),
    ])
    // Seuls les aliments du jour sont lus (lignes `foods` et groupes Ciqual), pas les tables entières.
    const foodIds = entries.flatMap((e) => (e.origin.kind === 'food' ? [e.origin.foodId] : []))
    const [foods, ciqual] = await Promise.all([getFoodRowsByIds(foodIds), getCiqualFoodsByIds(foodIds)])
    const ciqualGroups = new Map<Id, string>()
    for (const [id, c] of ciqual) ciqualGroups.set(id, c.group)
    return { date, entries, yesterday, profile, weighIns, foods, ciqualGroups }
  }, [date])

  // Pendant un changement de jour, les données de l'ancien jour sont ignorées (pas d'affichage du mauvais jour).
  const model = useMemo(
    () => (data && data.date === date ? buildJournalModel({ ...data, today }) : undefined),
    [data, date, today],
  )
  const photoUrls = usePhotoUrls(model?.photoFoodIds ?? [])

  const go = (target: LocalDate) => setParams(target === today ? {} : { date: target }, { replace: true })

  const copy = async (slot: MealSlot) => {
    if (!data || data.date !== date || busy.current) return
    const copies = mealCopies({ date, yesterday: data.yesterday }, slot, {
      newId: () => crypto.randomUUID(),
      now: new Date().toISOString(),
    })
    if (copies.length === 0) return
    busy.current = true
    setError(null)
    try {
      await addLogEntries(copies)
      const ids = copies.map((c) => c.id)
      setToast({
        message: `${SLOT_LABEL[slot]} d’hier copié (${ids.length})`,
        undo: async () => {
          await Promise.all(ids.map(deleteLogEntry))
        },
      })
    } catch (e) {
      setError(errorMessage(e, 'Impossible de copier ce repas. Réessaie.'))
    } finally {
      busy.current = false
    }
  }

  const suggestion = model?.suggestion
  const accept = async () => {
    if (!suggestion || accepting) return
    setAccepting(true)
    setError(null)
    try {
      await acceptKcalSuggestion(suggestion.kcal, today)
    } catch (e) {
      // Déjà appliqué (double tap, autre onglet) : la carte disparaît d'elle-même, message sans alarme.
      setError(errorMessage(e, 'Impossible d’enregistrer l’ajustement. Réessaie.'))
    } finally {
      setAccepting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <header className="flex flex-wrap items-end justify-between gap-x-3">
        <h1 className="m-0 font-display text-display-l">Nutrition</h1>
        <div className="flex items-center">
          <button
            type="button"
            className={dayButton}
            aria-label="Jour précédent"
            onClick={() => go(addDays(date, -1))}
          >
            <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <p aria-live="polite" className="m-0 text-body-strong first-letter:uppercase">
            {dayLabel(date, today)}
          </p>
          <button
            type="button"
            className={dayButton}
            aria-label="Jour suivant"
            onClick={() => go(addDays(date, 1))}
          >
            <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </header>

      <NutritionTabs current="journal" />

      {date !== today ? (
        <div className="flex justify-center">
          <Button variant="text" onClick={() => go(today)}>
            Revenir à aujourd’hui
          </Button>
        </div>
      ) : null}

      {loadError ? <Note tone="error">Impossible de lire le journal.</Note> : null}
      {error ? <Note tone="error">{error}</Note> : null}

      {model ? (
        <>
          <DaySummary bilan={model.bilan} />
          {suggestion && !hidden ? (
            <Card padding="large" className="flex flex-col gap-3">
              <h2 className="m-0 font-display text-title">Ajuster tes calories ?</h2>
              <p className="m-0 text-body text-ink-muted">{suggestion.message}</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void accept()} disabled={accepting}>
                  Ajouter {suggestion.kcal} kcal
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    suggestionHidden = true
                    setHidden(true)
                  }}
                >
                  Plus tard
                </Button>
              </div>
            </Card>
          ) : null}
          {model.meals.map((meal) => (
            <MealCard
              key={meal.slot}
              meal={meal}
              date={date}
              photoUrls={photoUrls}
              onOpen={setOpenEntry}
              onCopy={() => void copy(meal.slot)}
            />
          ))}
          <AskClaudeButton
            kind="journal"
            defaultOpen={openClaude}
            onDefaultOpened={claudeOpened}
            // Objectifs du jour affiché (affichés à l'écran) ; repli sur ceux d'aujourd'hui si le jour consulté n'a pas de poids de référence.
            build={(base) =>
              buildJournalMessage({ ...base, targets: model.bilan.targets ?? base.targets, day: model.log })
            }
            renderTrigger={({ onClick, disabled, busy: waiting, label }) => (
              <Button variant="secondary" fullWidth onClick={onClick} disabled={disabled} aria-busy={waiting}>
                {label}
              </Button>
            )}
          />
        </>
      ) : null}

      {/* Zone collante en bas de <main> (jamais `fixed`) : au-dessus de la barre d'onglets flottante. */}
      <div className="sticky bottom-2 z-10">
        <Toast toast={toast} onDismiss={dismissToast} />
      </div>
      {openEntry ? (
        <EntrySheet
          key={openEntry.id}
          entry={openEntry}
          onClose={() => setOpenEntry(null)}
          onSaved={() => {
            setOpenEntry(null)
            setToast({ message: 'Entrée modifiée' })
          }}
          onDeleted={() => {
            setOpenEntry(null)
            setToast({ message: 'Entrée supprimée' })
          }}
        />
      ) : null}
    </div>
  )
}
