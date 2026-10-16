import { describe, expect, it } from 'vitest'
import { INVALID_LINK_MESSAGE, linkState, pasteOutcome } from './videoFlow'

const TIKTOK = 'https://www.tiktok.com/@chef/video/7312345678901234567?is_from_webapp=1&sender_device=pc'

describe('linkState', () => {
  it('vide, invalide, valide', () => {
    expect(linkState('  ')).toEqual({ status: 'empty' })
    expect(linkState('http://exemple.com/x')).toEqual({ status: 'invalid' })
    expect(linkState(`Regarde ça ${TIKTOK}`)).toEqual({
      status: 'ok',
      link: { url: 'https://www.tiktok.com/@chef/video/7312345678901234567', platform: 'tiktok' },
    })
  })
})

describe('pasteOutcome', () => {
  it('lecture réussie avec lien : pas de zone ni de message', () => {
    expect(pasteOutcome({ ok: true, text: TIKTOK })).toMatchObject({
      showArea: false,
      notice: null,
      text: TIKTOK,
    })
  })
  it('lecture réussie sans lien : zone visible et message', () => {
    expect(pasteOutcome({ ok: true, text: 'bonjour' })).toEqual({
      text: 'bonjour',
      showArea: true,
      notice: INVALID_LINK_MESSAGE,
    })
  })
  it('échecs : zone visible avec un message propre à chaque cas', () => {
    const msgs = (['unavailable', 'denied', 'empty'] as const).map((reason) => {
      const o = pasteOutcome({ ok: false, reason })
      expect(o.showArea).toBe(true)
      expect(o.text).toBeNull()
      return o.notice
    })
    expect(new Set(msgs).size).toBe(3)
  })
})
