// Cartes d'aperçu communes à « Importer » (Réglages) et « Réponse de Claude » : même présentation d'un élément reçu
// (case à cocher sur toute la carte, titre + pastille de type, détails, avertissements, éléments ignorés ou invalides).
// Vivent ici car l'écran de réponse de Claude est le plus riche (séance, exercice, préférence) ; l'import en réutilise
// la recette, le repas, l'élément ignoré et l'élément invalide. Aucune règle métier : tout est calculé par l'appelant.
import { AlertTriangle } from 'lucide-react'
import { useId } from 'react'
import type { ReactNode } from 'react'
import type { ImportPreviewItem } from '../../types'
import { roundMacros } from '../../domain/nutrition'
import { formatDateFr } from '../../domain/shared/dates'
import { Card } from '../../ui/kit'
import { cx } from '../../ui/kit/cx'
import { SLOT_LABEL, macroLine } from '../nutrition/format'
import { fmtMinutes } from '../recipes/format'
import { Badge } from '../recipes/parts'
import { recipePreviewNutrition } from './selection'

/** Zone de texte monospace où l'on colle une réponse ou un JSON. */
export const pasteAreaClass =
  'focus-ring w-full rounded-md bg-canvas px-3.5 py-3 font-mono text-input text-ink placeholder:text-ink-muted'

/** Liste d'avertissements (icône ET texte). */
export function PreviewWarnings({ list, id }: { list: readonly string[]; id?: string }) {
  if (list.length === 0) return null
  return (
    <ul id={id} className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
      {list.map((w, i) => (
        <li key={i} className="flex gap-1.5 text-caption text-warning">
          <AlertTriangle size={16} strokeWidth={1.75} aria-hidden="true" className="mt-px shrink-0" />
          <span>{w}</span>
        </li>
      ))}
    </ul>
  )
}

