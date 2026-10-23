import { describe, expect, it } from 'vitest'
import { extractVideoLink } from './videoLink'

const url = (t: string): string | null => extractVideoLink(t)?.url ?? null

describe('extractVideoLink : textes collés réels', () => {
  it('TikTok : légende multiligne, émojis, hashtags, lien en dernière ligne', () => {
    const t =
      'Poulet crémeux 🍗🔥 trop bon !\n#recette #prisedemasse #fyp\n\nhttps://vm.tiktok.com/ZGdAbCdEf/\n'
    expect(extractVideoLink(t)).toEqual({ url: 'https://vm.tiktok.com/ZGdAbCdEf/', platform: 'tiktok' })
  })
  it('TikTok : lien long avec paramètres de partage', () => {
    const t =
      'https://www.tiktok.com/@chef.fr/video/7301234567890123456?_r=1&_t=8abcDEF&is_from_webapp=1&sender_device=pc&web_id=123&share_item_id=7301'
    expect(url(t)).toBe('https://www.tiktok.com/@chef.fr/video/7301234567890123456')
  })
  it('Instagram : « légende + lien » et lien en markdown', () => {
    expect(url('Regarde ça https://www.instagram.com/reel/C8abc123/?igsh=MWxyz== merci')).toBe(
      'https://www.instagram.com/reel/C8abc123/',
    )
    expect(url('[la vidéo](https://www.instagram.com/p/Cabc/?utm_source=ig_web_copy_link)')).toBe(
      'https://www.instagram.com/p/Cabc/',
    )
  })
  it('YouTube : watch, list et t conservés, si/feature retirés', () => {
    expect(url('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&t=42s&feature=shared&si=abc')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&t=42s',
    )
    expect(extractVideoLink('https://m.youtube.com/shorts/abc?feature=share')).toEqual({
      url: 'https://m.youtube.com/shorts/abc',
      platform: 'youtube',
    })
  })
  it('plusieurs liens : le premier seulement', () => {
    expect(url('https://www.tiktok.com/@a/video/1 et aussi https://www.youtube.com/watch?v=2')).toBe(
      'https://www.tiktok.com/@a/video/1',
    )
  })
  it('lien entre parenthèses, crochets, guillemets typographiques, ponctuation finale', () => {
    expect(url('(https://youtu.be/abc)')).toBe('https://youtu.be/abc')
    expect(url('[https://youtu.be/abc]')).toBe('https://youtu.be/abc')
    expect(url('« https://youtu.be/abc »')).toBe('https://youtu.be/abc')
    expect(url('voir https://youtu.be/abc !!!')).toBe('https://youtu.be/abc')
    expect(url('voir https://youtu.be/abc…')).toBe('https://youtu.be/abc')
    expect(url('"https://youtu.be/abc",')).toBe('https://youtu.be/abc')
  })
  it('retours à la ligne et tabulations coupent le lien', () => {
    expect(url('https://youtu.be/abc\nhttps://autre.com')).toBe('https://youtu.be/abc')
    expect(url('https://youtu.be/abc\r\nsuite')).toBe('https://youtu.be/abc')
    expect(url('https://youtu.be/abc\tsuite')).toBe('https://youtu.be/abc')
  })
  it('schéma et hôte en majuscules', () => {
    expect(extractVideoLink('HTTPS://WWW.TIKTOK.COM/@A/video/1')).toEqual({
      url: 'https://www.tiktok.com/@A/video/1',
      platform: 'tiktok',
    })
  })
  it('caractères unicode : chemin accentué, texte unicode autour', () => {
    const r = extractVideoLink('Crêpes à la façon de Zoë 🥞 https://www.tiktok.com/@zoë/video/1?q=crêpe')
    expect(r?.platform).toBe('tiktok')
    expect(r?.url.startsWith('https://www.tiktok.com/')).toBe(true)
    expect(r?.url).not.toMatch(/\s/)
  })
  it('paramètre de pistage en majuscules ou répété', () => {
    expect(url('https://example.com/a?UTM_Source=x&id=1')).toBe('https://example.com/a?id=1')
    expect(url('https://example.com/a?igsh=1&igsh=2&id=1')).toBe('https://example.com/a?id=1')
  })
  it('que du pistage : pas de « ? » résiduel ; fragment supprimé', () => {
    expect(url('https://www.instagram.com/reel/x/?igsh=a&utm_medium=b')).toBe(
      'https://www.instagram.com/reel/x/',
    )
    expect(url('https://example.com/a#section')).toBe('https://example.com/a')
  })
  it('un paramètre inconnu survit', () => {
    expect(url('https://example.com/a?foo=bar&utm_campaign=z&v=1')).toBe('https://example.com/a?foo=bar&v=1')
  })
})

