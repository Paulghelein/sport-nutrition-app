import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PROGRESS_PATH } from '../routes'
import {
  checkNutritionParams,
  defaultNutritionParams,
  getProfile,
  listWeighIns,
  updateNutritionParams,
} from '../../db'
import { MAX_KCAL_ADJUSTMENT, nutritionTargets, targetWeight } from '../../domain/nutrition'
import { toLocalDate } from '../../domain/shared/dates'
import { fmtInt } from '../nutrition/format'
import type { NutritionParams, Profile } from '../../types'
import { errorMessage, parseDecimal, toInputNumber, useLiveQuery } from '../../ui'
import { Button, Card, Stepper } from '../../ui/kit'
import { DecimalField } from '../../ui/kit/Fields'
import { Note } from '../../ui/kit/Note'
import { SettingsSection } from './SettingsSection'

const ADJUST_STEP = 50
const round = (n: number, digits: number): number => Math.round(n * 10 ** digits) / 10 ** digits

interface Draft {
  surplus: string
  protein: string
  fat: string
  adjust: number
}

const toDraft = (p: NutritionParams): Draft => ({
  surplus: toInputNumber(round(p.surplus * 100, 1)),
  protein: toInputNumber(round(p.proteinPerKg, 2)),
  fat: toInputNumber(round(p.fatShare * 100, 1)),
  adjust: p.kcalAdjustment,
})

/** Brouillon → paramètres, ou `null` si un champ n'est pas un nombre. */
function toParams(d: Draft, base: NutritionParams): NutritionParams | null {
  const surplus = parseDecimal(d.surplus)
  const protein = parseDecimal(d.protein)
  const fat = parseDecimal(d.fat)
  if ([surplus, protein, fat].some(Number.isNaN)) return null
  return {
    ...base,
    surplus: round(surplus / 100, 4),
    proteinPerKg: protein,
    fatShare: round(fat / 100, 4),
    kcalAdjustment: d.adjust,
  }
}

const signed = (n: number): string => (n > 0 ? `+${fmtInt(n)}` : n < 0 ? `−${fmtInt(Math.abs(n))}` : '0')

function GoalsEditor({ profile, weightKg }: { profile: Profile; weightKg: number | undefined }) {
  const [draft, setDraft] = useState(() => toDraft(profile.nutrition))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const params = toParams(draft, profile.nutrition)
  const problem =
    params === null ? 'Renseigne des nombres dans les trois champs.' : checkNutritionParams(params)
  const targets =
    params !== null && problem === null && weightKg !== undefined
      ? nutritionTargets({ ...profile, nutrition: params }, weightKg, toLocalDate(new Date()))
      : undefined

  const edit = (patch: Partial<Draft>) => {
    setSaved(false)
    setError(null)
    setDraft((d) => ({ ...d, ...patch }))
  }

  const save = async () => {
    if (params === null || problem !== null) {
      setError(problem)
      return
    }
    setBusy(true)
    try {
      await updateNutritionParams({
        surplus: params.surplus,
        proteinPerKg: params.proteinPerKg,
        fatShare: params.fatShare,
        kcalAdjustment: params.kcalAdjustment,
      })
      setSaved(true)
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’enregistrer les objectifs. Réessaie.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="flex flex-col gap-4">
          <DecimalField
            label="Surplus calorique"
            unit="%"
            value={draft.surplus}
            onChange={(v) => edit({ surplus: v })}
          />
          <DecimalField
            label="Protéines"
            unit="g/kg"
            value={draft.protein}
            onChange={(v) => edit({ protein: v })}
          />
          <DecimalField
            label="Part des lipides"
            unit="%"
            value={draft.fat}
            onChange={(v) => edit({ fat: v })}
          />
          <Stepper
            label="Ajustement manuel"
            decreaseLabel={`Retirer ${ADJUST_STEP} kcal`}
            increaseLabel={`Ajouter ${ADJUST_STEP} kcal`}
            value={draft.adjust}
            step={ADJUST_STEP}
            min={-MAX_KCAL_ADJUSTMENT}
            max={MAX_KCAL_ADJUSTMENT}
            format={(v) => `${signed(v)} kcal`}
            onChange={(v) => edit({ adjust: v })}
          />

          <div className="rounded-ds-md bg-canvas p-3.5" aria-live="polite">
            <p className="m-0 text-label uppercase text-ink-muted">Objectifs par jour</p>
            {targets ? (
              <div data-testid="goals-preview" className="mt-1.5">
                <p className="m-0 font-display text-number-l tabular-nums">{fmtInt(targets.kcal)} kcal</p>
                <p className="m-0 text-body tabular-nums text-ink-muted">
                  P {fmtInt(targets.protein)} g · G {fmtInt(targets.carbs)} g · L {fmtInt(targets.fat)} g
                </p>
              </div>
            ) : weightKg === undefined ? (
              <p className="m-0 mt-1.5 text-body text-ink-muted">
                Ajoute une pesée dans{' '}
                <Link
                  to={PROGRESS_PATH}
                  className="focus-ring font-bold text-ember-ink underline underline-offset-2"
                >
                  Progrès
                </Link>{' '}
                pour voir tes objectifs.
              </p>
            ) : (
              <p className="m-0 mt-1.5 text-body text-ink">{problem}</p>
            )}
          </div>

          <Button variant="dark" fullWidth onClick={() => void save()} disabled={busy}>
            Enregistrer
          </Button>
          <Button
            fullWidth
            variant="flat"
            disabled={busy}
            onClick={() =>
              edit(toDraft({ ...defaultNutritionParams, kcalAdjustedOn: profile.nutrition.kcalAdjustedOn }))
            }
          >
            Valeurs par défaut
          </Button>
        </div>
      </Card>
      {error ? <Note tone="error">{error}</Note> : null}
      {saved ? <Note tone="success">Objectifs enregistrés.</Note> : null}
    </div>
  )
}

export default function NutritionGoalsSection() {
  const { data, error } = useLiveQuery(async () => {
    const [profile, weighIns] = await Promise.all([getProfile(), listWeighIns()])
    const today = toLocalDate(new Date())
    return { profile, weightKg: targetWeight(weighIns, today) }
  }, [])
  return (
    <SettingsSection title="Objectifs nutritionnels">
      {error ? <Note tone="error">Impossible de lire ton profil.</Note> : null}
      {data?.profile ? <GoalsEditor profile={data.profile} weightKg={data.weightKg} /> : null}
    </SettingsSection>
  )
}
