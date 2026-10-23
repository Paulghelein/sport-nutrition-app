import { useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  MAX_EXERCISE_NAME_LENGTH,
  MAX_PROGRESSION_CRITERIA_LENGTH,
  MAX_SETUP_LENGTH,
  MAX_TECHNIQUE_LINES,
  MAX_TECHNIQUE_LINE_LENGTH,
  MAX_VIDEO_URL_LENGTH,
  checkExercise,
  createExercise,
  updateExercise,
} from '../../db'
import { defaultLoadStep, emptyExerciseInput, toExerciseInput } from '../../domain/training'
import type { ExerciseInput, LibraryExercise, MuscleGroup } from '../../types'
import {
  canBeAmrap,
  clearExerciseDraft,
  draftToExercise,
  equipmentChoices,
  errorMessage,
  exerciseToDraft,
  levels,
  loadExerciseDraft,
  loadTypes,
  muscles,
  patterns,
  saveExerciseDraft,
  usesDuration,
} from '../../ui'
import type { ExerciseDraft } from '../../ui'
import { Button, Card, cx } from '../../ui/kit'
import { CheckRow } from '../../ui/kit/CheckRow'
import { ChoiceGroup } from '../../ui/kit/ChoiceGroup'
import { IntegerField, SelectField, TextField } from '../../ui/kit/Fields'
import { Note } from '../../ui/kit/Note'
import { LIBRARY_PATH } from '../routes'
import { LineListEditor } from './LineListEditor'
import { NotFound, ScreenTitle } from './parts'
import { BackLink } from '../../ui/kit/BackLink'
import { useLibrary } from './useLibrary'

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card padding="large">
      <h2 className="m-0 mb-4 font-display text-title">{title}</h2>
      <div className="flex flex-col gap-5">{children}</div>
    </Card>
  )
}

function MuscleChips({
  legend,
  selected,
  onToggle,
}: {
  legend: string
  selected: MuscleGroup[]
  onToggle: (m: MuscleGroup) => void
}) {
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1.5 p-0 text-caption text-ink-muted">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {muscles.map((m) => {
          const on = selected.includes(m.value)
          return (
            <label
              key={m.value}
              className={cx(
                'flex min-h-11 cursor-pointer items-center rounded-ds-pill px-4 text-body-strong text-ink',
                'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus',
                on ? 'bg-ember-soft ring-2 ring-ember' : 'bg-canvas',
              )}
            >
              <input type="checkbox" className="sr-only" checked={on} onChange={() => onToggle(m.value)} />
              {m.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Comparaison de deux saisies : textes rognés, ordre des clés ignoré. */
function sameInput(a: ExerciseInput, b: ExerciseInput): boolean {
  const norm = (key: string, v: unknown): unknown => {
    if (Array.isArray(v) && ['primary', 'secondary', 'equipment'].includes(key)) return [...v].sort()
    if (typeof v === 'string') return v.trim()
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v).sort(([x], [y]) => (x < y ? -1 : 1)))
    }
    return v
  }
  return JSON.stringify(a, norm) === JSON.stringify(b, norm)
}

