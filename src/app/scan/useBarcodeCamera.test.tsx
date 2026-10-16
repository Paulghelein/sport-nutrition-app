import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBarcodeCamera } from './useBarcodeCamera'

const zx = vi.hoisted(() => ({
  stop: vi.fn(),
  decode: vi.fn(),
  resolve: undefined as undefined | ((c: { stop: () => void }) => void),
  onResult: undefined as undefined | ((r: { getText: () => string } | null) => void),
}))

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatOneDReader: class {
    decodeFromConstraints(
      _constraints: unknown,
      _video: unknown,
      cb: (r: { getText: () => string } | null) => void,
    ) {
      zx.onResult = cb
      zx.decode()
      return new Promise((resolve) => {
        zx.resolve = resolve as (c: { stop: () => void }) => void
      })
    }
  },
}))
vi.mock('@zxing/library', () => ({
  BarcodeFormat: { EAN_13: 1, EAN_8: 2, UPC_A: 3 },
  DecodeHintType: { POSSIBLE_FORMATS: 1 },
}))

const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

const render = (active = true) => {
  const onCode = vi.fn()
  const onError = vi.fn()
  const video = { current: null }
  const hook = renderHook(({ on }) => useBarcodeCamera(video, on, onCode, onError), {
    initialProps: { on: active },
  })
  return { ...hook, onCode, onError }
}

/** Le flux s'ouvre : la promesse de `decodeFromConstraints` est résolue avec des contrôles factices. */
async function openStream(calls: number) {
  await waitFor(() => expect(zx.decode).toHaveBeenCalledTimes(calls))
  await act(async () => {
    zx.resolve?.({ stop: zx.stop })
  })
}

beforeEach(() => {
  zx.stop.mockClear()
  zx.decode.mockClear()
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn() },
    configurable: true,
  })
  setVisibility('visible')
})
afterEach(() => {
  cleanup()
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
})

describe('useBarcodeCamera', () => {
  it('coupe le flux au démontage', async () => {
    const { unmount } = render()
    await openStream(1)
    expect(zx.stop).not.toHaveBeenCalled()
    unmount()
    expect(zx.stop).toHaveBeenCalledTimes(1)
  })

  it('coupe le flux quand active passe à faux, et le rouvre ensuite', async () => {
    const { rerender, result } = render()
    await openStream(1)
    expect(result.current.starting).toBe(false)
    rerender({ on: false })
    expect(zx.stop).toHaveBeenCalledTimes(1)
    expect(result.current.running).toBe(false)
    rerender({ on: true })
    await openStream(2)
  })

  it('coupe le flux en arrière-plan et le rouvre au retour', async () => {
    render()
    await openStream(1)
    setVisibility('hidden')
    expect(zx.stop).toHaveBeenCalledTimes(1)
    setVisibility('visible')
    await openStream(2)
  })

  it('annulation avant la résolution de decodeFromConstraints : le flux ouvert après coup est coupé', async () => {
    const { unmount } = render()
    await waitFor(() => expect(zx.decode).toHaveBeenCalledTimes(1))
    unmount()
    expect(zx.stop).not.toHaveBeenCalled()
    await act(async () => {
      zx.resolve?.({ stop: zx.stop })
    })
    expect(zx.stop).toHaveBeenCalledTimes(1)
  })

  it('un même code lu deux fois de suite n’est transmis qu’une fois ; un code invalide est ignoré', async () => {
    const { onCode } = render()
    await openStream(1)
    const read = (text: string) => zx.onResult?.({ getText: () => text })
    read('3017620422003')
    read('3017620422003')
    read('1234567890123')
    read('5449000000996')
    expect(onCode.mock.calls.map((c) => c[0])).toEqual(['3017620422003', '5449000000996'])
  })

  it('caméra absente : erreur transmise, aucun flux', () => {
    Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true })
    const { onError } = render()
    expect(onError).toHaveBeenCalledWith('unsupported')
    expect(zx.decode).not.toHaveBeenCalled()
  })
})
