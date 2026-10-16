import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CIQUAL_ATTRIBUTION } from '../../content/foods/version'
import { deleteFood, getCiqualFood, getFoodRow, restoreCiqualFood, setFoodFavorite } from '../../db'
import { isCiqualOverrideModified, mergeFoods } from '../../domain/nutrition'
import { Button, Card, ConfirmSheet, ErrorNote, errorMessage, linkButtonClass, useLiveQuery } from '../../ui'
import { fmtG, fmtInt } from './format'
import { BackLink } from './parts'
import { useAddContext, useGoBack } from './navContext'

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-hi px-3 py-2.5">
      <dt className="text-sm text-zinc-400">{label}</dt>
      <dd className="m-0 mt-0.5 text-xl font-bold tabular-nums">{value}</dd>
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
      <>
        <BackLink to={addPath}>Ajouter</BackLink>
        {loading ? null : (
          <>
            <h1 className="mt-2 text-2xl font-bold">Aliment introuvable</h1>
            <p className="mt-2 text-base text-zinc-300">Il a peut-être été supprimé.</p>
          </>
        )}
      </>
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
    <>
      <BackLink to={addPath}>Ajouter</BackLink>
      <h1 className="mt-2 text-2xl font-bold leading-tight">{food.name}</h1>
      <p className="mt-1 text-base text-zinc-400">
        {food.brand ? `${food.brand} · ` : ''}
        {sourceLabel}
        {modified ? ' · modifié' : ''}
      </p>
      {food.ean ? <p className="mt-1 text-base text-zinc-400">Code-barres : {food.ean}</p> : null}
      {food.source === 'off' ? (
        <p className="mt-1 text-sm text-zinc-400">Données Open Food Facts (ODbL)</p>
      ) : null}

      <Card className="mt-5">
        <h2 className="text-lg font-bold">Pour 100 g</h2>
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

      {error ? (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-2">
        <Button
          variant="secondary"
          aria-pressed={food.favorite}
          disabled={busy}
          onClick={() => void run(async () => void (await setFoodFavorite(food, !food.favorite)))}
        >
          {food.favorite ? '★ Retirer des favoris' : '☆ Mettre en favori'}
        </Button>
        <Link
          to={`/nutrition/aliments/${food.id}/modifier${search}`}
          className={linkButtonClass('secondary')}
        >
          Modifier
        </Link>
        {modified ? (
          <Button variant="secondary" disabled={busy} onClick={() => setConfirm('restore')}>
            Rétablir l’original
          </Button>
        ) : null}
        {food.source !== 'ciqual' ? (
          <Button variant="danger" disabled={busy} onClick={() => setConfirm('delete')}>
            Supprimer
          </Button>
        ) : null}
      </div>

      {food.source === 'ciqual' ? <p className="mt-6 text-sm text-zinc-400">{CIQUAL_ATTRIBUTION}</p> : null}

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
    </>
  )
}