describe('extractVideoLink : liens hostiles', () => {
  it.each([
    ['javascript:alert(1)'],
    ['JavaScript:alert(document.cookie)'],
    ['data:text/html;base64,PHNjcmlwdD4='],
    ['http://www.tiktok.com/x'],
    ['ftp://example.com/x'],
    ['file:///etc/passwd'],
    ['https://user@tiktok.com/x'],
    ['https://user:pw@tiktok.com/x'],
    ['https://127.0.0.1/x'],
    ['https://8.8.8.8/x'],
    ['https://2130706433/x'],
    ['https://0x7f.1/x'],
    ['https://127.1/x'],
    ['https://[::1]/x'],
    ['https://[2001:db8::1]/x'],
    ['https://localhost/x'],
    ['https://localhost:3000/x'],
    ['https://intranet/x'],
    ['https:///x'],
    ['https://'],
  ])('refuse %s', (t) => {
    expect(extractVideoLink(t)).toBeNull()
  })
  it('longueur : 500 caractères acceptés au plus, pas de troncature', () => {
    const prefix = 'https://example.com/'
    expect(extractVideoLink(prefix + 'a'.repeat(500 - prefix.length))?.url).toHaveLength(500)
    expect(extractVideoLink(prefix + 'a'.repeat(501 - prefix.length))).toBeNull()
  })
  it('la longueur est mesurée après nettoyage du pistage', () => {
    expect(url(`https://example.com/a?utm_source=${'x'.repeat(600)}`)).toBe('https://example.com/a')
  })
  it('IDN : converti en punycode, jamais de caractères non ASCII dans l’hôte', () => {
    const r = extractVideoLink('https://tikτok.com/x')
    expect(r?.platform).toBe('other')
    expect(r?.url).toMatch(/^https:\/\/xn--[a-z0-9-]+\.com\/x$/)
  })
  it('homoglyphes et sous-domaines trompeurs : plateforme « other »', () => {
    expect(extractVideoLink('https://tiktok.com.evil.io/x')?.platform).toBe('other')
    expect(extractVideoLink('https://evil.io/tiktok.com')?.platform).toBe('other')
    expect(extractVideoLink('https://evil.io/?u=youtube.com')?.platform).toBe('other')
    expect(extractVideoLink('https://youtube.com.evil.io@x.com/')).toBeNull()
  })
  it('caractères dangereux (<, >, guillemets, espace) ne sortent jamais dans l’URL', () => {
    const r = extractVideoLink('https://example.com/a"onclick=alert(1)')
    expect(r?.url).toBe('https://example.com/a')
    expect(url('https://example.com/<script>')).toBe('https://example.com/')
  })
  it('« http: » seul avec https plus loin : seul le https est pris', () => {
    expect(url('http://evil.io/x puis https://youtu.be/ok')).toBe('https://youtu.be/ok')
  })
})

describe('extractVideoLink : robustesse', () => {
  it('hôte avec point final : retiré avant les contrôles', () => {
    expect(extractVideoLink('https://localhost./x')).toBeNull()
    expect(extractVideoLink('https://www.tiktok.com./x')?.platform).toBe('tiktok')
  })
  it('premier lien refusé : le suivant valide est pris', () => {
    expect(url('https://localhost/x puis https://user@a.com/y puis https://youtu.be/ok')).toBe(
      'https://youtu.be/ok',
    )
  })
  it('query non pistée conservée telle quelle (pas de réencodage)', () => {
    expect(url('https://example.com/a?q=a%20b+c&utm_source=x&k=')).toBe('https://example.com/a?q=a%20b+c&k=')
  })
})
