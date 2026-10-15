import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { checkFoodInput, createFood, updateFood } from '../../db'
import type { Food, FoodInput } from '../../types'
import {
  Button,
  DecimalField,
  ErrorNote,
  TextField,
  errorMessage,
  linkButtonClass,
  parseDecimal,
  toInputNumber,
} from '../../ui'
import { BackLink } from './parts'
import { setSearchSeed, useAddContext, useGoBack } from './navContext'
import { useFood } from './useFoods'

interface Draft {
  name: string
  brand: string
  kcal: string
  protein: string
  carbs: string
  fat: string
  fiber: string
  portion: string
}

const num = (n: number | undefined): string => (n === undefined ? '' : toInputNumber(n))

function toDraft(food: Food | undefined, name: string): Draft {
  return {
    name: food?.name ?? name,
    brand: food?.brand ?? '',
    kcal: num(food?.per100g.kcal),
    protein: num(food?.per100g.protein),
    carbs: num(food?.per100g.carbs),
    fat: num(food?.per100g.fat),
    fiber: num(food?.per100g.fiber),
    portion: num(food?.defaultPortionG),
  }
}

type Parsed = { ok: true; input: FoodInput } | { ok: false; error: string }

function parseDraft(d: Draft, aisle: Food['aisle']): Parsed {
  const required = (text: string): number => (text.trim() === '' ? Number.NaN : parseDecimal(text))
  const kcal = required(d.kcal)
  const protein = required(d.protein)
  const carbs = required(d.carbs)
  const fat = required(d.fat)
  if ([kcal, protein, carbs, fat].some(Number.isNaN)) {
    return {
      ok: false,
      error: 'Renseigne les calories, protéines, glucides et lipides (des nombres, 0 si aucun).',
    }
  }
  const fiber = d.fiber.trim() === '' ? undefined : parseDecimal(d.fiber)
  const portion = d.portion.trim() === '' ? undefined : parseDecimal(d.portion)
  if (Number.isNaN(fiber) || Number.isNaN(portion)) {
    return { ok: false, error: 'Les fibres et la portion doivent être des nombres (ou rester vides).' }
  }
  const input: FoodInput = { name: d.name, per100g: { kcal, protein, carbs, fat } }
  if (d.brand.trim() !== '') input.brand = d.brand
  if (fiber !== undefined) input.per100g.fiber = fiber
  if (portion !== undefined) input.defaultPortionG = portion
  if (aisle !== undefined) input.aisle = aisle
  const message = checkFoodInput(input)
  return message === null ? { ok: true, input } : { ok: false, error: message }
}

function FoodForm({ food, initialName }: { food: Food | undefined; initialName: string }) {
  const goBack = useGoBack()
  const { search, addPath } = useAddContext()
  const [draft, setDraft] = useState(() => toDraft(food, initialName))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (key: keyof Draft) => (value: string) => setDraft((d) => ({ ...d, [key]: value }))
  const fromAdd = search !== ''

  const save = async () => {
    const parsed = parseDraft(draft, food?.aisle)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (food) {
        await updateFood(food, parsed.input)
        goBack(`/nutrition/aliments/${food.id}${search}`)
      } else {
        const created = await createFood(parsed.input)
        // Venu de l'écran Ajouter : on y revient (sans doublon d'historique) avec le nouvel aliment cherché ;
        // les ajouts déjà faits sont conservés (sessionStorage de l'écran Ajouter).
        if (fromAdd) {
          setSearchSeed(created.name)
          goBack(`${addPath}&q=${encodeURIComponent(created.name)}`)
        } else {
          goBack(`/nutrition/aliments/${created.id}`)
        }
      }
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’enregistrer. Réessaie.'))
      setBusy(false)
    }
  }

  const cancelTo = food ? `/nutrition/aliments/${food.id}${search}` : addPath

  return (
    <>
      <BackLink to={cancelTo}>Retour</BackLink>
      <h1 className="mt-1 text-2xl font-bold">{food ? 'Modifier l’aliment' : 'Créer un aliment'}</h1>
      {food?.source === 'ciqual' ? (
        <p className="mt-2 text-base text-zinc-300">
          Tes changements créent une version à toi de cet aliment ; tu pourras rétablir l’original.
        </p>
      ) : null}
      <form
        className="mt-5 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <TextField label="Nom" value={draft.name} onChange={set('name')} maxLength={120} autoComplete="off" />
        <TextField
          label="Marque (facultatif)"
          value={draft.brand}
          onChange={set('brand')}
          autoComplete="off"
        />
        <p className="-mb-2 text-base font-semibold text-zinc-200">Valeurs pour 100 g</p>
        <DecimalField label="Calories" value={draft.kcal} onChange={set('kcal')} unit="kcal" />
        <div className="grid grid-cols-3 gap-2">
          <DecimalField label="Protéines" value={draft.protein} onChange={set('protein')} unit="g" />
          <DecimalField label="Glucides" value={draft.carbs} onChange={set('carbs')} unit="g" />
          <DecimalField label="Lipides" value={draft.fat} onChange={set('fat')} unit="g" />
        </div>
        <DecimalField label="Fibres (facultatif)" value={draft.fiber} onChange={set('fiber')} unit="g" />
        <DecimalField
          label="Portion habituelle (facultatif)"
          value={draft.portion}
          onChange={set('portion')}
          unit="g"
          hint="Proposée en raccourci quand tu ajoutes cet aliment."
        />
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button type="submit" disabled={busy}>
          Enregistrer
        </Button>
        <Link to={cancelTo} className={linkButtonClass('secondary')}>
          Annuler
        </Link>
      </form>
    </>
  )
}

export default function FoodFormScreen() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { addPath } = useAddContext()
  const { data, loading } = useFood(id)
  if (id === undefined) return <FoodForm food={undefined} initialName={params.get('nom') ?? ''} />
  if (!data && loading) return <div aria-busy="true" className="min-h-40" />
  if (!data) {
    return (
      <>
        <BackLink to={addPath}>Ajouter</BackLink>
        <h1 className="mt-2 text-2xl font-bold">Aliment introuvable</h1>
      </>
    )
  }
  return <FoodForm key={data.id} food={data} initialName="" />
}
