import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getActiveSession, listTemplates, startSession } from '../../db'
import {
  addCandidates,
  addExercise,
  buildWarmup,
  estimateMinutes,
  generateSession,
  moveBlock,
  planFromTemplate,
  removeExercise,
  replaceExercise,
  replacementCandidates,
  sessionFromPlan,
  templateIssues,
} from '../../domain/training'
import type { TemplateIssue } from '../../domain/training'
import type { EngineInput, LibraryExercise, SessionBlock, SessionExercise, SessionPlan } from '../../types'
import {
  Button,
  Card,
  ErrorNote,
  Section,
  errorMessage,
  formatKg,
  linkButtonClass,
  muscleLabel,
  useLiveQuery,
} from '../../ui'
import { GUIDED_PATH } from '../routes'
import { DurationPicker } from './DurationPicker'
import { parseDuration, saveDuration } from './durations'
import { ExercisePickerSheet } from './ExercisePickerSheet'
import { formatSeconds } from './format'
import { BackLink } from './parts'
import { clearPreviewEdit, loadPreviewEdit, savePreviewEdit } from './previewDraft'
import { SaveTemplate } from './SaveTemplate'
import { useEngineInput } from './useEngineInput'
import type { EngineBase } from './useEngineInput'

function targetText(se: SessionExercise, ex: LibraryExercise | undefined): string {
  const n = se.sets.length
  const first = se.sets[0]
  const side = ex?.unilateral ? ' par côté' : ''
  if (first?.targetDurationSec !== undefined) return `${n} × ${first.targetDurationSec} s${side}`
  const r = first?.targetReps
  if (r) return `${n} × ${r[0] === r[1] ? r[0] : `${r[0]} à ${r[1]}`} reps${side}`
  return `${n} séries`
}

const iconButton =
  'flex size-11 items-center justify-center rounded-xl border border-line bg-surface-hi text-zinc-100 active:bg-zinc-700 disabled:text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400'

const smallButton =
  'flex min-h-11 flex-1 items-center justify-center rounded-xl border border-line bg-surface-hi px-3 text-base font-semibold text-zinc-100 active:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400'

function Chevron({ up }: { up: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
    </svg>
  )
}

interface LineProps {
  se: SessionExercise
  ex: LibraryExercise | undefined
  showRest: boolean
  onReplace: () => void
  onRemove: () => void
}

function ExerciseLine({ se, ex, showRest, onReplace, onRemove }: LineProps) {
  const load = se.sets[0]?.loadKg
  const name = ex?.name ?? se.exerciseId
  return (
    <div className="py-2.5">
      <Link
        to={`/seance/exercices/${se.exerciseId}`}
        className="inline-flex min-h-11 items-center text-lg font-semibold text-zinc-100 underline decoration-zinc-600 underline-offset-4"
      >
        {name}
      </Link>
      <p className="m-0 flex flex-wrap items-baseline gap-x-3 text-base text-zinc-300">
        <span className="text-xl font-bold tabular-nums text-zinc-100">{targetText(se, ex)}</span>
        {load !== undefined ? (
          <span className="font-semibold text-orange-300">{formatKg(load)} kg</span>
        ) : null}
        {showRest ? <span className="text-zinc-400">repos {formatSeconds(se.restSec)}</span> : null}
        {se.tempo ? <span className="text-zinc-400">tempo {se.tempo}</span> : null}
      </p>
      <div className="mt-2 flex gap-2">
        <button type="button" className={smallButton} onClick={onReplace} aria-label={`Remplacer ${name}`}>
          Remplacer
        </button>
        <button type="button" className={smallButton} onClick={onRemove} aria-label={`Retirer ${name}`}>
          Retirer
        </button>
      </div>
    </div>
  )
}

interface BlockProps {
  block: SessionBlock
  index: number
  count: number
  nextIsFinisher: boolean
  byId: Map<string, LibraryExercise>
  onMove: (to: number) => void
  onReplace: (exercise: number) => void
  onRemove: (exercise: number) => void
}

