import { Check } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { illustrations, seedExercises } from '../../content'
import { deleteExercise, restoreExercise, setExercisePreference } from '../../db'
import { deletedSeedExercises, missingEquipment, variantsOf } from '../../domain/training'
import type { ExercisePreference, LibraryExercise } from '../../types'
import { equipmentLabel, errorMessage, loadTypeLabel, muscleLabel, patternLabel, preferences } from '../../ui'
import { clearExerciseDraft } from '../../ui/exerciseDraft'
import { Button, Card, buttonClass } from '../../ui/kit'
import { ChoiceGroup } from '../../ui/kit/ChoiceGroup'
import { ConfirmSheet } from '../../ui/kit/ConfirmSheet'
import { Note } from '../../ui/kit/Note'
import { SETTINGS_PATH, LIBRARY_PATH } from '../routes'
import { formatSeconds, formatTarget } from './format'
import { LevelBadge, NotFound, ScreenTitle, Section, Warning } from './parts'
import { BackLink } from '../../ui/kit/BackLink'
import { useLibrary } from './useLibrary'

/** URL https valide, sinon `null` (jamais de lien cliquable douteux). */
function safeHttpsUrl(url: string | undefined): string | null {
  if (url === undefined) return null
  try {
    return new URL(url).protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-body">
          <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-ember" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-canvas px-3.5 py-2.5">
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className="m-0 mt-0.5 text-headline">{value}</dd>
    </div>
  )
}

