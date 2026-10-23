// « Coller la réponse de Claude » (J9, SPEC §10.2). Toute la logique est dans useClaudeImport / selection.ts.
import { ClipboardPaste } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { CLAUDE_TEMPLATE_ID } from '../../types/claude'
import type { ImportPreviewItem } from '../../types'
import { muscleLabel, patternLabel, preferenceLabel } from '../../ui'
import { Button, Card } from '../../ui/kit'
import { BackLink } from '../../ui/kit/BackLink'
import { buttonClass } from '../../ui/kit/buttonClass'
import { Note } from '../../ui/kit/Note'
import { useRecipeLibrary } from '../recipes/useRecipes'
import { PREVIEW_PATH, RECIPES_PATH, NUTRITION_PATH, TRAINING_PATH } from '../routes'
import {
  InvalidPreviewCard,
  MealPreviewCard,
  PreviewMeta,
  PreviewSection,
  PreviewTitle,
  RecipePreviewCard,
  SelectableCard,
  UnsupportedPreviewCard,
  pasteAreaClass,
} from './previewCards'
import { newExerciseNameAt, outcomeLines, planLines } from './selection'
import { useClaudeImport } from './useClaudeImport'

export default function ClaudeResponseScreen() {
  const s = useClaudeImport()
  const navigate = useNavigate()
  const { data: lib } = useRecipeLibrary()
  const items = s.items

  const renderItem = (item: ImportPreviewItem) => {
    if (item.kind === 'recipe') {
      return (
        <RecipePreviewCard
          item={item}
          lookup={lib?.lookup}
          label={`Créer la recette ${item.recipe.name}`}
          checked={s.selected.has(item.index)}
          onChange={(on) => s.toggle(item.index, on)}
        />
      )
    }
    if (item.kind === 'meal') {
      return (
        <MealPreviewCard
          item={item}
          checked={s.selected.has(item.index)}
          onChange={(on) => s.toggle(item.index, on)}
        />
      )
    }
    if (item.kind === 'sessionPlan') {
      const lines = planLines(item.plan, s.nameOf, (i) => newExerciseNameAt(items ?? [], i), s.selected)
      return (
        <SelectableCard
          checked={s.selected.has(item.index)}
          onChange={(on) => s.toggle(item.index, on)}
          label="Utiliser la séance proposée par Claude"
          warnings={item.warnings}
        >
          <PreviewTitle name={`Séance de ${item.plan.durationMin} min`} badge="Séance" />
          <ol className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
            {lines.map((l, i) => (
              <li key={i} className="text-body">
                <span className="text-body-strong">{l.name}</span>
                {l.isNew ? <span className="text-caption text-warning"> (nouvel exercice)</span> : null}
                {l.group ? <span className="text-caption text-ink-muted"> · {l.group}</span> : null}
                {l.dropped ? (
                  <span className="text-caption text-warning"> · écartée : exercice non coché</span>
                ) : null}
                <span className="block text-caption tabular-nums text-ink-muted">{l.text}</span>
              </li>
            ))}
          </ol>
          {item.plan.unknownExerciseIds.length > 0 ? (
            <p className="m-0 mt-2 text-caption text-warning">
              Exercices inconnus, écartés : {item.plan.unknownExerciseIds.join(', ')}.
            </p>
          ) : null}
        </SelectableCard>
      )
    }
    if (item.kind === 'exercise') {
      const ex = item.exercise
      return (
        <SelectableCard
          checked={s.selected.has(item.index)}
          onChange={(on) => s.toggle(item.index, on)}
          label={`Créer l’exercice ${ex.name}`}
          warnings={item.warnings}
        >
          <PreviewTitle name={ex.name} badge="Exercice" />
          <PreviewMeta>
            {patternLabel(ex.pattern)} · niveau {ex.level} · {ex.muscles.primary.map(muscleLabel).join(', ')}
          </PreviewMeta>
        </SelectableCard>
      )
    }
    if (item.kind === 'exercisePreference') {
      const p = item.preference
      return (
        <SelectableCard
          checked={s.selected.has(item.index)}
          onChange={(on) => s.toggle(item.index, on)}
          label={`Enregistrer la préférence pour ${s.nameOf(p.exerciseId)}`}
          warnings={item.warnings}
        >
          <PreviewTitle name={s.nameOf(p.exerciseId)} badge="Préférence" />
          <span className="mt-1 block text-body">{preferenceLabel(p.preference)}</span>
          {p.reason ? <PreviewMeta>{p.reason}</PreviewMeta> : null}
        </SelectableCard>
      )
    }
    if (item.kind === 'unsupported') return <UnsupportedPreviewCard item={item} />
    return <InvalidPreviewCard item={item} />
  }

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-5">
      <BackLink
        to={TRAINING_PATH}
        onClick={(e) => {
          // Retour à l'écran d'où l'on vient (journal, séance…) ; sans historique (lien direct), on va à Séance.
          if ((window.history.state as { idx?: number } | null)?.idx) {
            e.preventDefault()
            void navigate(-1)
          }
        }}
      >
        Retour
      </BackLink>
      <div>
        <h1 className="m-0 font-display text-display-l">Réponse de Claude</h1>
        <p className="m-0 mt-2 text-body text-ink-muted">
          Copie la réponse de Claude, puis colle-la ici. Tu vois tout avant que quelque chose soit enregistré.
        </p>
      </div>

      {s.outcome ? (
        <div className="flex flex-col gap-3">
          <Note tone="success">
            {outcomeLines(s.outcome).map((l, i) => (
              <span key={i} className="block">
                {l}
              </span>
            ))}
          </Note>
          {s.outcome.sessionPlanFor !== undefined ? (
            <Link
              to={`${PREVIEW_PATH}?modele=${CLAUDE_TEMPLATE_ID}`}
              className={buttonClass('primary', 'normal', true)}
            >
              Voir la séance
            </Link>
          ) : null}
          {s.outcome.mealsLogged > 0 ? (
            <Link to={NUTRITION_PATH} className={buttonClass('secondary', 'normal', true)}>
              Voir le journal
            </Link>
          ) : null}
          {s.outcome.recipesCreated > 0 ? (
            <Link to={RECIPES_PATH} className={buttonClass('secondary', 'normal', true)}>
              Voir les recettes
            </Link>
          ) : null}
        </div>
      ) : null}

      {s.loadError ? (
        <Note tone="error">
          Impossible de lire tes données (profil, bibliothèque). Ferme l’app puis rouvre-la.
        </Note>
      ) : null}

      <div className="flex flex-col gap-2">
        <Button
          variant={items || s.outcome ? 'flat' : 'primary'}
          fullWidth
          icon={<ClipboardPaste size={20} strokeWidth={1.75} aria-hidden="true" />}
          onClick={() => void s.pasteFromClipboard()}
          disabled={s.busy || !s.ready}
        >
          Coller depuis le presse-papiers
        </Button>
        {s.pasteNote ? (
          <p role="status" className="m-0 text-caption text-warning">
            {s.pasteNote}
          </p>
        ) : null}
      </div>

      <Card className="flex flex-col gap-3">
        <div>
          <label htmlFor="claude-paste" className="mb-1.5 block text-caption text-ink-muted">
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
            className={pasteAreaClass}
          />
        </div>
        <Button
          variant="flat"
          fullWidth
          onClick={() => void s.analyse()}
          disabled={s.busy || !s.ready || s.text.trim() === ''}
        >
          Analyser
        </Button>
      </Card>

      {s.parseError ? <Note tone="error">{s.parseError}</Note> : null}

      {items ? (
        <>
          <PreviewSection id="claude-preview" items={items} renderItem={renderItem} />
          {s.applyError ? <Note tone="error">{s.applyError}</Note> : null}
          <Card className="flex flex-col gap-3">
            <p className="m-0 text-body">
              À appliquer : <strong>{s.count}</strong> élément{s.count > 1 ? 's' : ''}.
            </p>
            <Button fullWidth onClick={() => void s.apply()} disabled={s.busy || s.count === 0}>
              Appliquer
            </Button>
          </Card>
        </>
      ) : null}
    </section>
  )
}
