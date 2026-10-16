import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { illustrations, seedExercises } from '../../content'
import { deleteExercise, restoreExercise, setExercisePreference } from '../../db'
import { deletedSeedExercises, missingEquipment, variantsOf } from '../../domain/training'
import type { ExercisePreference, LibraryExercise } from '../../types'
import {
  Button,
  Card,
  ChoiceGroup,
  ConfirmSheet,
  clearExerciseDraft,
  ErrorNote,
  equipmentLabel,
  errorMessage,
  linkButtonClass,
  loadTypeLabel,
  muscleLabel,
  patternLabel,
  preferences,
} from '../../ui'
import { formatSeconds, formatTarget } from './format'
import { BackLink, LIBRARY_PATH, LevelBadge, NotFound, Warning } from './parts'
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

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-2 text-xl font-bold">{title}</h2>
      {children}
    </section>
  )
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-base leading-relaxed text-zinc-200">
          <span aria-hidden="true" className="mt-2.5 size-1.5 shrink-0 rounded-full bg-orange-400" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-v1-line bg-v1-surface-hi px-3 py-2.5">
      <dt className="text-sm text-zinc-400">{label}</dt>
      <dd className="m-0 mt-0.5 text-lg font-semibold leading-snug">{value}</dd>
    </div>
  )
}

function Variants({ title, items }: { title: string; items: LibraryExercise[] }) {
  if (items.length === 0) return null
  return (
    <div className="mt-3">
      <h3 className="mb-1.5 text-base font-semibold text-zinc-300">{title}</h3>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {items.map((v) => (
          <li key={v.id}>
            <Link
              to={`/seance/exercices/${v.id}`}
              className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-v1-line bg-v1-surface px-3 py-2 text-base font-medium text-zinc-100 no-underline active:bg-v1-surface-hi"
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
      <section>
        <BackLink to={LIBRARY_PATH}>Bibliothèque</BackLink>
        <div className="mt-3">
          <ErrorNote>Impossible de lire la bibliothèque. Ferme l’app puis rouvre-la.</ErrorNote>
        </div>
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
    <article>
      <BackLink to={LIBRARY_PATH}>Bibliothèque</BackLink>

      {svg ? (
        <div
          role="img"
          aria-label={ex.name}
          className="mt-2 rounded-2xl border border-v1-line bg-v1-surface p-4 text-zinc-200 [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
          // Contenu de confiance embarqué dans l'app (src/content), jamais un texte saisi.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : null}

      <h1 className="mt-4 text-3xl font-bold leading-tight">{ex.name}</h1>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-base text-zinc-300">
        <LevelBadge level={ex.level} />
        <span>{patternLabel(ex.pattern)}</span>
        {ex.source === 'user' ? <span className="text-zinc-400">· Perso</span> : null}
        {ex.overridden ? <span className="text-zinc-400">· Modifié</span> : null}
      </p>

      {missing.length > 0 ? (
        <div className="mt-4">
          <Warning>
            Il te manque : {missing.map(equipmentLabel).join(', ')}.{' '}
            <Link to="/reglages" className="font-semibold underline">
              Régler mon matériel
            </Link>
          </Warning>
        </div>
      ) : null}

      <Block title="Muscles">
        <p className="text-base leading-relaxed">
          <span className="font-semibold">Principaux : </span>
          {ex.muscles.primary.map(muscleLabel).join(', ')}
        </p>
        {ex.muscles.secondary.length > 0 ? (
          <p className="mt-1 text-base leading-relaxed text-zinc-300">
            <span className="font-semibold">Secondaires : </span>
            {ex.muscles.secondary.map(muscleLabel).join(', ')}
          </p>
        ) : null}
      </Block>

      <Block title="Matériel et charge">
        <p className="text-base leading-relaxed">
          {ex.equipment.length === 0 ? 'Aucun matériel.' : ex.equipment.map(equipmentLabel).join(', ')}
          {missing.length === 0 ? '' : ' (non possédé)'}
        </p>
        <dl className="m-0 mt-3 grid grid-cols-2 gap-2">
          <Fact label="Objectif par série" value={formatTarget(ex)} />
          <Fact label="Repos" value={formatSeconds(ex.restSec)} />
          <Fact label="Type de charge" value={loadTypeLabel(ex.loadType)} />
          <Fact
            label="Palier de charge"
            value={ex.loadType === 'kettlebell' ? `+${ex.loadStepKg} kg` : '—'}
          />
        </dl>
      </Block>

      {t.setup.trim() !== '' ? (
        <Block title="Mise en place">
          <p className="text-base leading-relaxed text-zinc-200">{t.setup}</p>
        </Block>
      ) : null}

      {t.steps.length > 0 ? (
        <Block title="Étapes">
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {t.steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-base leading-relaxed text-zinc-200">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-orange-400/15 text-base font-bold text-orange-300"
                >
                  {i + 1}
                </span>
                <span className="pt-0.5">
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
          <p className="text-base leading-relaxed text-zinc-200">{ex.progressionCriteria}</p>
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
          className={`${linkButtonClass('secondary')} mt-7`}
        >
          Voir la vidéo (nouvel onglet)
        </a>
      ) : null}

      <Block title="Ma préférence">
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
      </Block>

      {actionError ? (
        <div className="mt-5">
          <ErrorNote>{actionError}</ErrorNote>
        </div>
      ) : null}

      <Card className="mt-7 flex flex-col gap-2">
        <Link to={`/seance/exercices/${ex.id}/modifier`} className={linkButtonClass('secondary')}>
          Modifier
        </Link>
        {ex.overridden ? (
          <Button variant="secondary" onClick={() => setConfirm('restore')}>
            Rétablir l’original
          </Button>
        ) : null}
        <Button variant="danger" onClick={() => setConfirm('delete')}>
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
