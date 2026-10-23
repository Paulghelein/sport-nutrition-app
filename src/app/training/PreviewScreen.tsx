import { ArrowDown, ArrowLeftRight, ArrowUp, Play, Trash2 } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { buildSessionBeforeMessage } from '../../domain/claude/context'
import type { ClaudeBaseInput } from '../../domain/claude/context'
import { CLAUDE_TEMPLATE_ID } from '../../types/claude'
import { getActiveSession, listTemplates, startSession } from '../../db'
import {
  addCandidates,
  addExercise,
  buildWarmup,
  estimateMinutes,
  moveBlock,
  planFromTemplate,
  removeExercise,
  replaceExercise,
  replacementCandidates,
  patternLevels,
  sessionFromPlan,
  sessionHeadline,
  templateIssues,
  templateTargetNotes,
  volumeTargets,
  weeklyVolume,
} from '../../domain/training'
import type { TemplateIssue } from '../../domain/training'
import type { EngineInput, LibraryExercise, SessionBlock, SessionDuration, SessionPlan } from '../../types'
import { errorMessage, muscleLabel, useLiveQuery } from '../../ui'
import { Button, Card, Segmented, StatTile, buttonClass, cx, formatInt, withUnit } from '../../ui/kit'
import { ExerciseRow } from '../../ui/kit/ExerciseRow'
import { Note } from '../../ui/kit/Note'
import { AskClaudeButton } from '../claude/AskClaudeButton'
import { PLAN_ISSUE_TEXT } from '../claude/importContext'
import { sessionBeforeData } from '../claude/inputs'
import { GUIDED_PATH, LIBRARY_PATH, SETTINGS_PATH, TEMPLATES_PATH, TRAINING_PATH } from '../routes'
import { DURATIONS, parseDuration, saveDuration } from './durations'
import { ExercisePickerSheet } from './ExercisePickerSheet'
import { formatSeconds } from './format'
import { ScreenTitle, Section } from './parts'
import { BackLink } from '../../ui/kit/BackLink'
import { planForDuration, previewKey } from './previewPlan'
import { clearPreviewEdit, loadPreviewEdit, savePreviewEdit } from './previewDraft'
import { exerciseText, lastLoadKg, loadIncrease, plannedTotals } from './prescription'
import { SaveTemplate } from './SaveTemplate'
import { useEngineInput } from './useEngineInput'
import type { EngineBase } from './useEngineInput'

const DURATION_OPTIONS = DURATIONS.map((d) => ({ value: d, label: `${d}\u00a0min` }))

const ROUND_BUTTON =
  'focus-ring grid size-11 shrink-0 place-items-center rounded-full bg-transparent text-ink-muted active:bg-canvas disabled:text-ink-faint'

type Picker = { kind: 'replace'; block: number; exercise: number } | { kind: 'add' } | null

interface ContentProps {
  data: EngineBase
  plan: SessionPlan
  editKey: string
  templateId: string | undefined
  issues: TemplateIssue[]
  /** Écarts entre les cibles de Claude et celles retenues (séance proposée par Claude seulement). */
  notes: string[]
  defaultName: string
  /** Sous-titre : « Séance de 30 min · proposée pour toi », « Modèle : … ». */
  subtitle: string
  /** Titre imposé (séance proposée par Claude) ; sinon le titre généré par le moteur. */
  titleOverride?: string
  /** Lien retour, affiché à gauche de « Demander à Claude ». */
  back: ReactNode
}

/**
 * Édition de l'aperçu (types de séries, F3) : remplacer ou ajouter un exercice reconstruit des séries NORMALES
 * (`replaceExercise` / `addExercise` du moteur) : une série max (AMRAP) ou en temps fixe ne survit pas à un
 * remplacement, et l'aperçu n'en pose jamais de nouvelle à la main (le moteur seul en décide, selon ses règles de
 * sécurité). Déplacer ou retirer un AUTRE exercice ne touche pas aux séries : un exercice qui avait une série max
 * la garde. « Revenir à la séance proposée » rend la séance du moteur.
 */