function ExerciseForm({ current }: { current: LibraryExercise | null }) {
  const navigate = useNavigate()
  const draftKey = current?.id ?? 'new'
  const base = () => exerciseToDraft(current ? toExerciseInput(current) : emptyExerciseInput())
  const [restored] = useState(() => loadExerciseDraft(draftKey))
  const [draft, setDraftState] = useState<ExerciseDraft>(() => restored ?? base())
  const [showRestored, setShowRestored] = useState(restored !== null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const setDraft = (next: ExerciseDraft) => {
    setError(null)
    setDraftState(next)
    // Brouillon conservé tant que le formulaire n'est pas enregistré (retour accidentel, changement d'onglet).
    saveExerciseDraft(draftKey, next)
  }
  const patch = (changes: Partial<ExerciseDraft>) => setDraft({ ...draft, ...changes })

  const toggleMuscle = (kind: 'primary' | 'secondary', m: MuscleGroup) => {
    const other = kind === 'primary' ? 'secondary' : 'primary'
    const has = draft[kind].includes(m)
    patch({
      [kind]: has ? draft[kind].filter((x) => x !== m) : [...draft[kind], m],
      // Un muscle ne peut pas être dans les deux listes : le choisir ici le retire de l'autre.
      [other]: has ? draft[other] : draft[other].filter((x) => x !== m),
    })
  }

  const save = async () => {
    const input = draftToExercise(draft)
    const message = checkExercise(input)
    if (message) {
      setError(message)
      return
    }
    // Rien n'a changé : retour à la fiche sans créer de surcharge vide.
    if (current && sameInput(input, toExerciseInput(current))) {
      clearExerciseDraft(draftKey)
      navigate(`${LIBRARY_PATH}/${current.id}`, { replace: true })
      return
    }
    setBusy(true)
    setError(null)
    try {
      const saved = current ? await updateExercise(current, input) : await createExercise(input)
      clearExerciseDraft(draftKey)
      navigate(`${LIBRARY_PATH}/${saved.id}`, { replace: true })
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’enregistrer l’exercice. Réessaie.'))
      setBusy(false)
    }
  }

  const restart = () => {
    clearExerciseDraft(draftKey)
    setDraftState(base())
    setShowRestored(false)
    setError(null)
  }

  const byDuration = usesDuration(draft)
  const title = current ? 'Modifier l’exercice' : 'Nouvel exercice'

  return (
    <form
      className="flex flex-col gap-3.5"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      noValidate
    >
      <BackLink to={current ? `${LIBRARY_PATH}/${current.id}` : LIBRARY_PATH}>
        {current ? 'Fiche' : 'Bibliothèque'}
      </BackLink>
      <ScreenTitle>{title}</ScreenTitle>
      {current?.source === 'seed' ? (
        <p className="m-0 text-body text-ink-muted">
          Ta version remplacera l’original ; tu pourras le rétablir.
        </p>
      ) : null}
      {showRestored ? (
        <div className="flex items-center justify-between gap-3 rounded-ds-md bg-ember-soft px-3.5 py-2.5 text-body text-ink">
          <span role="status">Brouillon retrouvé.</span>
          <button
            type="button"
            onClick={restart}
            className="focus-ring min-h-11 shrink-0 px-2 text-body-strong underline"
          >
            Repartir de zéro
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-3.5">
        <FormSection title="Général">
          <TextField
            label="Nom"
            value={draft.name}
            onChange={(v) => patch({ name: v })}
            maxLength={MAX_EXERCISE_NAME_LENGTH}
            autoComplete="off"
          />
          <SelectField
            label="Schéma de mouvement"
            value={draft.pattern}
            options={patterns}
            onChange={(pattern) =>
              patch({
                pattern,
                // Le palier par défaut suit le schéma, sauf si l'utilisateur l'a choisi lui-même.
                ...(draft.loadStepTouched ? {} : { loadStepKg: defaultLoadStep(pattern) }),
              })
            }
          />
          <ChoiceGroup
            legend="Niveau"
            value={draft.level}
            options={levels}
            onChange={(level) => patch({ level })}
          />
          <ChoiceGroup
            legend="Type de charge"
            value={draft.loadType}
            options={loadTypes}
            onChange={(loadType) => patch({ loadType })}
          />
        </FormSection>

        <FormSection title="Prescription">
          {draft.loadType === 'kettlebell' ? (
            <ChoiceGroup
              legend="Cible de chaque série"
              value={draft.target}
              options={[
                { value: 'reps', label: 'Répétitions' },
                { value: 'duration', label: 'Durée' },
              ]}
              onChange={(target) => patch({ target })}
            />
          ) : null}
          {byDuration ? (
            <div className="grid grid-cols-2 gap-3">
              <IntegerField
                label="Durée min"
                unit="s"
                value={draft.durMin}
                onChange={(v) => patch({ durMin: v })}
              />
              <IntegerField
                label="Durée max"
                unit="s"
                value={draft.durMax}
                onChange={(v) => patch({ durMax: v })}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <IntegerField
                label="Répétitions min"
                value={draft.repMin}
                onChange={(v) => patch({ repMin: v })}
              />
              <IntegerField
                label="Répétitions max"
                value={draft.repMax}
                onChange={(v) => patch({ repMax: v })}
              />
            </div>
          )}
          <IntegerField
            label="Repos entre séries"
            unit="s"
            value={draft.restSec}
            onChange={(v) => patch({ restSec: v })}
          />
          {draft.loadType === 'kettlebell' ? (
            <ChoiceGroup
              legend="Palier de hausse de charge"
              value={draft.loadStepKg}
              options={[
                { value: 1, label: '1 kg' },
                { value: 2, label: '2 kg' },
              ]}
              onChange={(loadStepKg) => patch({ loadStepKg, loadStepTouched: true })}
            />
          ) : null}
          <div className="flex flex-col gap-2">
            <CheckRow
              label="Polyarticulaire"
              hint="Travaille plusieurs articulations à la fois."
              checked={draft.compound}
              onChange={(compound) => patch({ compound })}
            />
            <CheckRow
              label="Unilatéral"
              hint="Un côté après l’autre (affiché « par côté »)."
              checked={draft.unilateral}
              onChange={(unilateral) => patch({ unilateral })}
            />
            <CheckRow
              label="Peut servir de finisher"
              hint="Proposé en fin de séance de 60 min (swings, portés)."
              checked={draft.finisher}
              onChange={(finisher) => patch({ finisher })}
            />
            {canBeAmrap(draft) ? (
              <CheckRow
                label="Peut finir par une série max"
                hint="À cocher seulement si aller à l’échec est sans danger (pas de dips ni d’exercice où l’on peut tomber)."
                checked={draft.amrap}
                onChange={(amrap) => patch({ amrap })}
              />
            ) : null}
            {draft.loadType === 'kettlebell' ? (
              <CheckRow
                label="Apprentissage sans charge"
                hint="Geste complexe appris d’abord à vide (ex. Turkish get-up)."
                checked={draft.learnUnloaded}
                onChange={(learnUnloaded) => patch({ learnUnloaded })}
              />
            ) : null}
          </div>
        </FormSection>

        <FormSection title="Muscles et matériel">
          <MuscleChips
            legend="Muscles principaux"
            selected={draft.primary}
            onToggle={(m) => toggleMuscle('primary', m)}
          />
          <MuscleChips
            legend="Muscles secondaires"
            selected={draft.secondary}
            onToggle={(m) => toggleMuscle('secondary', m)}
          />
          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className="mb-1.5 p-0 text-caption text-ink-muted">Matériel requis</legend>
            <div className="flex flex-col gap-2">
              {equipmentChoices.map((e) => (
                <CheckRow
                  key={e.value}
                  label={e.label}
                  checked={draft.equipment.includes(e.value)}
                  onChange={(on) =>
                    patch({
                      equipment: on
                        ? [...draft.equipment, e.value]
                        : draft.equipment.filter((x) => x !== e.value),
                    })
                  }
                />
              ))}
            </div>
          </fieldset>
        </FormSection>

        <FormSection title="Technique">
          <div>
            <label htmlFor="ex-setup" className="mb-1.5 block text-caption text-ink-muted">
              Mise en place
            </label>
            <textarea
              id="ex-setup"
              rows={3}
              maxLength={MAX_SETUP_LENGTH}
              value={draft.setup}
              onChange={(e) => patch({ setup: e.target.value })}
              className="focus-ring w-full rounded-ds-md bg-canvas px-3.5 py-2.5 text-input text-ink"
            />
          </div>
          <LineListEditor
            legend="Étapes"
            itemLabel="Étape"
            addLabel="Ajouter une étape"
            numbered
            maxItems={MAX_TECHNIQUE_LINES}
            maxLength={MAX_TECHNIQUE_LINE_LENGTH}
            items={draft.steps}
            onChange={(steps) => patch({ steps })}
          />
          <LineListEditor
            legend="Points clés"
            itemLabel="Point clé"
            addLabel="Ajouter un point clé"
            maxItems={MAX_TECHNIQUE_LINES}
            maxLength={MAX_TECHNIQUE_LINE_LENGTH}
            items={draft.cues}
            onChange={(cues) => patch({ cues })}
          />
          <LineListEditor
            legend="Erreurs fréquentes"
            itemLabel="Erreur"
            addLabel="Ajouter une erreur"
            maxItems={MAX_TECHNIQUE_LINES}
            maxLength={MAX_TECHNIQUE_LINE_LENGTH}
            items={draft.mistakes}
            onChange={(mistakes) => patch({ mistakes })}
          />
          <TextField
            label="Pour progresser"
            hint="Critère pour passer au niveau supérieur, par exemple « 3 × 15 propres »."
            maxLength={MAX_PROGRESSION_CRITERIA_LENGTH}
            value={draft.progressionCriteria}
            onChange={(v) => patch({ progressionCriteria: v })}
          />
          <TextField
            label="Lien vidéo (facultatif)"
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoComplete="off"
            placeholder="https://"
            maxLength={MAX_VIDEO_URL_LENGTH}
            value={draft.videoUrl}
            onChange={(v) => patch({ videoUrl: v })}
          />
        </FormSection>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {error ? <Note tone="error">{error}</Note> : null}
        <Button type="submit" fullWidth disabled={busy}>
          {current ? 'Enregistrer les modifications' : 'Créer l’exercice'}
        </Button>
      </div>
    </form>
  )
}

export default function ExerciseFormScreen() {
  const { id } = useParams()
  const { data, error } = useLibrary()

  if (error) {
    return (
      <section className="flex flex-col gap-4">
        <BackLink to={LIBRARY_PATH}>Bibliothèque</BackLink>
        <Note tone="error">Impossible de lire la bibliothèque. Ferme l’app puis rouvre-la.</Note>
      </section>
    )
  }
  if (id === undefined) return <ExerciseForm current={null} />
  if (!data) return <div aria-busy="true" className="min-h-40" />
  const current = data.library.find((e) => e.id === id)
  if (!current) return <NotFound message="Cet exercice n’existe pas ou a été supprimé." />
  return <ExerciseForm key={current.id} current={current} />
}
