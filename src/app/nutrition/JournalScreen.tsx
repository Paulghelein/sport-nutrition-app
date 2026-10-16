import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { buildJournalMessage } from '../../domain/claude/context'
import {
  acceptKcalSuggestion,
  addLogEntries,
  deleteLogEntry,
  getProfile,
  listFridge,
  listLogForDate,
  listWeighIns,
} from '../../db'
import {
  copyMeal,
  dayLog,
  kcalSuggestion,
  nutritionTargets,
  roundMacros,
  targetWeight,
} from '../../domain/nutrition'
import { addDays, formatDateFr, isValidLocalDate, toLocalDate } from '../../domain/shared/dates'
import type { FoodLogEntry, KcalSuggestion, LocalDate, MealTotals, NutritionTargets } from '../../types'
import { Button, Card, ErrorNote, errorMessage, linkButtonClass, useLiveQuery } from '../../ui'
import { AskClaudeButton } from '../claude/AskClaudeButton'
import { fmtPortions, portionsWord } from '../recipes/format'
import { DaySummary } from './DaySummary'
import { EntrySheet } from './EntrySheet'
import { SLOT_LABEL, fmtG, fmtInt } from './format'
import { StickyStack, Toast } from './parts'
import type { ToastState } from './parts'

/** « Plus tard » : masque la carte pour la session (jusqu'au rechargement de l'app). */
let suggestionHidden = false

const navButton =
  'flex size-12 shrink-0 items-center justify-center rounded-xl border border-v1-line bg-v1-surface-hi text-2xl active:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400'

function dayLabel(date: LocalDate, today: LocalDate): string {
  if (date === today) return 'Aujourd’hui'
  if (date === addDays(today, -1)) return 'Hier'
  if (date === addDays(today, 1)) return 'Demain'
  return formatDateFr(date, 'long')
}

function quantity(entry: FoodLogEntry): string {
  const o = entry.origin
  if (o.kind === 'food') return `${fmtG(o.grams)} g`
  if (o.kind === 'recipe') return `${fmtG(o.portions)} portion${o.portions > 1 ? 's' : ''}`
  return o.kind === 'import' ? 'Importé' : 'Saisie libre'
}

