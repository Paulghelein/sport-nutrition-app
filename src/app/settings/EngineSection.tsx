import { useState } from 'react'
import { getEquipment, getSettings, updateEngineSettings } from '../../db'
import { MAJOR_GROUPS, MUSCLE_GROUPS, deloadEveryWeeks, volumeTargets } from '../../domain/training'
import type { EngineSettings, Equipment, MuscleGroup, Range } from '../../types'
import {
  Button,
  Card,
  ConfirmSheet,
  ErrorNote,
  IntegerField,
  Section,
  Stepper,
  SuccessNote,
  errorMessage,
  muscleLabel,
  useLiveQuery,
} from '../../ui'

const MAX_SETS = 30
const WARN_ABOVE = 20

interface Row {
  min: string
  max: string
}

const toRow = (r: Range): Row => ({ min: String(r[0]), max: String(r[1]) })
const same = (a: Range, b: Range) => a[0] === b[0] && a[1] === b[1]
const sameRow = (a: Row, b: Row) => a.min === b.min && a.max === b.max

/** Message FR ou `null` ; entiers 0–30 et min ≤ max. */
function checkRow(g: MuscleGroup, row: Row): string | null {
  const label = `« ${muscleLabel(g)} »`
  if (row.min === '' || row.max === '') return `Cible ${label} : renseigne le minimum et le maximum.`
  const min = Number(row.min)
  const max = Number(row.max)
  if (
    !Number.isInteger(min) ||
    !Number.isInteger(max) ||
    min < 0 ||
    max < 0 ||
    min > MAX_SETS ||
    max > MAX_SETS
  )
    return `Cible ${label} : indique des nombres entiers entre 0 et ${MAX_SETS}.`
  if (min > max) return `Cible ${label} : le minimum ne peut pas dépasser le maximum.`
  return null
}

/** Avertissements non bloquants sur les valeurs affichées. */
function warnings(rows: Record<MuscleGroup, Row>): string[] {
  const out: string[] = []
  for (const g of MUSCLE_GROUPS) {
    if (checkRow(g, rows[g]) !== null) continue
    const max = Number(rows[g].max)
    if (MAJOR_GROUPS.includes(g) && max === 0)
      out.push(`« ${muscleLabel(g)} » est à 0 : le moteur ne le travaillera plus directement.`)
    else if (max > WARN_ABOVE)
      out.push(
        `« ${muscleLabel(g)} » dépasse ${WARN_ABOVE} séries par semaine : c’est beaucoup pour un débutant.`,
      )
  }
  return out
}

