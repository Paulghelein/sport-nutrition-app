import { MAX_RECIPE_SERVINGS, MAX_SERVING_UNIT_LENGTH } from '../../domain/nutrition/limits'
import { Button } from '../../ui/kit'
import { TextField } from '../../ui/kit/Fields'
import { Sheet } from '../../ui/kit/Sheet'
import { Stepper } from '../../ui/kit/Stepper'

/** Réglages du résultat : nombre de portions, unité libre (« muffins »), portions mises au frigo. */
export function ServingsSheet({
  servings,
  unit,
  fridge,
  onServings,
  onUnit,
  onFridge,
  onClose,
}: {
  servings: number
  unit: string
  fridge: number
  onServings: (n: number) => void
  onUnit: (unit: string) => void
  onFridge: (n: number) => void
  onClose: () => void
}) {
  return (
    <Sheet title="Portions" description="Combien ça donne, et combien vont au frigo" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Stepper label="Ça donne" value={servings} onChange={onServings} min={1} max={MAX_RECIPE_SERVINGS} />
        <TextField
          label="Unité"
          value={unit}
          onChange={onUnit}
          maxLength={MAX_SERVING_UNIT_LENGTH}
          placeholder="portions"
          autoComplete="off"
          hint="Ce que tu comptes : muffins, parts, boîtes… Vide = portions."
        />
        <Stepper label="Portions au frigo" value={fridge} onChange={onFridge} min={0} max={servings} />
        <Button fullWidth onClick={onClose}>
          Terminé
        </Button>
      </div>
    </Sheet>
  )
}