function MealCard({
  meal,
  date,
  canCopy,
  onOpen,
  onCopy,
}: {
  meal: MealTotals
  date: LocalDate
  canCopy: boolean
  onOpen: (entry: FoodLogEntry) => void
  onCopy: () => void
}) {
  const label = SLOT_LABEL[meal.slot]
  return (
    <Card aria-label={label} role="group" className="mt-4 !p-0">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
        <h2 className="text-xl font-bold">{label}</h2>
        <p className="text-base tabular-nums text-zinc-300">
          <span className="font-semibold text-zinc-100">{fmtInt(meal.totals.kcal)}</span> kcal
        </p>
      </div>
      {meal.entries.length > 0 ? (
        <>
          <ul className="m-0 mt-2 list-none p-0">
            {meal.entries.map((entry) => {
              const kcal = roundMacros(entry.macros).kcal
              return (
                <li key={entry.id} className="border-t border-v1-line">
                  <button
                    type="button"
                    aria-label={`Modifier ${entry.name}, ${fmtInt(kcal)} kcal`}
                    onClick={() => onOpen(entry)}
                    className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-2 text-left active:bg-v1-surface-hi"
                  >
                    <span className="min-w-0">
                      <span className="block text-base font-medium leading-snug">{entry.name}</span>
                      <span className="block text-sm text-zinc-400">{quantity(entry)}</span>
                    </span>
                    <span className="shrink-0 text-base font-semibold tabular-nums">
                      {fmtInt(kcal)} <span className="text-sm font-normal text-zinc-400">kcal</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="m-0 border-t border-v1-line px-4 py-2 text-sm tabular-nums text-zinc-400">
            P {fmtG(roundMacros(meal.totals).protein)} g · G {fmtG(roundMacros(meal.totals).carbs)} g · L{' '}
            {fmtG(roundMacros(meal.totals).fat)} g
          </p>
        </>
      ) : null}
      <div className="flex gap-2 p-3">
        <Link
          to={`/nutrition/ajouter?repas=${meal.slot}&date=${date}`}
          aria-label={`Ajouter au repas : ${label}`}
          className={linkButtonClass('secondary', 'full')}
        >
          Ajouter
        </Link>
        {canCopy ? (
          <Button
            variant="ghost"
            width="auto"
            className="shrink-0"
            aria-label={`Copier d’hier : ${label}`}
            onClick={onCopy}
          >
            Copier d’hier
          </Button>
        ) : null}
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

  const { data, error: loadError } = useLiveQuery(async () => {
    const [entries, yesterday, profile, weighIns] = await Promise.all([
      listLogForDate(date),
      listLogForDate(addDays(date, -1)),
      getProfile(),
      listWeighIns(),
    ])
    return { entries, yesterday, profile, weighIns }
  }, [date])

  const fridge = useLiveQuery(() => listFridge(), [])
  const fridgePortions = (fridge.data ?? []).reduce((sum, f) => sum + f.portionsLeft, 0)

  const go = (target: LocalDate) => setParams(target === today ? {} : { date: target }, { replace: true })

  const log = data ? dayLog(data.entries, date) : undefined
  const yesterdayLog = data ? dayLog(data.yesterday, addDays(date, -1)) : undefined

  let targets: NutritionTargets | undefined
  let suggestion: KcalSuggestion | undefined
  if (data?.profile) {
    const weight = targetWeight(data.weighIns, date) ?? targetWeight(data.weighIns, today)
    if (weight !== undefined) targets = nutritionTargets(data.profile, weight, date)
    if (date === today) suggestion = kcalSuggestion(data.profile, data.weighIns, today)
  }

  const copy = async (slot: MealTotals['slot']) => {
    const source = yesterdayLog?.meals.find((m) => m.slot === slot)
    if (!source || source.entries.length === 0 || busy.current) return
    busy.current = true
    setError(null)
    try {
      const copies = copyMeal(source.entries, date, slot, {
        newId: () => crypto.randomUUID(),
        now: new Date().toISOString(),
      })
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
    <>
      <h1 className="text-3xl font-bold">Nutrition</h1>
      <nav aria-label="Recettes, frigo et courses" className="mt-2 grid grid-cols-3 gap-2">
        {[
          { to: '/nutrition/recettes', label: 'Recettes', aria: 'Recettes' },
          {
            to: '/nutrition/frigo',
            label: fridgePortions > 0 ? `Frigo (${fmtPortions(fridgePortions)})` : 'Frigo',
            aria:
              fridgePortions > 0
                ? `Frigo, ${fmtPortions(fridgePortions)} ${portionsWord(fridgePortions)}`
                : 'Frigo',
          },
          { to: '/nutrition/courses', label: 'Courses', aria: 'Courses' },
        ].map((l) => (
          <Link
            key={l.to}
            to={l.to}
            aria-label={l.aria}
            className="flex min-h-11 items-center justify-center rounded-xl border border-v1-line px-2 text-center text-base font-medium text-zinc-200 no-underline active:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          className={navButton}
          aria-label="Jour précédent"
          onClick={() => go(addDays(date, -1))}
        >
          ‹
        </button>
        <p
          aria-live="polite"
          className="m-0 min-w-0 flex-1 text-center text-lg font-semibold capitalize leading-tight"
        >
          {dayLabel(date, today)}
        </p>
        <button
          type="button"
          className={navButton}
          aria-label="Jour suivant"
          onClick={() => go(addDays(date, 1))}
        >
          ›
        </button>
      </div>
      {date !== today ? (
        <Button variant="ghost" className="mt-1" onClick={() => go(today)}>
          Aujourd’hui
        </Button>
      ) : null}

      {loadError ? <ErrorNote>Impossible de lire le journal.</ErrorNote> : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {log ? (
        <div className="mt-4">
          <DaySummary totals={log.totals} targets={targets} />
          {suggestion && !hidden ? (
            <Card className="mt-4 border-orange-400/40">
              <h2 className="text-lg font-bold">Ajuster tes calories ?</h2>
              <p className="mb-3 mt-1 text-base text-zinc-300">{suggestion.message}</p>
              <div className="flex gap-2">
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
          {log.meals.map((meal) => (
            <MealCard
              key={meal.slot}
              meal={meal}
              date={date}
              canCopy={(yesterdayLog?.meals.find((m) => m.slot === meal.slot)?.entries.length ?? 0) > 0}
              onOpen={setOpenEntry}
              onCopy={() => void copy(meal.slot)}
            />
          ))}
        </div>
      ) : null}

      {log ? (
        <div className="mt-4">
          <AskClaudeButton
            kind="journal"
            // Objectifs du jour affiché (affichés à l'écran) ; repli sur ceux d'aujourd'hui si le jour consulté n'a pas de poids de référence.
            build={(base) => buildJournalMessage({ ...base, targets: targets ?? base.targets, day: log })}
          />
        </div>
      ) : null}

      <StickyStack>
        <Toast toast={toast} onDismiss={dismissToast} />
      </StickyStack>
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
    </>
  )
}
