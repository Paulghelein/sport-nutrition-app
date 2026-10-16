// URL du Projet Claude « Coach » (J9) : règle unique, appliquée à la saisie, à l'import de sauvegarde et à l'ouverture.

/** `https://claude.ai/…` ou un sous-domaine de claude.ai. Refuse tout autre schéma ou domaine (`claude.ai.evil.com`). */
export function isAllowedCoachUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    return u.protocol === 'https:' && (host === 'claude.ai' || host.endsWith('.claude.ai'))
  } catch {
    return false
  }
}