function BlockCard({ block, index, count, nextIsFinisher, byId, onMove, onReplace, onRemove }: BlockProps) {
  const superset = block.kind === 'superset'
  const finisher = block.kind === 'finisher'
  const rest = block.exercises[0]?.restSec ?? 0
  return (
    <Card className={finisher ? 'border-orange-400/50' : superset ? 'border-sky-400/40' : ''}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {superset ? (
            <p className="m-0 mb-1 text-sm font-semibold text-sky-300">
              Superset — repos {formatSeconds(rest)} après le tour
            </p>
          ) : null}
          {finisher ? <p className="m-0 mb-1 text-sm font-semibold text-orange-300">Finisher</p> : null}
          <ul className="m-0 list-none divide-y divide-line p-0">
            {block.exercises.map((se, i) => (
              <li key={`${se.exerciseId}-${i}`}>
                <ExerciseLine
                  se={se}
                  ex={byId.get(se.exerciseId)}
                  showRest={!superset}
                  onReplace={() => onReplace(i)}
                  onRemove={() => onRemove(i)}
                />
              </li>
            ))}
          </ul>
        </div>
        <div className="flex shrink-0 flex-col gap-2" role="group" aria-label={`Bloc ${index + 1} : ordre`}>
          <button
            type="button"
            className={iconButton}
            disabled={index === 0 || block.kind === 'finisher'}
            onClick={() => onMove(index - 1)}
            aria-label={`Monter le bloc ${index + 1}`}
          >
            <Chevron up />
          </button>
          <button
            type="button"
            className={iconButton}
            disabled={index === count - 1 || block.kind === 'finisher' || nextIsFinisher}
            onClick={() => onMove(index + 1)}
            aria-label={`Descendre le bloc ${index + 1}`}
          >
            <Chevron up={false} />
          </button>
        </div>
      </div>
    </Card>
  )
}

const issueText: Record<TemplateIssue['reason'], string> = {
  missing: 'n’existe plus',
  equipment: 'matériel manquant',
  hidden: 'masqué',
  level: 'niveau pas encore atteint',
  no_target: 'sans objectif',
}

type Picker = { kind: 'replace'; block: number; exercise: number } | { kind: 'add' } | null

interface ContentProps {
  data: EngineBase
  plan: SessionPlan
  editKey: string
  templateId: string | undefined
  issues: TemplateIssue[]
  defaultName: string
}

