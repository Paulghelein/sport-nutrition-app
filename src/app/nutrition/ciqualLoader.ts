// Chargement de la base Ciqual dans Dexie (SPEC §4.4). Le JSON (~270 kB) n'est lu que par `import()` dynamique,
// et seulement quand la version stockée diffère de celle embarquée.
import { CIQUAL_VERSION } from '../../content/foods/version'
import { countCiqualFoods, getCiqualVersion, replaceCiqual } from '../../db'
import { ciqualDatasetToFoods } from '../../domain/nutrition'
import type { CiqualDataset } from '../../types'

let inFlight: Promise<void> | null = null

async function load(): Promise<void> {
  if ((await getCiqualVersion()) === CIQUAL_VERSION && (await countCiqualFoods()) > 0) return
  const module = await import('../../content/foods/ciqual.json')
  const dataset = (module.default ?? module) as unknown as CiqualDataset
  await replaceCiqual(CIQUAL_VERSION, ciqualDatasetToFoods(dataset))
}

/**
 * Garantit que la table Ciqual correspond à la version embarquée. Une seule exécution à la fois (promesse
 * partagée) ; une fois terminée, un nouvel appel revérifie simplement la version (utile après une restauration).
 * Les erreurs sont remontées, et un nouvel appel réessaie.
 */
export function ensureCiqualLoaded(): Promise<void> {
  if (inFlight) return inFlight
  const run = load().finally(() => {
    inFlight = null
  })
  inFlight = run
  return run
}
