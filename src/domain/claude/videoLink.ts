// F5 : extraction du lien d'une vidéo (TikTok, Reels, Shorts…) dans le texte collé. Fonction pure, sans réseau :
// l'app n'ouvre jamais le lien, elle le transmet seulement à Claude dans le message.
import type { VideoLink, VideoPlatform } from '../../types/claude'

/** Longueur maximale du lien nettoyé (au-delà : refusé, pas tronqué). */
export const VIDEO_URL_MAX_LENGTH = 500

/** Ponctuation qu'un texte copié colle souvent à la fin d'un lien. */
const TRAILING = /[.,;:!?)\]}>»"'…]+$/

/**
 * Paramètres de pistage retirés (aucun n'identifie la vidéo). Liste fermée plus les `utm_*` : on ne retire jamais
 * un paramètre inconnu (YouTube `v`, `list`, `t` doivent survivre).
 */
const TRACKING_PARAMS = new Set([
  '_t', '_r', '_d', 'igsh', 'igshid', 'si', 'fbclid', 'gclid', 'is_from_webapp', 'sender_device', 'sender_web_id',
  'share_app_id', 'share_link_id', 'share_item_id', 'tt_from', 'u_code', 'user_id', 'sec_user_id', 'social_share_type',
  'sharer_language', 'checksum', 'web_id', 'timestamp', 'refer', 'preview_pb', 'feature', 'pp',
])

const isTracking = (name: string): boolean => name.startsWith('utm_') || TRACKING_PARAMS.has(name)

function platformOf(hostname: string): VideoPlatform {
  const is = (domain: string): boolean => hostname === domain || hostname.endsWith(`.${domain}`)
  if (is('tiktok.com')) return 'tiktok'
  if (is('instagram.com') || is('instagr.am')) return 'instagram'
  if (is('youtube.com') || is('youtu.be')) return 'youtube'
  return 'other'
}

/**
 * Premier lien `https://` VALIDE du texte (les refusés sont sautés) (TikTok copie « légende + lien »), sans ponctuation finale ni pistage, ou `null`.
 * Refuse : `http:` (le texte doit contenir un `https://`), identifiants `user:pass@`, hôte sans point ou IP/localhost
 * (un lien de vidéo public a un nom de domaine), lien nettoyé de plus de 500 caractères. `javascript:` et `data:`
 * ne peuvent pas sortir : seule la forme `https://…` est cherchée. Le fragment (`#…`) est supprimé.
 */
export function extractVideoLink(text: string): VideoLink | null {
  for (const match of text.matchAll(/https:\/\/[^\s<>"'`]+/gi)) {
    const link = cleanCandidate(match[0].replace(TRAILING, ''))
    if (link !== null) return link
  }
  return null
}

function cleanCandidate(raw: string): VideoLink | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return null
  const host = url.hostname.toLowerCase().replace(/\.+$/, '')
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.startsWith('[')) return null
  // Segments bruts de la query filtrés tels quels : les paramètres conservés ne sont pas réencodés.
  const kept = url.search
    .slice(1)
    .split('&')
    .filter((seg) => seg !== '' && !isTracking(decodeSafe(seg.split('=')[0] ?? '').toLowerCase()))
  url.search = kept.join('&')
  url.hash = ''
  const clean = url.toString().replace(/\?$/, '')
  if (clean.length > VIDEO_URL_MAX_LENGTH) return null
  return { url: clean, platform: platformOf(host) }
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
