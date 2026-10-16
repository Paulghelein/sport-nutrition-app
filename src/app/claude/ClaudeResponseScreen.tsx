// « Coller la réponse de Claude » (J9, SPEC §10.2). Toute la logique est dans useClaudeImport / selection.ts.
import { useId } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CLAUDE_TEMPLATE_ID } from '../../types/claude'
import { roundMacros } from '../../domain/nutrition'
import { formatDateFr } from '../../domain/shared/dates'
import type { ImportPreviewItem } from '../../types'
import {
  Button,
  Card,
  ErrorNote,
  SuccessNote,
  linkButtonClass,
  muscleLabel,
  patternLabel,
  preferenceLabel,
} from '../../ui'
import { SLOT_LABEL, macroLine } from '../nutrition/format'
import { fmtMinutes } from '../recipes/format'
import { Badge, focusRing } from '../recipes/parts'
import { useRecipeLibrary } from '../recipes/useRecipes'
import { newExerciseNameAt, outcomeLines, planLines, recipePreviewNutrition } from './selection'
import { useClaudeImport } from './useClaudeImport'

function Warnings({ list, id }: { list: readonly string[]; id?: string }) {
  if (list.length === 0) return null
  return (
    <ul id={id} className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
      {list.map((w, i) => (
        <li key={i} className="text-sm text-amber-300">
          ⚠ {w}
        </li>
      ))}
    </ul>
  )
}

function Selectable({
  checked,
  onChange,
  label,
  warnings = [],
  children,
}: {
  checked: boolean
  onChange: (on: boolean) => void
  label: string
  /** Avertissements de l'élément : affichés sous le contenu et reliés à la case (lecteurs d'écran). */
  warnings?: readonly string[]
  children: React.ReactNode
}) {
  const warnId = useId()
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-orange-400 ${
        checked ? 'border-orange-400/60 bg-orange-400/5' : 'border-v1-line bg-v1-surface'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        aria-label={label}
        aria-describedby={warnings.length > 0 ? warnId : undefined}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-6 shrink-0 accent-orange-400"
      />
      <span className="min-w-0 flex-1">
        {children}
        <Warnings list={warnings} id={warnId} />
      </span>
    </label>
  )
}

function Title({ name, badge, extra }: { name: string; badge: string; extra?: React.ReactNode }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-lg font-semibold leading-snug">{name}</span>
      <Badge>{badge}</Badge>
      {extra}
    </span>
  )
}

