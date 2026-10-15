import { describe, expect, it } from 'vitest'
import { buildDataset, decodeXml, parseTeneur, serializeDataset } from '../../../scripts/ciqual-parse.mjs'

describe('parseTeneur', () => {
  it('nombres à virgule française', () => {
    expect(parseTeneur(' 12,5 ')).toBe(12.5)
    expect(parseTeneur('274')).toBe(274)
    expect(parseTeneur('0')).toBe(0)
  })
  it('traces -> 0', () => expect(parseTeneur(' traces ')).toBe(0))
  it('< x -> x / 2 (entité XML comprise)', () => {
    expect(parseTeneur('&lt; 0,5')).toBe(0.25)
    expect(parseTeneur('< 20')).toBe(10)
    expect(parseTeneur('&lt; 0,01')).toBe(0.005)
  })
  it('- , vide, null, texte -> null', () => {
    expect(parseTeneur(' - ')).toBeNull()
    expect(parseTeneur('')).toBeNull()
    expect(parseTeneur(null)).toBeNull()
    expect(parseTeneur('n/a')).toBeNull()
  })
})

describe('decodeXml', () => {
  it('entités nommées et numériques', () => {
    expect(decodeXml('a &amp; b &apos;c&apos; &#233; &#xE9;')).toBe("a & b 'c' é é")
  })
})

const alim = (code: string, name: string, grp = '04') => `
  <ALIM><alim_code> ${code} </alim_code><alim_nom_fr> ${name} </alim_nom_fr><alim_grp_code> ${grp} </alim_grp_code></ALIM>`
const compo = (code: string, c: string, t: string) =>
  `<COMPO><alim_code> ${code} </alim_code><const_code> ${c} </const_code><teneur> ${t} </teneur></COMPO>`

describe('buildDataset', () => {
  const grpXml = `<ALIM_GRP><alim_grp_code> 04 </alim_grp_code><alim_grp_nom_fr> viandes, oeufs, poissons </alim_grp_nom_fr></ALIM_GRP>
    <ALIM_GRP><alim_grp_code> 06 </alim_grp_code><alim_grp_nom_fr> eaux </alim_grp_nom_fr></ALIM_GRP>
    <ALIM_GRP><alim_grp_code> 02 </alim_grp_code><alim_grp_nom_fr> fruits </alim_grp_nom_fr></ALIM_GRP>`
  const alimXml = [
    alim('2', 'Poulet,  filet cru'),
    alim('1', 'Eau &amp; sel', '02'),
    alim('3', 'Inconnu sans données'),
    alim('4', 'Sans énergie mais macros'),
    alim('5', 'Rien de rien'),
    alim('6', 'Calvados'),
    alim('7', 'Sel', '10'),
    alim('8', 'Eau minérale', '06'),
  ].join('')
  const compoXml = [
    compo('2', '328', '110'),
    compo('2', '25003', '23,4'),
    compo('2', '31000', '-'),
    compo('2', '40000', '&lt; 2'),
    compo('2', '34100', 'traces'),
    compo('1', '328', '0'),
    compo('1', '25003', '-'),
    compo('1', '31000', '&lt; 0,5'),
    compo('1', '40000', '0'),
    compo('1', '34100', '-'),
    compo('1', '999', '5'),
    compo('4', '25003', '10'),
    compo('4', '31000', '20'),
    compo('4', '40000', '5'),
    compo('6', '25003', '0'),
    compo('6', '31000', '0'),
    compo('6', '40000', '0'),
    compo('6', '60000', '30'),
    compo('7', '328', '0'),
    compo('7', '25003', '0'),
    compo('7', '31000', '0'),
    compo('7', '40000', '0'),
    compo('8', '328', '0'),
    compo('8', '25003', '0'),
    compo('8', '31000', '0'),
    compo('8', '40000', '0'),
    compo('5', '328', '-'),
    compo('5', '25003', '-'),
  ].join('')
  const ds = buildDataset({ alimXml, grpXml, compoXml, version: '2025-r1' })

  it('groupes triés par code, noms capitalisés', () => {
    expect(ds.groups).toEqual(['Fruits', 'Viandes, oeufs, poissons', 'Eaux'])
    expect(ds.version).toBe('2025-r1')
  })
  it('lignes triées par code, valeurs arrondies, absentes -> 0, fibres absentes -> null', () => {
    expect(ds.foods).toEqual([
      ['1', 'Eau & sel', 0, 0, 0, 0.3, 0, null], // < 0,5 -> 0,25 -> 0,3
      ['2', 'Poulet, filet cru', 1, 110, 23.4, 0, 1, 0], // < 2 -> 1 ; traces -> 0 ; « - » glucides -> 0
      ['4', 'Sans énergie mais macros', 1, 4 * 10 + 4 * 20 + 9 * 5, 10, 20, 5, null], // Atwater
      ['6', 'Calvados', 1, 210, 0, 0, 0, null], // alcool 30 g × 7 kcal
      ['8', 'Eau minérale', 2, 0, 0, 0, 0, null], // eaux conservées à 0 kcal
    ])
  })
  it('omet les aliments sans énergie ni macros exploitables', () => {
    const codes = ds.foods.map((r) => r[0])
    expect(codes).not.toContain('3')
    expect(codes).not.toContain('5')
    expect(codes).not.toContain('7') // sel : tout à 0, hors groupe boissons
  })
  it('sérialisation : JSON valide, une ligne par aliment', () => {
    const s = serializeDataset(ds)
    expect(JSON.parse(s)).toEqual(ds)
    expect(s.split('\n').length).toBe(ds.foods.length + 3)
  })
})
