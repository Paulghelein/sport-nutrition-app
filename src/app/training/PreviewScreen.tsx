import { useMemo } from 'react'
import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { generateSession } from '../../domain/training'
import type { LibraryExercise, SessionBlock, SessionExercise } from '../../types'
import { Card, ErrorNote, Section, formatKg, linkButtonClass, muscleLabel } from '../../ui'
import { DurationPicker } from './DurationPicker'
import { parseDuration, saveDuration } from './durations'
import { formatSeconds } from './format'
import { BackLink } from './parts'
import { useEngineInput } from './useEngineInput'

function targetText(se: SessionExercise, ex: LibraryExercise | undefined): string {
  const n = se.sets.length
  const first = se.sets[0]
  const side = ex?.unilateral ? ' par côté' : ''
  if (first?.targetDurationSec !== undefined) return `${n} × ${first.targetDurationSec} s${side}`
  const r = first?.targetReps
  if (r) return `${n} × ${r[0] === r[1] ? r[0] : `${r[0]} à ${r[1]}`} reps${side}`
  return `${n} séries`
}

function ExerciseLine({
  se,
  ex,
  showRest,
}: {
  se: SessionExercise
  ex: LibraryExercise | undefined
  showRest: boolean
}) {
  const load = se.sets[0]?.loadKg
  return (
    <div className="py-2.5">
      <Link
        to={`/seance/exercices/${se.exerciseId}`}
        className="inline-flex min-h-11 items-center text-lg font-semibold text-zinc-100 underline decoration-zinc-600 underline-offset-4"
      >
        {ex?.name ?? se.exerciseId}
      </Link>
      <p className="m-0 flex flex-wrap items-baseline gap-x-3 text-base text-zinc-300">
        <span className="text-xl font-bold tabular-nums text-zinc-100">{targetText(se, ex)}</span>
        {load !== undefined ? (
          <span className="font-semibold text-orange-300">{formatKg(load)} kg</span>
        ) : null}
        {showRest ? <span className="text-zinc-400">repos {formatSeconds(se.restSec)}</span> : null}
        {se.tempo ? <span className="text-zinc-400">tempo {se.tempo}</span> : null}
      </p>
    </div>
  )
}

function BlockCard({ block, byId }: { block: SessionBlock; byId: Map<string, LibraryExercise> }) {
  const superset = block.kind === 'superset'
  const finisher = block.kind === 'finisher'
  const rest = block.exercises[0]?.restSec ?? 0
  return (
    <Card className={finisher ? 'border-orange-400/50' : superset ? 'border-sky-400/40' : ''}>
      {superset ? (
        <p className="m-0 mb-1 text-sm font-semibold text-sky-300">
          Superset — repos {formatSeconds(rest)} après le tour
        </p>
      ) : null}
      {finisher ? <p className="m-0 mb-1 text-sm font-semibold text-orange-300">Finisher</p> : null}
      <ul className="m-0 list-none divide-y divide-line p-0">
        {block.exercises.map((se, i) => (
          <li key={`${se.exerciseId}-${i}`}>
            <ExerciseLine se={se} ex={byId.get(se.exerciseId)} showRest={!superset} />
          </li>
        ))}
      </ul>
    </Card>
  )
}

export default function PreviewScreen() {
  const [params, setParams] = useSearchParams()
  const duration = parseDuration(params.get('duree'))
  const { data, error } = useEngineInput()
  useEffect(() => saveDuration(duration), [duration])

  const result = useMemo(() => {
    if (!data) return undefined
    try {
      return {
        plan: generateSession({ ...data, durationMin: duration }),
        byId: new Map(data.library.map((e) => [e.id, e])),
      }
    } catch (e) {
      console.error('Génération de séance impossible', e)
      return null
    }
  }, [data, duration])

  const { plan, byId } = result ?? {}
  return (
    <section>
      <BackLink to="/seance">Séance</BackLink>
      <h1 className="mt-2 text-3xl font-bold">Aperçu</h1>
      <div className="mt-4">
        <DurationPicker
          legend="Changer la durée"
          value={duration}
          onChange={(d) => setParams({ duree: String(d) }, { replace: true })}
        />
      </div>

      {error || result === null ? (
        <div className="mt-5">
          <ErrorNote>
            Impossible de préparer la séance. Réessaie ou vérifie ton profil et ton matériel.
          </ErrorNote>
        </div>
      ) : null}
      {!data && !error ? <div aria-busy="true" className="min-h-40" /> : null}

      {plan && byId ? (
        <div>
          <Card className="mt-5" aria-live="polite">
            {plan.blocks.length > 0 ? (
              <>
                <p className="m-0 text-4xl font-bold tabular-nums">≈ {plan.estimatedMin} min</p>
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

          {plan.blocks.length === 0 ? (
            <Card className="mt-6">
              <p className="m-0 text-lg font-semibold">Aucune séance possible avec ces réglages.</p>
              <p className="m-0 mt-1 text-base text-zinc-300">
                Il n’y a pas assez d’exercices adaptés à ton matériel et à tes préférences. Vérifie ton
                matériel dans les Réglages, ou ajoute et réactive des exercices dans la bibliothèque.
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
              <Section title={`Échauffement · ${plan.warmupMin} min`}>
                <Card>
                  <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5 text-base text-zinc-200">
                    {plan.warmup.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ol>
                </Card>
              </Section>

              <Section title="Exercices">
                <div className="flex flex-col gap-3">
                  {plan.blocks.map((b) => (
                    <BlockCard key={b.id} block={b} byId={byId} />
                  ))}
                </div>
              </Section>
            </>
          )}

          <p className="mt-6 rounded-xl border border-line bg-surface px-4 py-3 text-base text-zinc-300">
            La séance guidée arrive au prochain jalon. Pour l’instant, c’est un aperçu : rien n’est
            enregistré.
          </p>
        </div>
      ) : null}
    </section>
  )
}