function PreviewContent({ data, plan, editKey, templateId, issues, defaultName }: ContentProps) {
  const navigate = useNavigate()
  const active = useLiveQuery(() => getActiveSession(), [])
  const [edited, setEdited] = useState<SessionBlock[] | null>(() => loadPreviewEdit(editKey))
  const [picker, setPicker] = useState<Picker>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const byId = useMemo(() => new Map(data.library.map((e) => [e.id, e])), [data.library])
  const blocks = edited ?? plan.blocks
  const input: EngineInput = useMemo(() => ({ ...data, durationMin: plan.durationMin }), [data, plan])
  const stateOf = (id: string) => data.states.find((s) => s.exerciseId === id)
  const context = (id: string) => ({ state: stateOf(id), equipment: data.equipment, deload: plan.deload })

  const change = (next: SessionBlock[]) => {
    setEdited(next)
    savePreviewEdit(editKey, next)
  }
  const reset = () => {
    clearPreviewEdit()
    setEdited(null)
  }

  const estimated = edited ? estimateMinutes(blocks, data.library, plan.warmupMin) : plan.estimatedMin
  const warmup = edited ? buildWarmup(blocks, byId, plan.warmupMin, data.equipment.kettlebell) : plan.warmup
  const presentIds = blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId))

  const candidates = useMemo(() => {
    if (picker === null) return []
    if (picker.kind === 'add') return addCandidates(input, presentIds)
    const id = blocks[picker.block]?.exercises[picker.exercise]?.exerciseId
    return id === undefined ? [] : replacementCandidates(id, input, presentIds)
    // `presentIds` dérive de `blocks`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker, input, blocks])

  const pick = (ex: LibraryExercise) => {
    if (picker?.kind === 'replace') {
      change(replaceExercise(blocks, picker.block, picker.exercise, ex, context(ex.id)))
    } else if (picker?.kind === 'add') {
      change(addExercise(blocks, ex, context(ex.id)))
    }
    setPicker(null)
  }

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      const session = sessionFromPlan(
        { ...plan, blocks, warmup, estimatedMin: estimated },
        { id: crypto.randomUUID(), now: new Date().toISOString(), templateId },
      )
      session.warmupMin = plan.warmupMin
      await startSession(session)
      clearPreviewEdit()
      navigate(GUIDED_PATH)
    } catch (e) {
      setError(errorMessage(e, 'Impossible de démarrer la séance. Réessaie.'))
      setBusy(false)
    }
  }

  const empty = blocks.length === 0
  return (
    <div>
      <Card className="mt-5" aria-live="polite">
        {!empty ? (
          <>
            <p className="m-0 text-4xl font-bold tabular-nums">≈ {estimated} min</p>
            <p className="m-0 mt-1 text-base text-zinc-400">
              estimées, échauffement compris, pour {plan.durationMin} min disponibles
            </p>
          </>
        ) : (
          <p className="m-0 text-base text-zinc-400">{plan.durationMin} min disponibles</p>
        )}
        {plan.deload ? (
          <>
            <p className="mt-3 inline-block rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-sm font-semibold text-amber-300">
              Semaine allégée
            </p>
            <p className="m-0 mt-2 text-sm text-zinc-300">
              {plan.deloadReason === 'scheduled'
                ? 'Prévue : cela fait plusieurs semaines sans pause. Moitié moins de séries, même charge.'
                : plan.deloadReason === 'fatigue'
                  ? 'Tu as enchaîné des séances difficiles. Moitié moins de séries, même charge.'
                  : 'Semaine allégée en cours : moitié moins de séries, même charge.'}
            </p>
          </>
        ) : null}
        {plan.focus.length > 0 ? (
          <p className="m-0 mt-3 text-base text-zinc-200">
            <span className="text-zinc-400">Groupes visés : </span>
            {plan.focus.map(muscleLabel).join(', ')}
          </p>
        ) : null}
      </Card>

      {issues.length > 0 ? (
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 px-3 py-2.5 text-base text-amber-200">
          <p className="m-0 font-semibold">Certains exercices du modèle sont ignorés :</p>
          <ul className="m-0 mt-1 list-disc pl-5">
            {issues.map((i) => (
              <li key={i.exerciseId}>
                {byId.get(i.exerciseId)?.name ?? i.exerciseId} : {issueText[i.reason]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {empty && !edited ? (
        <Card className="mt-6">
          <p className="m-0 text-lg font-semibold">Aucune séance possible avec ces réglages.</p>
          <p className="m-0 mt-1 text-base text-zinc-300">
            Il n’y a pas assez d’exercices adaptés à ton matériel et à tes préférences. Vérifie ton matériel
            dans les Réglages, ou ajoute et réactive des exercices dans la bibliothèque.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Link to="/reglages" className={linkButtonClass('primary')}>
              Ouvrir les Réglages
            </Link>
            <Link to="/seance/exercices" className={linkButtonClass('secondary')}>
              Bibliothèque d’exercices
            </Link>
          </div>
        </Card>
      ) : (
        <>
          {!empty ? (
            <Section title={`Échauffement · ${plan.warmupMin} min`}>
              <Card>
                <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-base text-zinc-200">
                  {warmup.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ol>
              </Card>
            </Section>
          ) : null}

          <Section title="Exercices">
            {empty ? (
              <p className="m-0 mb-3 text-base text-zinc-300">Plus aucun exercice : ajoute-en au moins un.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {blocks.map((b, i) => (
                  <BlockCard
                    key={b.id}
                    block={b}
                    index={i}
                    count={blocks.length}
                    nextIsFinisher={blocks[i + 1]?.kind === 'finisher'}
                    byId={byId}
                    onMove={(to) => change(moveBlock(blocks, i, to))}
                    onReplace={(exercise) => setPicker({ kind: 'replace', block: i, exercise })}
                    onRemove={(exercise) => change(removeExercise(blocks, i, exercise))}
                  />
                ))}
              </div>
            )}
            <div className="mt-3 flex flex-col gap-2">
              <Button variant="secondary" onClick={() => setPicker({ kind: 'add' })}>
                Ajouter un exercice
              </Button>
              {edited ? (
                <Button variant="ghost" onClick={reset}>
                  Revenir à la séance proposée
                </Button>
              ) : null}
            </div>
          </Section>

          {!empty ? (
            <div className="mt-6">
              <SaveTemplate
                source={blocks}
                durationMin={plan.durationMin}
                defaultName={defaultName}
                deload={plan.deload}
              />
            </div>
          ) : null}
        </>
      )}

      {!empty ? (
        <div className="sticky bottom-0 mt-6 rounded-2xl border border-line bg-bg/95 p-3 backdrop-blur">
          {error ? (
            <div className="mb-2">
              <ErrorNote>{error}</ErrorNote>
            </div>
          ) : null}
          {active.data ? (
            <>
              <p className="m-0 mb-2 text-sm text-zinc-300">
                Une séance est déjà en cours. Reprends-la, ou abandonne-la avant d’en commencer une autre.
              </p>
              <Link to={GUIDED_PATH} className={linkButtonClass('primary')}>
                Reprendre la séance en cours
              </Link>
            </>
          ) : (
            <Button onClick={() => void start()} disabled={busy}>
              Commencer la séance
            </Button>
          )}
        </div>
      ) : null}

      {picker ? (
        <ExercisePickerSheet
          title={picker.kind === 'add' ? 'Ajouter un exercice' : 'Remplacer l’exercice'}
          candidates={candidates}
          searchable={picker.kind === 'add'}
          emptyText="Aucun autre exercice possible avec ton matériel et ton niveau."
          onPick={pick}
          onClose={() => setPicker(null)}
        />
      ) : null}
    </div>
  )
}

export default function PreviewScreen() {
  const [params, setParams] = useSearchParams()
  const templateId = params.get('modele') ?? undefined
  const duration = parseDuration(params.get('duree'))
  const { data, error } = useEngineInput()
  const templates = useLiveQuery(() => listTemplates(), [])
  useEffect(() => saveDuration(duration), [duration])

  const result = useMemo(() => {
    if (!data) return undefined
    try {
      if (templateId !== undefined) {
        if (!templates.data) return undefined
        const template = templates.data.find((t) => t.id === templateId)
        if (!template) return { missing: true as const, plan: undefined }
        const input: EngineInput = { ...data, durationMin: template.durationMin }
        return {
          missing: false as const,
          plan: planFromTemplate(template, input),
          issues: templateIssues(template, input),
          key: `modele:${template.id}:${data.date}`,
          name: template.name,
        }
      }
      return {
        missing: false as const,
        plan: generateSession({ ...data, durationMin: duration }),
        issues: [] as TemplateIssue[],
        key: `duree:${duration}:${data.date}`,
        name: `Séance ${duration} min`,
      }
    } catch (e) {
      console.error('Génération de séance impossible', e)
      return null
    }
  }, [data, duration, templateId, templates.data])

  const fromTemplate = templateId !== undefined
  return (
    <section>
      <BackLink to={fromTemplate ? '/seance/modeles' : '/seance'}>
        {fromTemplate ? 'Modèles' : 'Séance'}
      </BackLink>
      <h1 className="mt-2 text-3xl font-bold">Aperçu</h1>
      {!fromTemplate ? (
        <div className="mt-4">
          <DurationPicker
            legend="Changer la durée"
            value={duration}
            onChange={(d) => setParams({ duree: String(d) }, { replace: true })}
          />
        </div>
      ) : null}

      {error || result === null || templates.error ? (
        <div className="mt-5">
          <ErrorNote>
            Impossible de préparer la séance. Réessaie ou vérifie ton profil et ton matériel.
          </ErrorNote>
        </div>
      ) : null}
      {result?.missing ? (
        <div className="mt-5">
          <ErrorNote>Ce modèle n’existe plus.</ErrorNote>
        </div>
      ) : null}
      {!data && !error ? <div aria-busy="true" className="min-h-40" /> : null}

      {data && result && !result.missing ? (
        <PreviewContent
          key={result.key}
          data={data}
          plan={result.plan}
          editKey={result.key}
          templateId={templateId}
          issues={result.issues}
          defaultName={result.name}
        />
      ) : null}
    </section>
  )
}
