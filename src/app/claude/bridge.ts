// Pont vers Claude (J9) : choix de l'URL à ouvrir. Fonction pure, partagée par la feuille d'aperçu et l'écran « Recette d'une vidéo ».
import { isAllowedCoachUrl } from '../../domain/claude/coachUrl'
import { CLAUDE_DEFAULT_URL } from '../../types/claude'

/** URL du Projet Coach si elle est autorisée, sinon l'URL par défaut : une valeur venue d'ailleurs n'ouvre jamais un autre site. */
export function resolveCoachUrl(coachUrl: string | null): string {
  return coachUrl !== null && isAllowedCoachUrl(coachUrl) ? coachUrl : CLAUDE_DEFAULT_URL
}