export default function ClaudeResponseScreen() {
  const s = useClaudeImport()
  const navigate = useNavigate()
  const { data: lib } = useRecipeLibrary()
  const items = s.items

  const renderItem = (item: ImportPreviewItem) => {
    if (item.kind === 'recipe') {
      const nutrition = recipePreviewNutrition(item.recipe, lib?.lookup)
      return (
        <Selectable
          checked={s.selected.has(item.index)}
          onChange={(on) => s.toggle(item.index, on)}
          label={`Créer la recette ${item.recipe.name}`}
          warnings={item.warnings}
        >
          <Title name={item.recipe.name} badge="Recette" />
          <span className="mt-1 block text-sm text-zinc-400">
            {item.recipe.servings} portion{item.recipe.servings > 1 ? 's' : ''} ·{' '}
            {fmtMinutes(item.recipe.prepMinutes + item.recipe.cookMinutes)} · {item.recipe.ingredients.length}{' '}
            ingrédients
          </span>
          {nutrition ? (
            <span className="mt-1 block text-base font-medium tabular-nums">
              {macroLine(nutrition.perServing)}
              <span className="text-sm font-normal text-zinc-400"> par portion</span>
            </span>
          ) : null}
        </Selectable>
      )
    }
    if (item.kind === 'meal') {
      return (
        <Selectable
          checked={s.selected.has(item.index)}
          onChange={(on) => s.toggle(item.index, on)}
          label={`Ajouter le repas ${item.meal.name} au journal`}
          warnings={item.warnings}
        >
          <Title
            name={item.meal.name}
            badge="Repas"
            extra={item.meal.estimated ? <Badge tone="warn">Estimé</Badge> : null}
          />
          <span className="mt-1 block text-sm text-zinc-400">
            {SLOT_LABEL[item.meal.slot]} · {formatDateFr(item.meal.date)}
          </span>
          <span className="mt-1 block text-base font-medium tabular-nums">
            {macroLine(roundMacros(item.meal.totals))}
          </span>
        </Selectable>
      )
    }
    if (item.kind === 'sessionPlan') {
      const lines = planLines(item.plan, s.nameOf, (i) => newExerciseNameAt(items ?? [], i), s.selected)
      return (
        <Selectable
          checked={s.selected.has(item.index)}
          onChange={(on) => s.toggle(item.index, on)}
          label="Utiliser la séance proposée par Claude"
          warnings={item.warnings}
        >
          <Title name={`Séance de ${item.plan.durationMin} min`} badge="Séance" />
          <ol className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
            {lines.map((l, i) => (
              <li key={i} className="text-base">
                <span className="font-medium">{l.name}</span>
                {l.isNew ? <span className="text-sm text-amber-300"> (nouvel exercice)</span> : null}
                {l.group ? <span className="text-sm text-sky-300"> · {l.group}</span> : null}
                {l.dropped ? (
                  <span className="text-sm text-amber-300"> · écartée : exercice non coché</span>
                ) : null}
                <span className="block text-sm tabular-nums text-zinc-400">{l.text}</span>
              </li>
            ))}
          </ol>
          {item.plan.unknownExerciseIds.length > 0 ? (
            <p className="m-0 mt-2 text-sm text-amber-300">
              ⚠ Exercices inconnus, écartés : {item.plan.unknownExerciseIds.join(', ')}.
            </p>
          ) : null}
        </Selectable>
      )
    }
    if (item.kind === 'exercise') {
      const ex = item.exercise
      return (
        <Selectable
          checked={s.selected.has(item.index)}
          onChange={(on) => s.toggle(item.index, on)}
          label={`Créer l’exercice ${ex.name}`}
          warnings={item.warnings}
        >
          <Title name={ex.name} badge="Exercice" />
          <span className="mt-1 block text-sm text-zinc-400">
            {patternLabel(ex.pattern)} · niveau {ex.level} · {ex.muscles.primary.map(muscleLabel).join(', ')}
          </span>
        </Selectable>
      )
    }
    if (item.kind === 'exercisePreference') {
      const p = item.preference
      return (
        <Selectable
          checked={s.selected.has(item.index)}
          onChange={(on) => s.toggle(item.index, on)}
          label={`Enregistrer la préférence pour ${s.nameOf(p.exerciseId)}`}
          warnings={item.warnings}
        >
          <Title name={s.nameOf(p.exerciseId)} badge="Préférence" />
          <span className="mt-1 block text-base">{preferenceLabel(p.preference)}</span>
          {p.reason ? <span className="mt-1 block text-sm text-zinc-400">{p.reason}</span> : null}
        </Selectable>
      )
    }
    if (item.kind === 'unsupported') {
      return (
        <div className="rounded-2xl border border-v1-line bg-v1-surface p-3 opacity-80">
          <p className="text-base font-semibold">
            Élément {item.index + 1} : <span className="font-mono text-sm">{item.type}</span>
          </p>
          <p className="mt-1 text-sm text-zinc-400">{item.message}</p>
          <p className="mt-1 text-sm text-zinc-400">Ignoré.</p>
        </div>
      )
    }
    return (
      <div className="rounded-2xl border border-red-400/40 bg-red-500/10 p-3">
        <p className="text-base font-semibold text-red-200">Élément {item.index + 1} invalide</p>
        <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
          {item.errors.map((e, i) => (
            <li key={i} className="text-sm text-red-200">
              {e}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <section>
      <Link
        to="/entrainement"
        onClick={(e) => {
          // Retour à l'écran d'où l'on vient (journal, séance…) ; sans historique (lien direct), on va à Séance.
          if ((window.history.state as { idx?: number } | null)?.idx) {
            e.preventDefault()
            navigate(-1)
          }
        }}
        className="-ml-2 inline-flex min-h-11 items-center rounded-lg px-2 text-base font-medium text-orange-400 no-underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-orange-400"
      >
        ‹ Retour
      </Link>
      <h1 className="mt-1 text-3xl font-bold">Réponse de Claude</h1>
      <p className="mt-2 text-base text-zinc-400">
        Copie la réponse de Claude, puis colle-la ici. Tu vois tout avant que quelque chose soit enregistré.
      </p>

      {s.outcome ? (
        <div className="mt-4 flex flex-col gap-3">
          <SuccessNote>
            {outcomeLines(s.outcome).map((l, i) => (
              <span key={i} className="block">
                {l}
              </span>
            ))}
          </SuccessNote>
          {s.outcome.sessionPlanFor !== undefined ? (
            <Link
              to={`/entrainement/apercu?modele=${CLAUDE_TEMPLATE_ID}`}
              className={linkButtonClass('primary')}
            >
              Voir la séance
            </Link>
          ) : null}
          {s.outcome.mealsLogged > 0 ? (
            <Link to="/nutrition" className={linkButtonClass('secondary')}>
              Voir le journal
            </Link>
          ) : null}
          {s.outcome.recipesCreated > 0 ? (
            <Link to="/nutrition/recettes" className={linkButtonClass('secondary')}>
              Voir les recettes
            </Link>
          ) : null}
        </div>
      ) : null}

      {s.loadError ? (
        <div className="mt-4">
          <ErrorNote>
            Impossible de lire tes données (profil, bibliothèque). Ferme l’app puis rouvre-la.
          </ErrorNote>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-2">
        <Button onClick={() => void s.pasteFromClipboard()} disabled={s.busy || !s.ready}>
          Coller depuis le presse-papiers
        </Button>
        {s.pasteNote ? (
          <p role="status" className="m-0 text-sm text-amber-300">
            {s.pasteNote}
          </p>
        ) : null}
      </div>

      <div className="mt-4">
        <label htmlFor="claude-paste" className="mb-1.5 block text-sm font-medium text-zinc-300">
          Réponse à analyser
        </label>
        <textarea
          id="claude-paste"
          rows={6}
          value={s.text}
          readOnly={s.busy}
          onChange={(e) => s.setText(e.target.value)}
          placeholder="Colle ici la réponse de Claude"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={`w-full rounded-xl border border-v1-line bg-v1-surface-hi px-3 py-2.5 font-mono text-sm text-zinc-100 placeholder:text-zinc-500 ${focusRing}`}
        />
      </div>
      <Button
        className="mt-3"
        variant="secondary"
        onClick={() => void s.analyse()}
        disabled={s.busy || !s.ready || s.text.trim() === ''}
      >
        Analyser
      </Button>

      {s.parseError ? (
        <div className="mt-4">
          <ErrorNote>{s.parseError}</ErrorNote>
        </div>
      ) : null}

      {items ? (
        <section className="mt-7" aria-labelledby="claude-preview">
          <h2 id="claude-preview" className="text-xl font-bold">
            Aperçu
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            {items.length} élément{items.length > 1 ? 's' : ''} trouvé{items.length > 1 ? 's' : ''}. Décoche
            ce que tu ne veux pas garder.
          </p>
          <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
            {items.map((item) => (
              <li key={item.index}>{renderItem(item)}</li>
            ))}
          </ul>
          {s.applyError ? (
            <div className="mt-3">
              <ErrorNote>{s.applyError}</ErrorNote>
            </div>
          ) : null}
          <Card className="mt-4">
            <p className="text-base">
              À appliquer : <strong>{s.count}</strong> élément{s.count > 1 ? 's' : ''}.
            </p>
            <Button className="mt-3" onClick={() => void s.apply()} disabled={s.busy || s.count === 0}>
              Appliquer
            </Button>
          </Card>
        </section>
      ) : null}
    </section>
  )
}
