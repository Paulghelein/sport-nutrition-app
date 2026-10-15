import type { CiqualDataset } from '../src/types/nutrition'

export const CONST: Record<string, string>
export function decodeXml(s: string): string
export function parseTeneur(raw: string | null | undefined): number | null
export function parseGroups(grpXml: string): Map<string, string>
export function parseCompo(compoXml: string): Map<string, Map<string, number | null>>
export function buildDataset(src: {
  alimXml: string
  grpXml: string
  compoXml: string
  version: string
}): CiqualDataset
export function serializeDataset(ds: CiqualDataset): string