function PreviewContent({
  data,
  plan,
  editKey,
  templateId,
  issues,
  notes,
  defaultName,
  subtitle,
  titleOverride,
  back,
}: ContentProps) {
  const navigate = useNavigate()
  const active = useLiveQuery(() => getActiveSession(), [])
  const [edited, setEdited] = useState<SessionBlock[] | null>(() => loadPreviewEdit(editKey))
  const [picker, setPicker] = useState<Picker>(null)
  const [editing, setEditing] = useState(false)
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
  const totals = useMemo(() => plannedTotals(blocks, byId), [blocks, byId])

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

  const buildAsk = useMemo(() => {
    if (blocks.length === 0) return null
    const levels = patternLevels(data.library, data.states, data.profileLevel)
    const extra = sessionBeforeData(plan, blocks, estimated, data.library, levels)
    return (base: ClaudeBaseInput) => buildSessionBeforeMessage({ ...base, ...extra })
  }, [blocks, data.library, data.states, data.profileLevel, estimated, plan])

  const title = useMemo(() => {
    if (blocks.length === 0) return null
    try {
      return sessionHeadline(
        { ...plan, blocks },
        data.library,
        weeklyVolume(data.sessions, data.library, data.date),
        volumeTargets(data.settings, data.equipment),
      ).title
    } catch {
      return null
    }
  }, [blocks, plan, data])

  const empty = blocks.length === 0
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        {back}
        {!empty ? (
          <AskClaudeButton
            kind="session_before"
            build={buildAsk}
            renderTrigger={(t) => (
              <button
                type="button"
                onClick={t.onClick}
                disabled={t.disabled}
                aria-busy={t.busy}
                className="focus-ring min-h-11 rounded-full bg-surface px-3.5 text-body-strong text-ink shadow-card disabled:text-ink-muted"
              >
                {t.label}
              </button>
            )}
          />
        ) : null}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-caption text-ink-muted">{subtitle}</span>
        <h1 className="m-0 font-display text-display-m">{titleOverride ?? title ?? 'Aperçu'}</h1>
      </div>

      {!empty ? (
        <Card
          padding="none"
          className="grid grid-cols-3 divide-x divide-line px-1.5 py-3.5"
          aria-live="polite"
        >
          <StatTile label="Durée" value={`≈ ${estimated} min`} />
          <StatTile label="Séries" value={String(totals.sets)} />
          <StatTile
            label="Volume"
            value={totals.tonnageKg > 0 ? withUnit(formatInt(totals.tonnageKg), 'kg') : '—'}
          />
        </Card>
      ) : (
        <p className="m-0 text-body text-ink-muted">{plan.durationMin} min disponibles</p>
      )}

      {plan.deload ? (
        <Note tone="warning">
          <p className="m-0 font-semibold">Semaine allégée</p>
          <p className="m-0 text-caption text-ink-muted">
            {plan.deloadReason === 'scheduled'
              ? 'Prévue : cela fait plusieurs semaines sans pause. Moitié moins de séries, même charge.'
              : plan.deloadReason === 'fatigue'
                ? 'Tu as enchaîné des séances difficiles. Moitié moins de séries, même charge.'
                : 'Semaine allégée en cours : moitié moins de séries, même charge.'}
          </p>
        </Note>
      ) : null}
      {plan.focus.length > 0 && !empty ? (
        <p className="m-0 text-body text-ink-muted">
          Groupes visés : <span className="text-ink">{plan.focus.map(muscleLabel).join(', ')}</span>
        </p>
      ) : null}

      {issues.length > 0 ? (
        <Note tone="warning">
          <p className="m-0 font-semibold">Certains exercices du modèle sont ignorés :</p>
          <ul className="m-0 mt-1 list-disc pl-5">
            {issues.map((i) => (
              <li key={i.exerciseId}>
                {byId.get(i.exerciseId)?.name ?? i.exerciseId} : {PLAN_ISSUE_TEXT[i.reason]}
              </li>
            ))}
          </ul>
        </Note>
      ) : null}

      {notes.length > 0 ? (
        <Note tone="warning">
          <p className="m-0 font-semibold">Cibles de Claude ajustées :</p>
          <ul className="m-0 mt-1 list-disc pl-5">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Note>
      ) : null}

      {empty && !edited ? (
        <Card padding="large" className="flex flex-col gap-3">
          <p className="m-0 font-display text-title">Aucune séance possible avec ces réglages.</p>
          <p className="m-0 text-body text-ink-muted">
            Il n’y a pas assez d’exercices adaptés à ton matériel et à tes préférences. Vérifie ton matériel
            dans les Réglages, ou ajoute et réactive des exercices dans la bibliothèque.
          </p>
          <Link to={SETTINGS_PATH} className={buttonClass('primary', 'normal', true)}>
            Ouvrir les Réglages
          </Link>
          <Link to={LIBRARY_PATH} className={buttonClass('secondary', 'normal', true)}>
            Bibliothèque d’exercices
          </Link>
        </Card>
      ) : (
        <>
          {!empty ? (
            <Section title={`Échauffement · ${plan.warmupMin} min`}>
              <Card>
                <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-body">
                  {warmup.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ol>
              </Card>
            </Section>
          ) : null}

          <Section title="Exercices">
            {empty ? (
              <p className="m-0 text-body text-ink-muted">Plus aucun exercice : ajoute-en au moins un.</p>
            ) : (
              <Card as="section" aria-label="Exercices" padding="none" className="px-4 py-1">
                {blocks.map((block, bi) => {
                  const superset = block.kind === 'superset'
                  const finisher = block.kind === 'finisher'
                  return (
                    <Fragment key={block.id}>
                      {superset || finisher || editing ? (
                        <div
                          className={cx(
                            'flex min-h-11 items-center justify-between gap-2 pt-2',
                            bi > 0 && 'mt-1 border-t border-line',
                          )}
                        >
                          <span className="text-label uppercase text-ember-ink">
                            {finisher
                              ? 'Finisher'
                              : superset
                                ? `Superset — repos ${formatSeconds(block.exercises[0]?.restSec ?? 0)} après le tour`
                                : ''}
                          </span>
                          {editing ? (
                            <span role="group" aria-label={`Bloc ${bi + 1} : ordre`} className="flex">
                              <button
                                type="button"
                                className={ROUND_BUTTON}
                                disabled={bi === 0 || finisher}
                                onClick={() => change(moveBlock(blocks, bi, bi - 1))}
                                aria-label={`Monter le bloc ${bi + 1}`}
                              >
                                <ArrowUp size={20} strokeWidth={1.75} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className={ROUND_BUTTON}
                                disabled={
                                  bi === blocks.length - 1 || finisher || blocks[bi + 1]?.kind === 'finisher'
                                }
                                onClick={() => change(moveBlock(blocks, bi, bi + 1))}
                                aria-label={`Descendre le bloc ${bi + 1}`}
                              >
                                <ArrowDown size={20} strokeWidth={1.75} aria-hidden="true" />
                              </button>
                            </span>
                          ) : null}
                        </div>
                      ) : bi > 0 ? (
                        <div className="border-t border-line" />
                      ) : null}
                      {block.exercises.map((se, ei) => {
                        const ex = byId.get(se.exerciseId)
                        const name = ex?.name ?? se.exerciseId
                        const text = exerciseText(se, ex, { showRest: !superset })
                        const rise = loadIncrease(text.loadKg, lastLoadKg(data.sessions, se.exerciseId))
                        return (
                          <ExerciseRow
                            key={`${se.exerciseId}-${ei}`}
                            className="border-t-0"
                            muscles={ex?.muscles.primary ?? []}
                            title={
                              <Link
                                to={`${LIBRARY_PATH}/${se.exerciseId}`}
                                className="focus-ring inline-flex min-h-11 items-center text-ink no-underline"
                              >
                                {name}
                              </Link>
                            }
                            summary={text.summary}
                            detail={
                              <>
                                {text.details.join(' · ')}
                                {rise ? (
                                  <>
                                    {text.details.length > 0 ? ' · ' : ''}
                                    <span className="font-semibold text-ember-ink">{rise}</span>
                                  </>
                                ) : null}
                              </>
                            }
                            actions={
                              <>
                                <button
                                  type="button"
                                  className={ROUND_BUTTON}
                                  onClick={() => setPicker({ kind: 'replace', block: bi, exercise: ei })}
                                  aria-label={`Remplacer ${name}`}
                                >
                                  <ArrowLeftRight size={20} strokeWidth={1.75} aria-hidden="true" />
                                </button>
                                {editing ? (
                                  <button
                                    type="button"
                                    className={ROUND_BUTTON}
                                    onClick={() => change(removeExercise(blocks, bi, ei))}
                                    aria-label={`Retirer ${name}`}
                                  >
                                    <Trash2 size={20} strokeWidth={1.75} aria-hidden="true" />
                                  </button>
                                ) : null}
                              </>
                            }
                          />
                        )
                      })}
                    </Fragment>
                  )
                })}
              </Card>
            )}
            {editing || empty ? (
              <div className="flex flex-col gap-2">
                <Button variant="secondary" fullWidth onClick={() => setPicker({ kind: 'add' })}>
                  Ajouter un exercice
                </Button>
                {edited ? (
                  <Button variant="text" fullWidth onClick={reset}>
                    Revenir à la séance proposée
                  </Button>
                ) : null}
              </div>
            ) : null}
          </Section>

          {!empty ? (
            <div className="mt-2">
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
        <div className="ds-bleed sticky bottom-0 z-10 mt-4 flex flex-col gap-2 bg-canvas pb-3 pt-3 shadow-[0_-12px_24px_var(--color-canvas)]">
          {error ? <Note tone="error">{error}</Note> : null}
          {active.data ? (
            <>
              <p className="m-0 text-caption text-ink-muted">
                Une séance est déjà en cours. Reprends-la, ou abandonne-la avant d’en commencer une autre.
              </p>
              <Link to={GUIDED_PATH} className={buttonClass('primary', 'session', true)}>
                Reprendre la séance en cours
              </Link>
            </>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="session"
                onClick={() => setEditing((v) => !v)}
                aria-pressed={editing}
              >
                {editing ? 'Terminé' : 'Modifier'}
              </Button>
              <Button
                size="session"
                className="flex-1"
                icon={<Play size={20} strokeWidth={1.75} aria-hidden="true" />}
                onClick={() => void start()}
                disabled={busy}
              >
                Démarrer
              </Button>
            </div>
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
    </>
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
        // Séance proposée par Claude : ses cibles sont reprises (plafonnées à la progression), écarts signalés.
        const fromClaude = template.id === CLAUDE_TEMPLATE_ID
        return {
          missing: false as const,
          plan: planFromTemplate(template, input, fromClaude ? { useTemplateTargets: true } : {}),
          issues: templateIssues(template, input),
          notes: fromClaude ? templateTargetNotes(template, input) : [],
          // La séance de Claude est écrasée à chaque application : une modification de l'aperçu précédent ne doit pas survivre.
          key: `modele:${template.id}:${fromClaude ? template.updatedAt + ':' : ''}${data.date}`,
          name: template.name,
          subtitle: fromClaude
            ? `Séance de ${template.durationMin} min`
            : `Modèle « ${template.name} » · ${template.durationMin} min`,
        }
      }
      return {
        missing: false as const,
        plan: planForDuration(data, duration),
        issues: [] as TemplateIssue[],
        notes: [] as string[],
        key: previewKey(duration, data.date),
        name: `Séance ${duration} min`,
        subtitle: `Séance de ${duration} min · proposée pour toi`,
      }
    } catch (e) {
      console.error('Génération de séance impossible', e)
      return null
    }
  }, [data, duration, templateId, templates.data])

  const fromTemplate = templateId !== undefined
  const back = (
    <BackLink to={fromTemplate ? TEMPLATES_PATH : TRAINING_PATH}>
      {fromTemplate ? 'Modèles' : 'Entraînement'}
    </BackLink>
  )
  const ready = data !== undefined && result !== undefined && result !== null && !result.missing
  return (
    <section className="flex flex-col gap-3.5">
      {ready ? null : back}

      {!fromTemplate ? (
        <Segmented
          ariaLabel="Changer la durée"
          value={duration as SessionDuration}
          options={DURATION_OPTIONS}
          onChange={(d) => setParams({ duree: String(d) }, { replace: true })}
        />
      ) : null}

      {error || result === null || templates.error ? (
        <Note tone="error">
          Impossible de préparer la séance. Réessaie ou vérifie ton profil et ton matériel.
        </Note>
      ) : null}
      {result?.missing ? (
        <>
          <ScreenTitle>Séance introuvable</ScreenTitle>
          <Note tone="error">Ce modèle n’existe plus.</Note>
        </>
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
          notes={result.notes}
          defaultName={result.name}
          subtitle={result.subtitle}
          titleOverride={templateId === CLAUDE_TEMPLATE_ID ? 'Séance proposée par Claude' : undefined}
          back={back}
        />
      ) : null}
    </section>
  )
}
