import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HOME_PATH } from './routes'
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
import { Button, Card } from '../ui/kit'
import { DecimalField } from '../ui/kit/Fields'
import { Note } from '../ui/kit/Note'
import { EquipmentFields } from './settings/EquipmentFields'
import { GoalFields, IdentityFields } from './settings/ProfileFields'

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
        return checkProfileIdentity(
          { birthDate: profile.birthDate, heightCm: parseDecimal(profile.heightCm) },
          today,
        )
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
      navigate(HOME_PATH, { replace: true })
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’enregistrer pour le moment. Réessaie.'))
      setBusy(false)
    }
  }

  return (
    <div className="ds-page flex min-h-0 flex-1 flex-col">
      <header
        className="shrink-0 px-4 pb-2"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)',
          paddingLeft: 'calc(env(safe-area-inset-left) + 1rem)',
          paddingRight: 'calc(env(safe-area-inset-right) + 1rem)',
        }}
      >
        <div className="mx-auto flex min-h-12 max-w-xl items-center gap-3">
          {stepIndex > 0 ? (
            <Button
              variant="text"
              className="-ml-3 !px-3"
              onClick={() => go(-1)}
              icon={<ChevronLeft size={22} strokeWidth={1.75} aria-hidden="true" />}
            >
              Retour
            </Button>
          ) : null}
          {stepIndex > 0 ? (
            <p className="m-0 ml-auto text-caption text-ink-muted" aria-live="polite">
              Étape {stepIndex} sur {STEPS.length - 1}
            </p>
          ) : null}
        </div>
        {stepIndex > 0 ? (
          <div
            className="mx-auto mt-1 h-1.5 max-w-xl overflow-hidden rounded-full bg-surface-sunken"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-ink transition-[width]"
              style={{ width: `${(stepIndex / (STEPS.length - 1)) * 100}%` }}
            />
          </div>
        ) : null}
      </header>

      <main
        className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-6"
        style={{
          paddingLeft: 'calc(env(safe-area-inset-left) + 1rem)',
          paddingRight: 'calc(env(safe-area-inset-right) + 1rem)',
        }}
      >
        <div className="mx-auto max-w-xl">
          {step === 'welcome' ? (
            <div className="flex flex-col gap-4 pt-10">
              <p className="m-0 text-label uppercase text-ember-ink">Forge</p>
              <h1 className="m-0 font-display text-display-l">Bienvenue.</h1>
              <p className="m-0 text-headline font-medium">
                Des séances de renforcement adaptées à ton temps et à ta semaine, et un suivi de ton
                alimentation pour prendre de la masse.
              </p>
              <p className="m-0 text-body text-ink-muted">
                Quelques questions pour te connaître. Tout reste sur ton téléphone, et tu pourras tout
                modifier ensuite dans les Réglages.
              </p>
            </div>
          ) : (
            <h1 className="m-0 mb-5 mt-4 font-display text-display-l">{titles[step]}</h1>
          )}

          {step === 'about' ? (
            <Card>
              <IdentityFields draft={profile} onChange={setProfile} />
            </Card>
          ) : null}
          {step === 'goals' ? (
            <Card>
              <GoalFields draft={profile} onChange={setProfile} />
            </Card>
          ) : null}
          {step === 'weight' ? (
            <div className="flex flex-col gap-4">
              <p className="m-0 text-body text-ink-muted">
                C’est ta première pesée, enregistrée aujourd’hui ({formatDateFr(today, 'long')}). Pèse-toi le
                matin, à jeun, pour avoir une valeur comparable d’un jour à l’autre.
              </p>
              <Card>
                <DecimalField
                  label="Poids actuel"
                  unit="kg"
                  value={weight}
                  onChange={setWeight}
                  placeholder="72,5"
                />
              </Card>
            </div>
          ) : null}
          {step === 'equipment' ? (
            <Card>
              <EquipmentFields draft={equipment} onChange={setEquipment} />
            </Card>
          ) : null}
          {step === 'recap' ? (
            <Recap profile={profile} weight={weight} equipment={equipment} today={today} />
          ) : null}

          {error ? <Note className="mt-5">{error}</Note> : null}
        </div>
      </main>

      <footer
        className="shrink-0 bg-canvas px-4 pt-3"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)',
          paddingLeft: 'calc(env(safe-area-inset-left) + 1rem)',
          paddingRight: 'calc(env(safe-area-inset-right) + 1rem)',
        }}
      >
        <div className="mx-auto max-w-xl">
          {step === 'recap' ? (
            <Button fullWidth onClick={finish} disabled={busy}>
              {busy ? 'Enregistrement…' : 'C’est parti'}
            </Button>
          ) : (
            <Button fullWidth onClick={next} disabled={!canContinue}>
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
    <Card padding="none" as="div">
      <dl className="m-0 px-4">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-4 border-t border-line py-3 first:border-t-0"
          >
            <dt className="text-caption text-ink-muted">{label}</dt>
            <dd className="m-0 text-right text-body-strong">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
