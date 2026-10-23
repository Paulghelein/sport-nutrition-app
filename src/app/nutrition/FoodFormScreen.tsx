import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { checkFoodInput, createFood, updateFood } from '../../db'
import { normalizeEan } from '../../domain/nutrition'
import type { Food, FoodInput } from '../../types'
import { errorMessage, parseDecimal, toInputNumber } from '../../ui'
import { Button, Card, buttonClass } from '../../ui/kit'
import { DecimalField, TextField } from '../../ui/kit/Fields'
import { Note } from '../../ui/kit/Note'
import { SCAN_PATH, foodPath } from '../routes'
import { allowedReturn, returnTarget } from './formReturn'
import { BackLink } from '../../ui/kit/BackLink'
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
  packageG: string
  ean: string
}

const num = (n: number | undefined): string => (n === undefined ? '' : toInputNumber(n))

/** Valeurs de départ d'une création (venant du scan : EAN, nom et marque du produit). */
interface Prefill {
  name: string
  brand: string
  ean: string
  packageG: string
}

/** Contenance venue de l'URL (scan) : gardée seulement si c'est un entier > 0. */
function prefillPackage(raw: string | null): string {
  const n = raw === null ? Number.NaN : Math.round(Number(raw))
  return Number.isFinite(n) && n > 0 ? String(n) : ''
}

function toDraft(food: Food | undefined, pre: Prefill): Draft {
  return {
    name: food?.name ?? pre.name,
    brand: food?.brand ?? pre.brand,
    ean: food?.ean ?? pre.ean,
    kcal: num(food?.per100g.kcal),
    protein: num(food?.per100g.protein),
    carbs: num(food?.per100g.carbs),
    fat: num(food?.per100g.fat),
    fiber: num(food?.per100g.fiber),
    portion: num(food?.defaultPortionG),
    packageG: food ? num(food.packageG === undefined ? undefined : Math.round(food.packageG)) : pre.packageG,
  }
}

type Parsed = { ok: true; input: FoodInput } | { ok: false; error: string }

function parseDraft(d: Draft, aisle: Food['aisle'], hadEan: boolean): Parsed {
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
  const packageG = d.packageG.trim() === '' ? undefined : parseDecimal(d.packageG)
  if (Number.isNaN(fiber) || Number.isNaN(portion)) {
    return { ok: false, error: 'Les fibres et la portion doivent être des nombres (ou rester vides).' }
  }
  if (packageG !== undefined && Number.isNaN(packageG)) {
    return { ok: false, error: 'La contenance du paquet doit être un nombre de grammes (ou rester vide).' }
  }
  const rawEan = d.ean.trim()
  const ean = rawEan === '' ? '' : normalizeEan(rawEan)
  if (ean === null) {
    return {
      ok: false,
      error: 'Code-barres invalide : 8, 12 ou 13 chiffres, clé de contrôle comprise (ou laisse vide).',
    }
  }
  const input: FoodInput = { name: d.name, per100g: { kcal, protein, carbs, fat } }
  if (ean !== '' || hadEan) input.ean = ean
  if (d.brand.trim() !== '') input.brand = d.brand
  if (fiber !== undefined) input.per100g.fiber = fiber
  if (portion !== undefined) input.defaultPortionG = portion
  if (aisle !== undefined) input.aisle = aisle
  if (packageG !== undefined) input.packageG = packageG
  const message = checkFoodInput(input)
  return message === null ? { ok: true, input } : { ok: false, error: message }
}

