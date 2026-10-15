// Génère src/content/foods/ciqual.json et version.ts depuis la table Ciqual de l'Anses.
//
//   npm run ciqual              télécharge (ou réutilise le cache .cache/ciqual) puis génère
//   npm run ciqual -- --refresh retélécharge même si le cache existe
//
// Source : dépôt officiel de la table sur recherche.data.gouv.fr (DOI 10.57745/RDMHWY), version la plus récente.
// Licence Ouverte Etalab 2.0. Le build de l'app ne télécharge rien : le JSON généré est versionné.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDataset, serializeDataset } from './ciqual-parse.mjs'

/** À incrémenter quand ce script change la sortie pour une même table source (force le rechargement en base). */
const SCRIPT_REVISION = 2
const DOI = 'doi:10.57745/RDMHWY'
const API = 'https://entrepot.recherche.data.gouv.fr/api'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(root, '.cache', 'ciqual')
const outDir = join(root, 'src', 'content', 'foods')
const refresh = process.argv.includes('--refresh')

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`)
  return res.json()
}

async function ensureFiles() {
  const names = {
    alim: /^alim_\d{4}_\d{2}_\d{2}\.xml$/,
    grp: /^alim_grp_\d{4}_\d{2}_\d{2}\.xml$/,
    compo: /^compo_\d{4}_\d{2}_\d{2}\.xml$/,
  }
  const metaPath = join(cacheDir, 'meta.json')
  if (!refresh && existsSync(metaPath)) {
    const meta = JSON.parse(await readFile(metaPath, 'utf8'))
    if (Object.values(meta.files).every((f) => existsSync(join(cacheDir, f)))) {
      console.log(`Cache utilisé (${cacheDir}), --refresh pour retélécharger.`)
      return meta
    }
  }
  await mkdir(cacheDir, { recursive: true })
  const data = (await getJson(`${API}/datasets/:persistentId/?persistentId=${DOI}`)).data.latestVersion
  const files = {}
  for (const [key, re] of Object.entries(names)) {
    const f = data.files.find((x) => re.test(x.dataFile.filename))
    if (!f) throw new Error(`Fichier ${key} introuvable dans ${DOI}`)
    const { id, filename } = f.dataFile
    console.log(`Téléchargement de ${filename}...`)
    const res = await fetch(`${API}/access/datafile/${id}`)
    if (!res.ok) throw new Error(`${filename} : HTTP ${res.status}`)
    await writeFile(join(cacheDir, filename), Buffer.from(await res.arrayBuffer()))
    files[key] = filename
  }
  const meta = { doi: DOI, files }
  await writeFile(metaPath, JSON.stringify(meta, null, 2))
  return meta
}

const meta = await ensureFiles()
const read = (f) => readFile(join(cacheDir, f), 'utf8')
const year = /alim_(\d{4})_/.exec(meta.files.alim)?.[1]
if (!year) throw new Error('Année de la table introuvable')
const version = `${year}-r${SCRIPT_REVISION}`

const ds = buildDataset({
  alimXml: await read(meta.files.alim),
  grpXml: await read(meta.files.grp),
  compoXml: await read(meta.files.compo),
  version,
})

await mkdir(outDir, { recursive: true })
const json = serializeDataset(ds)
await writeFile(join(outDir, 'ciqual.json'), json)
await writeFile(
  join(outDir, 'version.ts'),
  `// Généré par scripts/ciqual.mjs, ne pas modifier à la main.
// Version du jeu Ciqual embarqué : léger, chargé au démarrage pour savoir s'il faut recharger ciqual.json.

export const CIQUAL_VERSION = '${version}'

/** Mention à afficher dans l'app (Licence Ouverte Etalab 2.0). */
export const CIQUAL_ATTRIBUTION =
  'Source : Anses, Table de composition nutritionnelle des aliments Ciqual ${year} (Licence Ouverte Etalab 2.0)'
`,
)
console.log(
  `${ds.foods.length} aliments, ${ds.groups.length} groupes, ${(json.length / 1024).toFixed(0)} kio -> ${outDir}`,
)
