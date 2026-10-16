import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  checkEquipment,
  checkProfileIdentity,
  checkWeeklySessions,
  checkWeighIn,
  completeOnboarding,
  defaultEquipment,
} from '../db'
import { ageOn, formatDateFr, toLocalDate } from '../domain/shared'
import {
  Button,
  DecimalField,
  EquipmentFields,
  ErrorNote,
  GoalFields,
  IdentityFields,
  activityLabel,
  draftToEquipment,
  draftToProfile,
  equipmentToDraft,
  errorMessage,
  formatKg,
  goalLabel,
  isGoalsFilled,
  isIdentityFilled,
  levelLabel,
  newProfileDraft,
  ownableEquipment,
  parseDecimal,
  sexLabel,
} from '../ui'
import type { EquipmentDraft, ProfileDraft } from '../ui'

const STEPS = ['welcome', 'about', 'goals', 'weight', 'equipment', 'recap'] as const
type Step = (typeof STEPS)[number]

const titles: Record<Exclude<Step, 'welcome'>, string> = {
  about: 'Toi',
  goals: 'Ton objectif',
  weight: 'Ton poids',
  equipment: 'Ton matériel',
  recap: 'Récapitulatif',
}

export function Onboarding() {
  const navigate = useNavigate()
  const [stepIndex, setStepIndex] = useState(0)
  const [profile, setProfile] = useState<ProfileDraft>(newProfileDraft)
  const [weight, setWeight] = useState('')
  const [equipment, setEquipment] = useState<EquipmentDraft>(() =>
    equipmentToDraft(defaultEquipment(new Date().toISOString())),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const step: Step = STEPS[stepIndex] ?? 'welcome'
  const today = toLocalDate(new Date())

  const canContinue =
    step === 'about'
      ? isIdentityFilled(profile)
      : step === 'goals'
        ? isGoalsFilled(profile)
        : step === 'weight'
          ? weight.trim() !== ''
          : true

  /** Message du validateur de l'étape courante, ou null. */
  const validateStep = (): string | null => {
    switch (step) {
      case 'about':
        return checkProfileIdentity({ birthDate: profile.birthDate, heightCm: parseDecimal(profile.heightCm) }, today)
      case 'goals':
        return checkWeeklySessions({
          weeklySessionsTarget: parseDecimal(profile.weeklySessionsTarget),
          weeklySessionsMin: parseDecimal(profile.weeklySessionsMin),
        })
      case 'weight':
        return checkWeighIn({ date: today, weightKg: parseDecimal(weight) }, today)
      case 'equipment':
        return checkEquipment(draftToEquipment(equipment, new Date().toISOString()))
      default:
        return null
    }
  }

  const next = () => {
    const message = validateStep()
    if (message) {
      setError(message)
      return
    }
    go(1)
  }

  const go = (delta: number) => {
    setError(null)
    setStepIndex((i) => Math.min(STEPS.length - 1, Math.max(0, i + delta)))
  }

  const finish = async () => {
    setBusy(true)
    setError(null)
    try {
      const now = new Date().toISOString()
      await completeOnboarding(
        {
          profile: draftToProfile(profile, null, now),
          equipment: draftToEquipment(equipment, now),
          weighIn: { date: today, weightKg: parseDecimal(weight) },
        },
        now,
      )
      navigate('/seance', { replace: true })
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’enregistrer pour le moment. Réessaie.'))
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header
        className="px-4 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <div className="mx-auto flex max-w-xl items-center gap-3">
          {stepIndex > 0 ? (
            <Button variant="ghost" width="auto" className="!px-2" onClick={() => go(-1)} aria-label="Retour">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" />
              </svg>
              Retour
            </Button>
          ) : (
            <span className="min-h-12" />
          )}
          {stepIndex > 0 ? (
            <p className="ml-auto text-sm text-zinc-400" aria-live="polite">
              Étape {stepIndex} sur {STEPS.length - 1}
            </p>
          ) : null}
        </div>
        {stepIndex > 0 ? (
          <div className="mx-auto mt-1 h-1 max-w-xl overflow-hidden rounded-full bg-v1-surface-hi" aria-hidden="true">
            <div
              className="h-full rounded-full bg-orange-400 transition-[width]"
              style={{ width: `${(stepIndex / (STEPS.length - 1)) * 100}%` }}
            />
          </div>
        ) : null}
      </header>

      <main className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-6">
        <div className="mx-auto max-w-xl">
          {step === 'welcome' ? (
            <div className="pt-10">
              <p className="text-sm font-semibold uppercase tracking-widest text-orange-400">Forge</p>
              <h1 className="mt-3 text-5xl font-extrabold leading-tight tracking-tight">Bienvenue.</h1>
              <p className="mt-5 text-lg text-zinc-300">
                Des séances de renforcement adaptées à ton temps et à ta semaine, et un suivi de ton alimentation
                pour prendre de la masse.
              </p>
              <p className="mt-4 text-base text-zinc-400">
                Quelques questions pour te connaître. Tout reste sur ton téléphone, et tu pourras tout modifier
                ensuite dans les Réglages.
              </p>
            </div>
          ) : (
            <h1 className="mt-4 mb-5 text-3xl font-bold">{titles[step]}</h1>
          )}

          {step === 'about' ? <IdentityFields draft={profile} onChange={setProfile} /> : null}
          {step === 'goals' ? <GoalFields draft={profile} onChange={setProfile} /> : null}
          {step === 'weight' ? (
            <div className="flex flex-col gap-4">
              <p className="text-base text-zinc-300">
                C’est ta première pesée, enregistrée aujourd’hui ({formatDateFr(today, 'long')}). Pèse-toi le matin,
                à jeun, pour avoir une valeur comparable d’un jour à l’autre.
              </p>
              <DecimalField label="Poids actuel" unit="kg" big value={weight} onChange={setWeight} placeholder="72,5" />
            </div>
          ) : null}
          {step === 'equipment' ? <EquipmentFields draft={equipment} onChange={setEquipment} /> : null}
          {step === 'recap' ? (
            <Recap profile={profile} weight={weight} equipment={equipment} today={today} />
          ) : null}

          {error ? (
            <div className="mt-5">
              <ErrorNote>{error}</ErrorNote>
            </div>
          ) : null}
        </div>
      </main>

      <footer
        className="border-t border-v1-line bg-v1-bg px-4 pt-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
      >
        <div className="mx-auto max-w-xl">
          {step === 'recap' ? (
            <Button onClick={finish} disabled={busy}>
              {busy ? 'Enregistrement…' : 'C’est parti'}
            </Button>
          ) : (
            <Button onClick={next} disabled={!canContinue}>
              {step === 'welcome' ? 'Commencer' : 'Continuer'}
            </Button>
          )}
        </div>
      </footer>
    </div>
  )
}

function Recap({
  profile,
  weight,
  equipment,
  today,
}: {
  profile: ProfileDraft
  weight: string
  equipment: EquipmentDraft
  today: string
}) {
  const w = parseDecimal(weight)
  const owned = ownableEquipment.filter((e) => equipment.owned.includes(e.id)).map((e) => e.label)
  const age = profile.birthDate ? ageOn(profile.birthDate, today) : null
  const rows: [string, string][] = [
    ['Sexe', sexLabel(profile.sex)],
    ['Âge', age === null ? '—' : `${age} ans`],
    ['Taille', `${profile.heightCm} cm`],
    ['Activité', activityLabel(profile.activityLevel)],
    ['Objectif', goalLabel(profile.goal)],
    ['Niveau', levelLabel(profile.level)],
    ['Séances / semaine', `${profile.weeklySessionsTarget} (minimum ${profile.weeklySessionsMin})`],
    ['Poids', Number.isFinite(w) ? `${formatKg(w)} kg` : '—'],
    ['Kettlebell', `${equipment.minKg} à ${equipment.maxKg} kg, pas de ${equipment.stepKg} kg`],
    ['Autre matériel', owned.length > 0 ? owned.join(', ') : 'Aucun'],
  ]
  return (
    <dl className="divide-y divide-v1-line rounded-2xl border border-v1-line bg-v1-surface">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-zinc-400">{label}</dt>
          <dd className="m-0 text-right text-base font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