function FoodForm({
  food,
  prefill,
  origin,
  returnPath,
}: {
  food: Food | undefined
  prefill: Prefill
  origin: string | null
  /** Écran d'origine autorisé (liste blanche) : l'aliment créé lui est rendu. */
  returnPath: string | null
}) {
  const goBack = useGoBack()
  const navigate = useNavigate()
  const { search, addPath } = useAddContext()
  const [draft, setDraft] = useState(() => toDraft(food, prefill))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (key: keyof Draft) => (value: string) => setDraft((d) => ({ ...d, [key]: value }))
  const fromAdd = search !== ''
  const fromScan = !food && prefill.ean !== ''
  const scanPath = `${SCAN_PATH}${search}`

  const save = async () => {
    const parsed = parseDraft(draft, food?.aisle, food?.ean !== undefined)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (food) {
        await updateFood(food, parsed.input)
        goBack(`${foodPath(food.id)}${search}`)
      } else {
        const created = await createFood(parsed.input)
        // Venu de l'écran Ajouter : on y revient (sans doublon d'historique) avec le nouvel aliment cherché ;
        // les ajouts déjà faits sont conservés (sessionStorage de l'écran Ajouter).
        if (returnPath !== null) {
          navigate(returnTarget(returnPath, created.id), { replace: true })
        } else if (fromScan) {
          // Retour au scan : l'aliment créé passe directement à la quantité, puis au journal.
          navigate(`${scanPath}${search ? '&' : '?'}ajout=${encodeURIComponent(created.id)}`, {
            replace: true,
          })
        } else if (fromAdd) {
          setSearchSeed(created.name)
          goBack(`${addPath}&q=${encodeURIComponent(created.name)}`)
        } else {
          goBack(foodPath(created.id))
        }
      }
    } catch (e) {
      setError(errorMessage(e, 'Impossible d’enregistrer. Réessaie.'))
      setBusy(false)
    }
  }

  const cancelTo =
    returnPath !== null && !food
      ? returnTarget(returnPath)
      : food
        ? `${foodPath(food.id)}${search}`
        : fromScan
          ? scanPath
          : addPath

  return (
    <div className="flex flex-col gap-3.5">
      <BackLink to={cancelTo}>Retour</BackLink>
      <h1 className="m-0 font-display text-display-l">{food ? 'Modifier l’aliment' : 'Créer un aliment'}</h1>
      {fromScan ? (
        <p className="m-0 text-body text-ink-muted">
          {origin === 'incomplete'
            ? 'Open Food Facts connaît ce produit mais sans toutes les valeurs. Complète-les depuis l’emballage.'
            : 'Ce produit n’est pas dans Open Food Facts. Recopie les valeurs depuis l’emballage (pour 100 g).'}
        </p>
      ) : null}
      {food?.source === 'ciqual' ? (
        <p className="m-0 text-body text-ink-muted">
          Tes changements créent une version à toi de cet aliment ; tu pourras rétablir l’original.
        </p>
      ) : null}
      <form
        className="flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Card padding="large" className="flex flex-col gap-4">
          <TextField
            label="Nom"
            value={draft.name}
            onChange={set('name')}
            maxLength={120}
            autoComplete="off"
          />
          <TextField
            label="Marque (facultatif)"
            value={draft.brand}
            onChange={set('brand')}
            autoComplete="off"
          />
          <TextField
            label="Code-barres (facultatif)"
            value={draft.ean}
            onChange={set('ean')}
            inputMode="numeric"
            pattern="[0-9 ]*"
            autoComplete="off"
            hint="Permet de retrouver cet aliment en le scannant."
          />
          <p className="m-0 text-body-strong">Valeurs pour 100 g</p>
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
          <DecimalField
            label="Contenance du paquet (facultatif)"
            value={draft.packageG}
            onChange={set('packageG')}
            unit="g"
            hint="Poids du paquet entier : permet d’ajouter « paquet entier » en un geste."
          />
        </Card>
        {error ? <Note tone="error">{error}</Note> : null}
        <Button type="submit" fullWidth disabled={busy}>
          Enregistrer
        </Button>
        <Link to={cancelTo} className={buttonClass('secondary', 'normal', true)}>
          Annuler
        </Link>
      </form>
    </div>
  )
}

export default function FoodFormScreen() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { addPath } = useAddContext()
  const { data, loading } = useFood(id)
  if (id === undefined)
    return (
      <FoodForm
        food={undefined}
        prefill={{
          name: params.get('nom') ?? '',
          brand: params.get('marque') ?? '',
          ean: params.get('ean') ?? '',
          packageG: prefillPackage(params.get('paquet')),
        }}
        origin={params.get('origine')}
        returnPath={allowedReturn(params.get('retour'))}
      />
    )
  if (!data && loading) return <div aria-busy="true" className="min-h-40" />
  if (!data) {
    return (
      <div className="flex flex-col gap-3.5">
        <BackLink to={addPath}>Ajouter</BackLink>
        <h1 className="m-0 font-display text-display-l">Aliment introuvable</h1>
      </div>
    )
  }
  return (
    <FoodForm
      key={data.id}
      food={data}
      prefill={{ name: '', brand: '', ean: '', packageG: '' }}
      origin={null}
      returnPath={null}
    />
  )
}
