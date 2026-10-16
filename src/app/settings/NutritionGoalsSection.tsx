import { useState } from 'react'
import { Link } from 'react-router-dom'
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
import {
  Button,
  Card,
  DecimalField,
  ErrorNote,
  Section,
  SuccessNote,
  errorMessage,
  parseDecimal,
  toInputNumber,
  useLiveQuery,
} from '../../ui'

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

  const stepButton =
    'flex size-12 shrink-0 items-center justify-center rounded-xl border border-v1-line bg-v1-surface-hi text-2xl font-semibold active:bg-zinc-700 disabled:text-zinc-600'

  return (
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
        <div role="group" aria-labelledby="adjust-label">
          <p id="adjust-label" className="mb-1.5 text-sm font-medium text-zinc-300">
            Ajustement manuel
          </p>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className={stepButton}
              aria-label={`Retirer ${ADJUST_STEP} kcal`}
              disabled={draft.adjust - ADJUST_STEP < -MAX_KCAL_ADJUSTMENT}
              onClick={() => edit({ adjust: draft.adjust - ADJUST_STEP })}
            >
              −
            </button>
            <output aria-live="polite" className="text-2xl font-bold tabular-nums" data-testid="adjust">
              {signed(draft.adjust)} kcal
            </output>
            <button
              type="button"
              className={stepButton}
              aria-label={`Ajouter ${ADJUST_STEP} kcal`}
              disabled={draft.adjust + ADJUST_STEP > MAX_KCAL_ADJUSTMENT}
              onClick={() => edit({ adjust: draft.adjust + ADJUST_STEP })}
            >
              +
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-v1-line bg-v1-surface-hi p-3" aria-live="polite">
          <p className="m-0 text-sm text-zinc-400">Objectifs par jour</p>
          {targets ? (
            <p data-testid="goals-preview" className="m-0 mt-1 text-lg font-semibold">
              {fmtInt(targets.kcal)} kcal · P {fmtInt(targets.protein)} g · G {fmtInt(targets.carbs)} g · L{' '}
              {fmtInt(targets.fat)} g
            </p>
          ) : weightKg === undefined ? (
            <p className="m-0 mt-1 text-base text-zinc-300">
              Ajoute une pesée dans{' '}
              <Link to="/progres" className="font-semibold text-orange-400">
                Progrès
              </Link>{' '}
              pour voir tes objectifs.
            </p>
          ) : (
            <p className="m-0 mt-1 text-base text-amber-200">{problem}</p>
          )}
        </div>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
        {saved ? <SuccessNote>Objectifs enregistrés.</SuccessNote> : null}
        <Button onClick={() => void save()} disabled={busy}>
          Enregistrer
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() =>
            edit(toDraft({ ...defaultNutritionParams, kcalAdjustedOn: profile.nutrition.kcalAdjustedOn }))
          }
        >
          Valeurs par défaut
        </Button>
      </div>
    </Card>
  )
}

export default function NutritionGoalsSection() {
  const { data, error } = useLiveQuery(async () => {
    const [profile, weighIns] = await Promise.all([getProfile(), listWeighIns()])
    const today = toLocalDate(new Date())
    return { profile, weightKg: targetWeight(weighIns, today) }
  }, [])
  return (
    <Section title="Objectifs nutritionnels">
      {error ? <ErrorNote>Impossible de lire ton profil.</ErrorNote> : null}
      {data?.profile ? <GoalsEditor profile={data.profile} weightKg={data.weightKg} /> : null}
    </Section>
  )
}
