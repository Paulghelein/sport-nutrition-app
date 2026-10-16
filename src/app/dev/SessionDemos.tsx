import { useState } from 'react'
import { ExerciseThumb, buttonClass, cx } from '../../ui/kit'
import { CheckRow } from '../../ui/kit/CheckRow'
import { ChoiceGroup } from '../../ui/kit/ChoiceGroup'
import { ExerciseRow } from '../../ui/kit/ExerciseRow'
import { IntegerField, SelectField, TextField } from '../../ui/kit/Fields'
import { Note } from '../../ui/kit/Note'
import { RestTimer } from '../../ui/kit/RestTimer'
import { SessionProgress, SetDots } from '../../ui/kit/SessionProgress'
import { SetPanel } from '../../ui/kit/SetPanel'
import { Card } from '../../ui/kit'

/** Démonstration des composants du mode séance et de l'aperçu (`/dev/ui`, section « Séance »). */
export function SessionDemos() {
  const [load, setLoad] = useState(18)
  const [reps, setReps] = useState(10)
  const [choice, setChoice] = useState<1 | 2 | 3>(2)
  const [checked, setChecked] = useState(true)
  const [text, setText] = useState('Goblet squat')
  const [number, setNumber] = useState('45')
  const [select, setSelect] = useState<'a' | 'b'>('a')
  return (
    <section aria-labelledby="sec-Séance" className="flex flex-col gap-4">
      <h2 id="sec-Séance" className="font-display text-title">
        Séance
      </h2>
      <div className="flex flex-col gap-2">
        <span className="text-label uppercase text-ink-muted">ExerciseRow (aperçu de séance)</span>
        <Card as="div" padding="none" className="px-4 py-1">
          <ExerciseRow
            muscles={['quads', 'glutes']}
            title="Goblet squat"
            summary="4 × 8–12"
            detail={
              <>
                18 kg · <span className="font-semibold text-ember-ink">+1 kg</span>
              </>
            }
          />
          <ExerciseRow
            muscles={['chest', 'triceps']}
            title="Pompes inclinées"
            summary="3 × 8–12"
            detail="dernière série : max"
          />
          <ExerciseRow
            muscles={['quads']}
            title="Swing deux mains"
            summary="2 × max en 45 s"
            detail="16 kg"
          />
        </Card>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-label uppercase text-ink-muted">
          Mode séance (fond sombre) : avancement, pastilles, panneaux géants
        </span>
        <div className="ds-session flex flex-col gap-4 rounded-ds-lg p-4">
          <SessionProgress fractions={[1, 0.25, 0, 0, 0]} current={2} />
          <div className="flex items-center gap-3.5">
            <ExerciseThumb primary={['quads', 'glutes']} size={96} tone="dark" className="rounded-ds-md" />
            <div className="flex flex-col gap-1.5">
              <span className="text-label uppercase text-on-inverse-muted">Exercice 2 sur 5</span>
              <span className="font-display text-[28px] font-extrabold leading-8">Goblet squat</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-body-strong">Série 2 sur 4</span>
            <SetDots states={['done', 'current', 'todo', 'skipped']} />
          </div>
          <SetPanel
            label="Charge"
            value={String(load)}
            unit="kg"
            hint="+1 kg depuis la dernière fois"
            hintTone="accent"
            steps={{
              onDecrease: () => setLoad((v) => v - 1),
              onIncrease: () => setLoad((v) => v + 1),
              decreaseLabel: 'Moins un palier de charge',
              increaseLabel: 'Plus un palier de charge',
            }}
          />
          <SetPanel
            label="Répétitions"
            value={String(reps)}
            hint="Objectif 8–12 · série 1 : 12"
            steps={{
              onDecrease: () => setReps((v) => Math.max(0, v - 1)),
              onIncrease: () => setReps((v) => v + 1),
              decreaseLabel: 'Une répétition de moins',
              increaseLabel: 'Une répétition de plus',
            }}
          />
          <SetPanel
            label="Max"
            groupLabel="Maximum de répétitions"
            value="12"
            hint="Pas de cible : va jusqu’à l’échec technique"
          />
          <SetPanel label="Charge" value="Poids du corps" valueSize="l" />
          <div className="grid grid-cols-3 gap-2">
            <span className={cx(buttonClass('inverse', 'session', true))}>Facile</span>
            <span className={cx(buttonClass('primary', 'session', true))}>Correct</span>
            <span className={cx(buttonClass('inverse', 'session', true))}>Dur</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-label uppercase text-ink-muted">RestTimer (anneau 260 px, temps 76 px)</span>
        <div className="ds-session flex justify-center rounded-ds-lg p-4">
          <RestTimer remainingSec={72} totalSec={90} caption="sur 1:30" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-label uppercase text-ink-muted">Formulaires et messages</span>
        <Card padding="large" className="flex flex-col gap-4">
          <TextField label="Nom" value={text} onChange={setText} />
          <IntegerField label="Repos entre séries" unit="s" value={number} onChange={setNumber} />
          <SelectField
            label="Schéma de mouvement"
            value={select}
            options={[
              { value: 'a', label: 'Charnière' },
              { value: 'b', label: 'Squat' },
            ]}
            onChange={setSelect}
          />
          <ChoiceGroup
            legend="Niveau"
            value={choice}
            options={[
              { value: 1, label: 'Débutant' },
              { value: 2, label: 'Intermédiaire' },
              { value: 3, label: 'Avancé' },
            ]}
            onChange={setChoice}
          />
          <CheckRow
            label="Peut finir par une série max"
            hint="Poids du corps seulement."
            checked={checked}
            onChange={setChecked}
          />
          <Note tone="error">Impossible d’enregistrer la séance.</Note>
          <Note tone="success">Modèle enregistré.</Note>
          <Note tone="warning">Il te manque un tapis.</Note>
        </Card>
      </div>
    </section>
  )
}
