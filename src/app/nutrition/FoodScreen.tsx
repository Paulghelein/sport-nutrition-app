import { Star } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CIQUAL_ATTRIBUTION } from '../../content/foods/version'
import { deleteFood, getCiqualFood, getFoodRow, restoreCiqualFood, setFoodFavorite } from '../../db'
import { isCiqualOverrideModified, mergeFoods } from '../../domain/nutrition'
import { errorMessage, useLiveQuery } from '../../ui'
import { Button, Card, buttonClass } from '../../ui/kit'
import { ConfirmSheet } from '../../ui/kit/ConfirmSheet'
import { Note } from '../../ui/kit/Note'
import { editFoodPath } from '../routes'
import { fmtG, fmtInt } from './format'
import { BackLink } from '../../ui/kit/BackLink'
import { useAddContext, useGoBack } from './navContext'

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-ds-md bg-canvas px-3 py-2.5">
      <dt className="text-caption text-ink-muted">{label}</dt>
      <dd className="m-0 mt-0.5 font-display text-title tabular-nums">{value}</dd>
    </div>
  )
}

export default function FoodScreen() {
  const { id } = useParams()
  const { search, addPath } = useAddContext()
  const goBack = useGoBack()
  const { data, loading } = useLiveQuery(async () => {
    if (!id) return undefined
    const [row, ciqual] = await Promise.all([getFoodRow(id), getCiqualFood(id)])
    const original = ciqual ? mergeFoods([ciqual], [])[0] : undefined
    const food = row ?? original
    return food ? { food, ciqual, group: ciqual?.group } : undefined
  }, [id])
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'delete' | 'restore' | null>(null)
  const [busy, setBusy] = useState(false)

  if (!data) {
    return (
      <div className="flex flex-col gap-3.5">
        <BackLink to={addPath}>Ajouter</BackLink>
        {loading ? null : (
          <>
            <h1 className="m-0 font-display text-display-l">Aliment introuvable</h1>
            <p className="m-0 text-body text-ink-muted">Il a peut-être été supprimé.</p>
          </>
        )}
      </div>
    )
  }

  const { food, ciqual, group } = data
  const modified = food.source === 'ciqual' && ciqual !== undefined && isCiqualOverrideModified(food, ciqual)

  const run = async (fn: () => Promise<void>, after?: () => void) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setConfirm(null)
      after?.()
    } catch (e) {
      setConfirm(null)
      setError(errorMessage(e, 'Opération impossible. Réessaie.'))
    } finally {
      setBusy(false)
    }
  }

  const restore = () =>
    // Une seule transaction ; le favori n'est pas une valeur nutritionnelle : il est conservé.
    run(() => restoreCiqualFood(food.id, { keepFavorite: true }))

  const per = food.per100g
  const sourceLabel =
    food.source === 'ciqual'
      ? (group ?? 'Ciqual')
      : food.source === 'off'
        ? 'Open Food Facts'
        : 'Aliment personnalisé'

  return (
    <div className="flex flex-col gap-3.5">
      <BackLink to={addPath}>Ajouter</BackLink>
      <header className="flex flex-col gap-1">
        <h1 className="m-0 font-display text-display-l">{food.name}</h1>
        <p className="m-0 text-body text-ink-muted">
          {food.brand ? `${food.brand} · ` : ''}
          {sourceLabel}
          {modified ? ' · modifié' : ''}
        </p>
        {food.ean ? <p className="m-0 text-body text-ink-muted">Code-barres : {food.ean}</p> : null}
        {food.source === 'off' ? (
          <p className="m-0 text-caption text-ink-muted">Données Open Food Facts (ODbL)</p>
        ) : null}
      </header>

      <Card padding="large" aria-labelledby="food-per100">
        <h2 id="food-per100" className="m-0 font-display text-title">
          Pour 100 g
        </h2>
        <dl className="m-0 mt-3 grid grid-cols-2 gap-2">
          <Fact label="Calories" value={`${fmtInt(per.kcal)} kcal`} />
          <Fact label="Protéines" value={`${fmtG(per.protein)} g`} />
          <Fact label="Glucides" value={`${fmtG(per.carbs)} g`} />
          <Fact label="Lipides" value={`${fmtG(per.fat)} g`} />
          {per.fiber !== undefined ? <Fact label="Fibres" value={`${fmtG(per.fiber)} g`} /> : null}
          {food.defaultPortionG !== undefined ? (
            <Fact label="Portion habituelle" value={`${fmtG(food.defaultPortionG)} g`} />
          ) : null}
        </dl>
      </Card>

      {error ? <Note tone="error">{error}</Note> : null}

      <div className="flex flex-col gap-2">
        <Button
          variant="secondary"
          fullWidth
          icon={
            <Star
              size={20}
              strokeWidth={1.75}
              aria-hidden="true"
              className={food.favorite ? 'fill-ember' : ''}
            />
          }
          aria-pressed={food.favorite}
          disabled={busy}
          onClick={() => void run(async () => void (await setFoodFavorite(food, !food.favorite)))}
        >
          {food.favorite ? 'Retirer des favoris' : 'Mettre en favori'}
        </Button>
        <Link to={`${editFoodPath(food.id)}${search}`} className={buttonClass('secondary', 'normal', true)}>
          Modifier
        </Link>
        {modified ? (
          <Button variant="secondary" fullWidth disabled={busy} onClick={() => setConfirm('restore')}>
            Rétablir l’original
          </Button>
        ) : null}
        {food.source !== 'ciqual' ? (
          <Button variant="danger" fullWidth disabled={busy} onClick={() => setConfirm('delete')}>
            Supprimer
          </Button>
        ) : null}
      </div>

      {food.source === 'ciqual' ? (
        <p className="m-0 text-caption text-ink-muted">{CIQUAL_ATTRIBUTION}</p>
      ) : null}

      {confirm === 'delete' ? (
        <ConfirmSheet
          title="Supprimer cet aliment ?"
          message="Les entrées déjà enregistrées dans ton journal gardent leurs valeurs."
          confirmLabel="Supprimer"
          busy={busy}
          onConfirm={() =>
            void run(
              () => deleteFood(food),
              () => goBack(addPath),
            )
          }
          onCancel={() => setConfirm(null)}
        />
      ) : null}
      {confirm === 'restore' ? (
        <ConfirmSheet
          title="Rétablir l’original ?"
          message="Tes modifications de cet aliment seront perdues. Le journal garde ses valeurs."
          confirmLabel="Rétablir"
          danger={false}
          busy={busy}
          onConfirm={() => void restore()}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </div>
  )
}
