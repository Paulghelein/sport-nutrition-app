import { AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { getEquipment, getSettings, updateEngineSettings } from '../../db'
import { MAJOR_GROUPS, MUSCLE_GROUPS, deloadEveryWeeks, volumeTargets } from '../../domain/training'
import type { EngineSettings, Equipment, MuscleGroup, Range } from '../../types'
import { errorMessage, muscleLabel, useLiveQuery } from '../../ui'
import { Button, Card, Stepper } from '../../ui/kit'
import { ConfirmSheet } from '../../ui/kit/ConfirmSheet'
import { IntegerField } from '../../ui/kit/Fields'
import { Note } from '../../ui/kit/Note'
import { SettingsSection } from './SettingsSection'

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
  // Groupe dont un champ a le focus : ni avertissement ni message pendant la saisie (ils arrivent à la sortie du champ).
  const [focused, setFocused] = useState<MuscleGroup | null>(null)
  // Groupes dont le message de validation est affiché (après une sortie de champ ou un enregistrement).
  const [checked, setChecked] = useState<ReadonlySet<MuscleGroup>>(new Set())

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
    const row = { ...rows[g], [key]: v }
    setEdits((d) => {
      // Ramené à la valeur enregistrée : le groupe quitte le brouillon et suit de nouveau la base.
      const kept = Object.entries(d).filter(([k]) => k !== g)
      const next = Object.fromEntries(kept) as Partial<Record<MuscleGroup, Row>>
      if (!sameRow(row, toRow(loaded[g]))) next[g] = row
      return next
    })
    setChecked((prev) => {
      if (!prev.has(g)) return prev
      const next = new Set(prev)
      next.delete(g)
      return next
    })
  }

  const leaveGroup = (g: MuscleGroup) => {
    setFocused((cur) => (cur === g ? null : cur))
    setChecked((prev) => new Set(prev).add(g))
  }

  // Pendant la saisie d'un groupe, ses valeurs partielles (« 1 » en route vers « 12 ») ne déclenchent rien.
  const stable = {} as Record<MuscleGroup, Row>
  for (const g of MUSCLE_GROUPS) stable[g] = g === focused ? toRow(loaded[g]) : rows[g]
  const warns = warnings(stable)

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="flex flex-col gap-6">
          <Stepper
            label="Semaine allégée toutes les (semaines)"
            decreaseLabel="Diminuer : semaines entre deux semaines allégées"
            increaseLabel="Augmenter : semaines entre deux semaines allégées"
            value={weeks}
            min={3}
            max={12}
            onChange={changeWeeks}
            disabled={busy}
          />
          <div>
            <h3 className="m-0 font-display text-title">Séries par semaine et par groupe</h3>
            <p className="mb-3 mt-1 text-body text-ink-muted">
              Cibles que le moteur cherche à atteindre. Les petits groupes à 0 sont travaillés par les autres
              exercices.
            </p>
            <ul className="m-0 flex list-none flex-col p-0">
              {MUSCLE_GROUPS.map((g) => {
                const problem = checked.has(g) && focused !== g ? checkRow(g, rows[g]) : null
                const valid = checkRow(g, rows[g]) === null
                const isDefault =
                  focused !== g && valid && same([Number(rows[g].min), Number(rows[g].max)], defaults[g])
                const hint = `${defaults[g][0]}–${defaults[g][1]}`
                return (
                  <li key={g} className="border-t border-line py-4 first:border-t-0 first:pt-0">
                    <div
                      role="group"
                      aria-label={muscleLabel(g)}
                      onFocus={() => setFocused(g)}
                      onBlur={(e) => {
                        // Le focus reste dans le groupe (passage de « Minimum » à « Maximum ») : rien à valider.
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) leaveGroup(g)
                      }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-headline">{muscleLabel(g)}</span>
                        {isDefault ? (
                          <span className="text-caption text-ink-muted">par défaut</span>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setConfirm(g)}
                            aria-label={`Rétablir (${hint}), ${muscleLabel(g)}`}
                            className="focus-ring min-h-11 rounded-ds-sm px-2 text-caption font-bold text-ember-ink disabled:text-ink-muted"
                          >
                            Rétablir ({hint})
                          </button>
                        )}
                      </div>
                      <div className="mt-1 grid grid-cols-2 gap-3">
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
                      {problem ? (
                        <p className="m-0 mt-2 flex items-start gap-1.5 text-caption text-critical">
                          <AlertCircle
                            size={16}
                            strokeWidth={1.75}
                            aria-hidden="true"
                            className="mt-px shrink-0"
                          />
                          {problem}
                        </p>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
          <Button variant="dark" fullWidth onClick={saveTargets} disabled={busy}>
            Enregistrer les cibles
          </Button>
          <Button fullWidth variant="flat" onClick={() => setConfirm('all')} disabled={busy}>
            Rétablir les valeurs par défaut
          </Button>
        </div>
      </Card>
      {warns.length > 0 ? (
        <Note tone="warning">
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {warns.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Note>
      ) : null}
      {error ? <Note tone="error">{error}</Note> : null}
      {saved ? <Note tone="success">{saved}</Note> : null}
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
    </div>
  )
}

export function EngineSection() {
  const { data, error } = useLiveQuery(async () => {
    const [settings, equipment] = await Promise.all([getSettings(), getEquipment()])
    return { engine: settings.engine, equipment }
  }, [])
  return (
    <SettingsSection title="Moteur d’entraînement">
      {error ? <Note tone="error">Impossible de lire les réglages du moteur.</Note> : null}
      {data ? <EngineEditor engine={data.engine} equipment={data.equipment} /> : null}
    </SettingsSection>
  )
}

export default EngineSection
