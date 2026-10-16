// Anciennes routes de la v1 -> nouvelles routes (DESIGN.md §3). Fonction pure, testée dans tests/shell.test.ts.

const OLD_ROOT = '/seance'
const OLD_GUIDED = '/seance/en-cours'

/**
 * Nouvelle adresse (chemin + query + hash) pour un ancien chemin, ou `null` si le chemin n'est pas un ancien chemin.
 * `/seance` -> `/entrainement` ; `/seance/en-cours` -> `/entrainement/seance` ; `/seance/x/y?z` -> `/entrainement/x/y?z`.
 */
export function legacyRedirect(pathname: string, search = '', hash = ''): string | null {
  let target: string
  if (pathname === OLD_GUIDED || pathname.startsWith(`${OLD_GUIDED}/`)) {
    target = `/entrainement/seance${pathname.slice(OLD_GUIDED.length)}`
  } else if (pathname === OLD_ROOT || pathname.startsWith(`${OLD_ROOT}/`)) {
    target = `/entrainement${pathname.slice(OLD_ROOT.length)}`
  } else {
    return null
  }
  return `${target}${search}${hash}`
}