function EngineEditor({ engine, equipment }: { engine: EngineSettings; equipment: Equipment }) {
  // Valeurs de la base (se mettent à jour seules : matériel changé, sauvegarde importée…).
  const loaded = volumeTargets(engine, equipment)
  const defaults = volumeTargets({ ...engine, volumeTargets: {} }, equipment)
  // Seuls les groupes que l'utilisateur a touchés sont dans `edits` ; les autres suivent la base.
  const [edits, setEdits] = useState<Partial<Record<MuscleGroup, Row>>>({})
  const [pendingWeeks, setPendingWeeks] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<MuscleGroup | 'all' | null>(null)

  const rows = {} as Record<MuscleGroup, Row>
  for (const g of MUSCLE_GROUPS) rows[g] = edits[g] ?? toRow(loaded[g])
  const weeks = pendingWeeks ?? deloadEveryWeeks(engine)

  const run = async (fn: () => Promise<void>, ok: string): Promise<boolean> => {
    setBusy(true)
    setError(null)
    setSaved(null)
    try {
      await fn()
      setSaved(ok)
      return true
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’enregistrer les réglages. Réessaie.'))
      return false
    } finally {
      setBusy(false)
    }
  }

  const dropEdits = (groups: readonly MuscleGroup[]) =>
    setEdits((prev) => {
      const next: Partial<Record<MuscleGroup, Row>> = {}
      for (const g of MUSCLE_GROUPS) {
        const row = prev[g]
        if (row !== undefined && !groups.includes(g)) next[g] = row
      }
      return next
    })

  const changeWeeks = (n: number) => {
    setPendingWeeks(n)
    void run(async () => {
      await updateEngineSettings((cur) => ({ ...cur, deloadEveryWeeks: n }))
    }, 'Fréquence enregistrée.').then(() => setPendingWeeks(null))
  }

  const saveTargets = () => {
    // Groupes réellement modifiés : brouillon différent de la valeur chargée.
    const changed = MUSCLE_GROUPS.filter((g) => {
      const e = edits[g]
      return e !== undefined && !sameRow(e, toRow(loaded[g]))
    })
    for (const g of changed) {
      const msg = checkRow(g, rows[g])
      if (msg) {
        setSaved(null)
        setError(msg)
        return
      }
    }
    if (changed.length === 0) {
      setError(null)
      setSaved('Aucune modification à enregistrer.')
      return
    }
    const values = new Map(changed.map((g) => [g, [Number(rows[g].min), Number(rows[g].max)] as Range]))
    void run(async () => {
      await updateEngineSettings((cur) => {
        const next: Partial<Record<MuscleGroup, Range>> = {}
        for (const g of MUSCLE_GROUPS) {
          const r = values.get(g) ?? cur.volumeTargets[g]
          // Pas de surcharge si la valeur est celle par défaut.
          if (r !== undefined && !(values.has(g) && same(r, defaults[g]))) next[g] = r
        }
        return { ...cur, volumeTargets: next }
      })
    }, 'Cibles enregistrées.').then((ok) => {
      if (ok) dropEdits(changed)
    })
  }

  const reset = (which: MuscleGroup | 'all') => {
    setConfirm(null)
    const groups = which === 'all' ? MUSCLE_GROUPS : [which]
    void run(
      async () => {
        await updateEngineSettings((cur) => {
          const next: Partial<Record<MuscleGroup, Range>> = {}
          for (const g of MUSCLE_GROUPS) {
            const r = cur.volumeTargets[g]
            if (r !== undefined && !groups.includes(g)) next[g] = r
          }
          return { ...cur, volumeTargets: next }
        })
      },
      which === 'all'
        ? 'Valeurs par défaut rétablies.'
        : `Cible « ${muscleLabel(which)} » : valeur d’origine rétablie.`,
    ).then((ok) => {
      if (ok) dropEdits(groups)
    })
  }

  const edit = (g: MuscleGroup, key: 'min' | 'max', v: string) => {
    setSaved(null)
    setEdits((d) => ({ ...d, [g]: { ...rows[g], [key]: v } }))
  }

  const warns = warnings(rows)

  return (
    <Card>
      <div className="flex flex-col gap-6">
        <Stepper
          legend="Semaine allégée toutes les (semaines)"
          value={weeks}
          min={3}
          max={12}
          onChange={changeWeeks}
          unitLabel="semaines entre deux semaines allégées"
          disabled={busy}
        />
        <div>
          <h3 className="m-0 text-lg font-bold">Séries par semaine et par groupe</h3>
          <p className="mb-3 mt-1 text-sm text-zinc-400">
            Cibles que le moteur cherche à atteindre. Les petits groupes à 0 sont travaillés par les autres
            exercices.
          </p>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {MUSCLE_GROUPS.map((g) => {
              const valid = checkRow(g, rows[g]) === null
              const isDefault = valid && same([Number(rows[g].min), Number(rows[g].max)], defaults[g])
              const hint = `${defaults[g][0]}–${defaults[g][1]}`
              return (
                <li key={g}>
                  <div role="group" aria-label={muscleLabel(g)}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-base font-semibold">{muscleLabel(g)}</span>
                      {isDefault ? (
                        <span className="text-sm text-zinc-500">par défaut</span>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirm(g)}
                          aria-label={`Rétablir (${hint}), ${muscleLabel(g)}`}
                          className="min-h-11 rounded-lg px-2 text-sm font-semibold text-orange-400 disabled:text-zinc-600"
                        >
                          Rétablir ({hint})
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <IntegerField
                        label="Minimum"
                        value={rows[g].min}
                        onChange={(v) => edit(g, 'min', v)}
                        unit="séries"
                        maxLength={2}
                      />
                      <IntegerField
                        label="Maximum"
                        value={rows[g].max}
                        onChange={(v) => edit(g, 'max', v)}
                        unit="séries"
                        maxLength={2}
                      />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
        {warns.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-1 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-200">
            {warns.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {saved ? <SuccessNote>{saved}</SuccessNote> : null}
        <Button onClick={saveTargets} disabled={busy}>
          Enregistrer les cibles
        </Button>
        <Button variant="secondary" onClick={() => setConfirm('all')} disabled={busy}>
          Rétablir les valeurs par défaut
        </Button>
      </div>
      {confirm ? (
        <ConfirmSheet
          title="Rétablir les valeurs par défaut ?"
          message={
            confirm === 'all'
              ? 'Toutes les cibles de séries reviennent aux valeurs d’origine.'
              : `La cible « ${muscleLabel(confirm)} » revient à la valeur d’origine.`
          }
          confirmLabel="Rétablir"
          danger={false}
          onConfirm={() => reset(confirm)}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </Card>
  )
}

export function EngineSection() {
  const { data, error } = useLiveQuery(async () => {
    const [settings, equipment] = await Promise.all([getSettings(), getEquipment()])
    return { engine: settings.engine, equipment }
  }, [])
  return (
    <Section title="Moteur d’entraînement">
      {error ? <ErrorNote>Impossible de lire les réglages du moteur.</ErrorNote> : null}
      {data ? <EngineEditor engine={data.engine} equipment={data.equipment} /> : null}
    </Section>
  )
}

export default EngineSection