/** Carte cochable : toute la carte est la case (cible large), l'état est dit par la case ET l'anneau. */
export function SelectableCard({
  checked,
  onChange,
  label,
  warnings = [],
  children,
}: {
  checked: boolean
  onChange: (on: boolean) => void
  /** Nom accessible de la case (« Créer la recette … »). */
  label: string
  /** Avertissements de l'élément : sous le contenu, reliés à la case (lecteurs d'écran). */
  warnings?: readonly string[]
  children: ReactNode
}) {
  const warnId = useId()
  return (
    <label
      className={cx(
        'flex cursor-pointer items-start gap-3 rounded-lg bg-surface p-4 shadow-card',
        'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus',
        checked && 'ring-2 ring-ink',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        aria-label={label}
        aria-describedby={warnings.length > 0 ? warnId : undefined}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-6 shrink-0 accent-ink"
      />
      <span className="min-w-0 flex-1">
        {children}
        <PreviewWarnings list={warnings} id={warnId} />
      </span>
    </label>
  )
}

export function PreviewTitle({ name, badge, extra }: { name: string; badge: string; extra?: ReactNode }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-headline">{name}</span>
      <Badge>{badge}</Badge>
      {extra}
    </span>
  )
}

export function PreviewMeta({ children }: { children: ReactNode }) {
  return <span className="mt-1 block text-caption text-ink-muted">{children}</span>
}

type Item<K extends ImportPreviewItem['kind']> = Extract<ImportPreviewItem, { kind: K }>

/** Recette reçue : portions, temps, contenu et macros par portion (une fois les aliments chargés). */
export function RecipePreviewCard({
  item,
  lookup,
  label,
  checked,
  onChange,
}: {
  item: Item<'recipe'>
  /** Nom accessible de la case (« Importer la recette … » ou « Créer la recette … »). */
  label: string
  lookup: Parameters<typeof recipePreviewNutrition>[1]
  checked: boolean
  onChange: (on: boolean) => void
}) {
  const r = item.recipe
  const nutrition = recipePreviewNutrition(r, lookup)
  return (
    <SelectableCard checked={checked} onChange={onChange} label={label} warnings={item.warnings}>
      <PreviewTitle name={r.name} badge="Recette" />
      <PreviewMeta>
        {r.servings} portion{r.servings > 1 ? 's' : ''} · {fmtMinutes(r.prepMinutes + r.cookMinutes)} ·{' '}
        {r.ingredients.length} ingrédients · {r.steps.length} étapes
      </PreviewMeta>
      {nutrition ? (
        <span className="mt-1 block text-body-strong tabular-nums">
          {macroLine(nutrition.perServing)}
          <span className="text-caption font-medium text-ink-muted"> par portion</span>
        </span>
      ) : null}
      {nutrition && nutrition.missing.length > 0 ? (
        <span className="mt-1 flex gap-1.5 text-caption text-warning">
          <AlertTriangle size={16} strokeWidth={1.75} aria-hidden="true" className="mt-px shrink-0" />
          <span>Sans données : {nutrition.missing.join(', ')}.</span>
        </span>
      ) : null}
    </SelectableCard>
  )
}

/** Repas reçu, à ajouter au journal. */
export function MealPreviewCard({
  item,
  checked,
  onChange,
}: {
  item: Item<'meal'>
  checked: boolean
  onChange: (on: boolean) => void
}) {
  const meal = item.meal
  return (
    <SelectableCard
      checked={checked}
      onChange={onChange}
      label={`Ajouter le repas ${meal.name} au journal`}
      warnings={item.warnings}
    >
      <PreviewTitle
        name={meal.name}
        badge="Repas"
        extra={
          meal.estimated ? (
            <Badge>
              <AlertTriangle size={14} strokeWidth={1.75} aria-hidden="true" className="mr-1 text-warning" />
              Estimé
            </Badge>
          ) : null
        }
      />
      <PreviewMeta>
        {SLOT_LABEL[meal.slot]} · {formatDateFr(meal.date)}
      </PreviewMeta>
      <span className="mt-1 block text-body-strong tabular-nums">{macroLine(roundMacros(meal.totals))}</span>
    </SelectableCard>
  )
}

/** Élément d'un type inconnu : montré, jamais appliqué. */
export function UnsupportedPreviewCard({ item }: { item: Item<'unsupported'> }) {
  return (
    <Card>
      <p className="m-0 text-body-strong">
        Élément {item.index + 1} : <span className="font-mono text-caption">{item.type}</span>
      </p>
      <p className="m-0 mt-1 text-caption text-ink-muted">{item.message}</p>
      <p className="m-0 mt-1 text-caption text-ink-muted">Ignoré.</p>
    </Card>
  )
}

/** Élément qui n'a pas passé la validation : ses erreurs sont listées, il ne peut pas être coché. */
export function InvalidPreviewCard({ item }: { item: Item<'invalid'> }) {
  return (
    <Card className="ring-2 ring-critical">
      <p className="m-0 text-body-strong text-critical">Élément {item.index + 1} invalide</p>
      <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
        {item.errors.map((e, i) => (
          <li key={i} className="text-caption">
            {e}
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Bloc « Aperçu » : titre, décompte, puis une carte par élément (`<li>` fournis par l'appelant via `renderItem`). */
export function PreviewSection({
  id,
  items,
  renderItem,
}: {
  id: string
  items: readonly ImportPreviewItem[]
  renderItem: (item: ImportPreviewItem) => ReactNode
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div>
        <h2 id={id} className="m-0 font-display text-title">
          Aperçu
        </h2>
        <p className="m-0 mt-1 text-caption text-ink-muted">
          {items.length} élément{items.length > 1 ? 's' : ''} trouvé{items.length > 1 ? 's' : ''}. Décoche ce
          que tu ne veux pas garder.
        </p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {items.map((item) => {
          const node = renderItem(item)
          return node === null ? null : <li key={item.index}>{node}</li>
        })}
      </ul>
    </section>
  )
}