function Variants({ title, items }: { title: string; items: LibraryExercise[] }) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="m-0 text-body-strong text-ink-muted">{title}</h3>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((v) => (
          <li key={v.id}>
            <Link
              to={`${LIBRARY_PATH}/${v.id}`}
              className="focus-ring flex min-h-12 items-center justify-between gap-3 rounded-md bg-surface px-3.5 py-2 text-body-strong text-ink no-underline shadow-card active:opacity-80"
            >
              <span>{v.name}</span>
              <LevelBadge level={v.level} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return <Section title={title}>{children}</Section>
}

export default function ExerciseScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data, error } = useLibrary()
  const [confirm, setConfirm] = useState<'delete' | 'restore' | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  // Choix affiché tout de suite pendant l'écriture en base (évite un retour en arrière visuel).
  const [pendingPref, setPendingPref] = useState<ExercisePreference | null>(null)

  if (error) {
    return (
      <section className="flex flex-col gap-4">
        <BackLink to={LIBRARY_PATH}>Bibliothèque</BackLink>
        <Note tone="error">Impossible de lire la bibliothèque. Ferme l’app puis rouvre-la.</Note>
      </section>
    )
  }
  if (!data) return <div aria-busy="true" className="min-h-40" />
  const ex = data.library.find((e) => e.id === id)
  if (!ex) {
    return (
      <NotFound
        message={
          deletedSeedExercises(seedExercises, data.rows).some((e) => e.id === id)
            ? 'Cet exercice a été supprimé. Tu peux le retrouver dans « Exercices supprimés ».'
            : 'Cet exercice n’existe pas.'
        }
      />
    )
  }

  const svg =
    ex.illustration !== undefined && Object.hasOwn(illustrations, ex.illustration)
      ? illustrations[ex.illustration]
      : undefined
  const missing = missingEquipment(ex, data.equipment)
  const variants = variantsOf(data.library, ex, { includeHidden: true })
  const easier = variants.filter((v) => v.level < ex.level)
  const same = variants.filter((v) => v.level === ex.level)
  const harder = variants.filter((v) => v.level > ex.level)
  const t = ex.technique
  const video = safeHttpsUrl(ex.videoUrl)

  const run = async (action: () => Promise<void>, after?: () => void) => {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      setConfirm(null)
      after?.()
    } catch (e) {
      setConfirm(null)
      setActionError(errorMessage(e, 'Action impossible. Réessaie.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className="flex flex-col gap-3.5">
      <BackLink to={LIBRARY_PATH}>Bibliothèque</BackLink>

      {svg ? (
        <Card
          role="img"
          aria-label={ex.name}
          className="text-ink [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
          // Contenu de confiance embarqué dans l'app (src/content), jamais un texte saisi.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : null}

      <div className="flex flex-col gap-2">
        <ScreenTitle className="leading-tight">{ex.name}</ScreenTitle>
        <p className="m-0 flex flex-wrap items-center gap-2 text-body text-ink-muted">
          <LevelBadge level={ex.level} />
          <span>{patternLabel(ex.pattern)}</span>
          {ex.source === 'user' ? <span>· Perso</span> : null}
          {ex.overridden ? <span>· Modifié</span> : null}
        </p>
      </div>

      {missing.length > 0 ? (
        <Warning>
          Il te manque : {missing.map(equipmentLabel).join(', ')}.{' '}
          <Link to={SETTINGS_PATH} className="font-semibold underline">
            Régler mon matériel
          </Link>
        </Warning>
      ) : null}

      <Block title="Muscles">
        <p className="m-0 text-body">
          <span className="font-semibold">Principaux : </span>
          {ex.muscles.primary.map(muscleLabel).join(', ')}
        </p>
        {ex.muscles.secondary.length > 0 ? (
          <p className="m-0 text-body text-ink-muted">
            <span className="font-semibold">Secondaires : </span>
            {ex.muscles.secondary.map(muscleLabel).join(', ')}
          </p>
        ) : null}
      </Block>

      <Block title="Matériel et charge">
        <p className="m-0 text-body">
          {ex.equipment.length === 0 ? 'Aucun matériel.' : ex.equipment.map(equipmentLabel).join(', ')}
          {missing.length === 0 ? '' : ' (non possédé)'}
        </p>
        <dl className="m-0 grid grid-cols-2 gap-2">
          <Fact label="Objectif par série" value={formatTarget(ex)} />
          <Fact label="Repos" value={formatSeconds(ex.restSec)} />
          <Fact label="Type de charge" value={loadTypeLabel(ex.loadType)} />
          <Fact
            label="Palier de charge"
            value={ex.loadType === 'kettlebell' ? `+${ex.loadStepKg} kg` : '—'}
          />
        </dl>
        {ex.amrap === true ? (
          <p className="m-0 flex items-center gap-2 text-body">
            <Check size={18} strokeWidth={2} aria-hidden="true" className="shrink-0 text-good" />
            Peut finir par une série max (autant de répétitions que possible).
          </p>
        ) : null}
      </Block>

      {t.setup.trim() !== '' ? (
        <Block title="Mise en place">
          <p className="m-0 text-body">{t.setup}</p>
        </Block>
      ) : null}

      {t.steps.length > 0 ? (
        <Block title="Étapes">
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {t.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-body">
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-items-center rounded-full bg-ember-soft font-display font-bold text-ink"
                >
                  {i + 1}
                </span>
                <span className="pt-1">
                  <span className="sr-only">Étape {i + 1} : </span>
                  {step}
                </span>
              </li>
            ))}
          </ol>
        </Block>
      ) : null}

      {t.cues.length > 0 ? (
        <Block title="Points clés">
          <Bullets items={t.cues} />
        </Block>
      ) : null}

      {t.mistakes.length > 0 ? (
        <Block title="Erreurs fréquentes">
          <Bullets items={t.mistakes} />
        </Block>
      ) : null}

      {ex.progressionCriteria.trim() !== '' ? (
        <Block title="Pour progresser">
          <p className="m-0 text-body">{ex.progressionCriteria}</p>
        </Block>
      ) : null}

      {variants.length > 0 ? (
        <Block title="Variantes">
          <Variants title="Plus faciles" items={easier} />
          <Variants title="Même niveau" items={same} />
          <Variants title="Plus difficiles" items={harder} />
        </Block>
      ) : null}

      {video ? (
        <a
          href={video}
          target="_blank"
          rel="noopener noreferrer"
          className={`${buttonClass('secondary', 'normal', true)} mt-4`}
        >
          Voir la vidéo (nouvel onglet)
        </a>
      ) : null}

      <Block title="Ma préférence">
        <Card>
          <ChoiceGroup<ExercisePreference>
            legend="Pour la génération des séances"
            layout="grid"
            value={pendingPref ?? ex.preference}
            options={preferences}
            onChange={(p) => {
              // Un choix à la fois : on ignore les clics pendant l'écriture précédente.
              if (pendingPref !== null) return
              setPendingPref(p)
              void run(() => setExercisePreference(ex.id, p)).finally(() => setPendingPref(null))
            }}
          />
        </Card>
      </Block>

      {actionError ? <Note tone="error">{actionError}</Note> : null}

      <Card className="mt-4 flex flex-col gap-2">
        <Link
          to={`${LIBRARY_PATH}/${ex.id}/modifier`}
          className={buttonClass('secondary', 'normal', true) + ' bg-canvas! shadow-none!'}
        >
          Modifier
        </Link>
        {ex.overridden ? (
          <Button
            variant="secondary"
            fullWidth
            className="bg-canvas! shadow-none!"
            onClick={() => setConfirm('restore')}
          >
            Rétablir l’original
          </Button>
        ) : null}
        <Button
          variant="secondary"
          fullWidth
          className="bg-canvas! text-critical! shadow-none!"
          onClick={() => setConfirm('delete')}
        >
          Supprimer
        </Button>
      </Card>

      {confirm === 'delete' ? (
        <ConfirmSheet
          title="Supprimer cet exercice ?"
          message={
            ex.source === 'user'
              ? `« ${ex.name} » disparaîtra de la bibliothèque ; les séances passées garderont son nom.`
              : `« ${ex.name} » disparaît de la bibliothèque. Tu pourras le restaurer depuis « Exercices supprimés »${
                  ex.overridden ? ' ; tes modifications seront perdues si tu le restaures' : ''
                }.`
          }
          confirmLabel="Supprimer"
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            void run(
              async () => {
                await deleteExercise(ex)
                clearExerciseDraft(ex.id)
              },
              () => navigate(LIBRARY_PATH, { replace: true }),
            )
          }
        />
      ) : null}
      {confirm === 'restore' ? (
        <ConfirmSheet
          title="Rétablir l’original ?"
          message="Ta version modifiée sera remplacée par l’exercice d’origine."
          confirmLabel="Rétablir"
          danger={false}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            void run(async () => {
              await restoreExercise(ex.id)
              clearExerciseDraft(ex.id)
            })
          }
        />
      ) : null}
    </article>
  )
}
