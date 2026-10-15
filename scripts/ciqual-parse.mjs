// Conversion des fichiers XML Ciqual (Anses) en `CiqualDataset` compact. Fonctions pures, sans réseau ni disque.
// Testé par src/domain/nutrition/ciqual-script.test.ts.

/** Codes des constituants Ciqual (alim_const). */
export const CONST = {
  kcal: '328', // Energie, Règlement UE N° 1169/2011 (kcal/100 g)
  kcalJones: '333', // repli : N x facteur Jones, avec fibres (kcal/100 g)
  protein: '25003', // Protéines, N x 6.25
  proteinJones: '25000', // repli : N x facteur de Jones
  carbs: '31000',
  fat: '40000',
  fiber: '34100',
  alcohol: '60000', // Alcool (éthanol) g/100 g, 7 kcal/g dans le repli Atwater
}

/** Groupe « Eaux et autres boissons » : conservé même à 0 kcal. */
const WATER_GROUP = '06'

const ENTITIES = { lt: '<', gt: '>', amp: '&', apos: "'", quot: '"' }

export function decodeXml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}

/**
 * Valeur de teneur Ciqual → nombre, ou `null` si absente.
 * « 12,5 » → 12.5 ; « traces » → 0 ; « < 0,5 » → 0.25 (moitié du seuil) ; « - » ou vide → null.
 */
export function parseTeneur(raw) {
  if (raw == null) return null
  const s = decodeXml(String(raw)).trim().toLowerCase()
  if (s === '' || s === '-') return null
  if (s === 'traces' || s === 'trace') return 0
  const m = /^([<>]?)\s*(\d+(?:[.,]\d+)?)$/.exec(s)
  if (!m) return null
  const n = Number(m[2].replace(',', '.'))
  if (!Number.isFinite(n)) return null
  return m[1] === '<' ? n / 2 : n
}

const round1 = (n) => Math.round(n * 10) / 10

function tag(block, name) {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block)
  return m ? decodeXml(m[1]).trim() : null
}

function* blocks(xml, name) {
  const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'g')
  let m
  while ((m = re.exec(xml)) !== null) yield m[1]
}

const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)
const cleanName = (s) => s.replace(/\s+/g, ' ').trim()

/** Groupes : code (2 chiffres) → nom français, première lettre en majuscule. */
export function parseGroups(grpXml) {
  const map = new Map()
  for (const b of blocks(grpXml, 'ALIM_GRP')) {
    const code = tag(b, 'alim_grp_code')
    const nom = tag(b, 'alim_grp_nom_fr')
    if (code && nom && !map.has(code)) map.set(code, capitalize(cleanName(nom)))
  }
  return map
}

/** Teneurs retenues par aliment : Map<alim_code, Map<const_code, number|null>> (constituants utiles seulement). */
export function parseCompo(compoXml) {
  const wanted = new Set(Object.values(CONST))
  const out = new Map()
  for (const b of blocks(compoXml, 'COMPO')) {
    const c = tag(b, 'const_code')
    if (c === null || !wanted.has(c)) continue
    const a = tag(b, 'alim_code')
    if (a === null) continue
    let m = out.get(a)
    if (!m) out.set(a, (m = new Map()))
    m.set(c, parseTeneur(tag(b, 'teneur')))
  }
  return out
}

/**
 * Construit le dataset. kcal = énergie UE 1169/2011 ; repli Jones ; repli Atwater (4P + 4G + 9L + 7 alcool) si les trois macros sont
 * connues. Macro absente (« - ») → 0 si l'énergie est connue ; sans énergie ni macro exploitable, l'aliment est omis.
 * Fibres absentes → null.
 * @param {{ alimXml: string, grpXml: string, compoXml: string, version: string }} src
 */
export function buildDataset({ alimXml, grpXml, compoXml, version }) {
  const grpNames = parseGroups(grpXml)
  const compo = parseCompo(compoXml)
  const groupIndex = new Map() // code → index dans `groups` (ordre d'apparition trié ensuite)
  const rows = []
  const usedGroups = new Set()
  const pending = []
  for (const b of blocks(alimXml, 'ALIM')) {
    const code = tag(b, 'alim_code')
    const nameRaw = tag(b, 'alim_nom_fr')
    const grp = tag(b, 'alim_grp_code')
    if (!code || !nameRaw || !grp) continue
    const c = compo.get(code)
    if (!c) continue
    const protein = c.get(CONST.protein) ?? c.get(CONST.proteinJones) ?? null
    const carbs = c.get(CONST.carbs) ?? null
    const fat = c.get(CONST.fat) ?? null
    let kcal = c.get(CONST.kcal) ?? c.get(CONST.kcalJones) ?? null
    if (kcal === null && protein !== null && carbs !== null && fat !== null) {
      kcal = 4 * protein + 4 * carbs + 9 * fat + 7 * (c.get(CONST.alcohol) ?? 0)
    }
    if (kcal === null) continue
    // Un aliment entièrement à 0 n'apporte rien (sel, alcool évaporé...) : omis, sauf eaux et boissons (groupe 06),
    // que l'utilisateur peut vouloir journaliser.
    const allZero = kcal === 0 && !protein && !carbs && !fat
    if (allZero && grp !== WATER_GROUP) continue
    pending.push({
      code,
      name: cleanName(nameRaw),
      grp,
      row: [kcal, protein ?? 0, carbs ?? 0, fat ?? 0, c.get(CONST.fiber) ?? null],
    })
    usedGroups.add(grp)
  }
  const codes = [...usedGroups].sort()
  codes.forEach((g, i) => groupIndex.set(g, i))
  for (const p of pending) {
    const [kcal, protein, carbs, fat, fiber] = p.row
    rows.push([
      p.code,
      p.name,
      groupIndex.get(p.grp),
      round1(kcal),
      round1(protein),
      round1(carbs),
      round1(fat),
      fiber === null ? null : round1(fiber),
    ])
  }
  rows.sort((a, b) => Number(a[0]) - Number(b[0]))
  return { version, groups: codes.map((g) => grpNames.get(g) ?? 'Autres'), foods: rows }
}

/** Sérialisation compacte : une ligne par aliment (diffs lisibles). */
export function serializeDataset(ds) {
  return `{"version":${JSON.stringify(ds.version)},"groups":${JSON.stringify(ds.groups)},"foods":[\n${ds.foods
    .map((r) => JSON.stringify(r))
    .join(',\n')}\n]}\n`
}
