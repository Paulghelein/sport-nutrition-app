import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useBarcodeCamera } from './useBarcodeCamera'

const zx = vi.hoisted(() => ({
  stop: vi.fn(),
  decode: vi.fn(),
  streams: [] as unknown[],
  failNext: false,
  resolve: undefined as undefined | ((c: { stop: () => void }) => void),
  onResult: undefined as undefined | ((r: { getText: () => string } | null) => void),
}))

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatOneDReader: class {
    decodeFromStream(stream: unknown, _video: unknown, cb: (r: { getText: () => string } | null) => void) {
      zx.onResult = cb
      zx.streams.push(stream)
      if (zx.failNext) {
        zx.failNext = false
        return Promise.reject(new Error('décodage impossible'))
      }
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

interface FakeTrack {
  label: string
  deviceId: string
  readyState: string
  stop: ReturnType<typeof vi.fn>
}
const makeStream = (label: string, deviceId: string) => {
  const t: FakeTrack = { label, deviceId, readyState: 'live', stop: vi.fn() }
  t.stop.mockImplementation(() => {
    t.readyState = 'ended'
  })
  const track = {
    ...t,
    get readyState() {
      return t.readyState
    },
    stop: t.stop,
    getSettings: () => ({ deviceId }),
    getCapabilities: () => ({ torch: true }),
    applyConstraints: vi.fn().mockResolvedValue(undefined),
  }
  return { track, getTracks: () => [track], getVideoTracks: () => [track] }
}
const gum = vi.fn()
const enumerate = vi.fn()
const TRIPLE = dev('Back Triple Camera', 'triple')
function dev(label: string, deviceId: string) {
  return { label, deviceId, kind: 'videoinput' }
}

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
  zx.streams.length = 0
  zx.failNext = false
  localStorage.clear()
  gum.mockReset()
  enumerate.mockReset()
  gum.mockImplementation(() => Promise.resolve(makeStream('Back Camera', 'wide')))
  enumerate.mockResolvedValue([dev('Back Camera', 'wide')])
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: gum, enumerateDevices: enumerate },
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

  it('demande la haute définition et la caméra arrière', async () => {
    render()
    await openStream(1)
    expect(gum).toHaveBeenCalledWith({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    })
  })

  it('bascule sur l’appareil multi-objectifs, arrête la première piste et mémorise l’id', async () => {
    const first = makeStream('Back Camera', 'wide')
    const second = makeStream('Back Triple Camera', 'triple')
    gum.mockResolvedValueOnce(first).mockResolvedValueOnce(second)
    enumerate.mockResolvedValue([dev('Back Camera', 'wide'), TRIPLE])
    render()
    await openStream(1)
    expect(first.track.stop).toHaveBeenCalled()
    expect(gum).toHaveBeenCalledTimes(2)
    expect(gum.mock.calls[1]?.[0].video.deviceId).toEqual({ exact: 'triple' })
    expect(zx.streams[0]).toBe(second)
    expect(second.track.stop).not.toHaveBeenCalled()
    expect(localStorage.getItem('scan.cameraDeviceId')).toBe('triple')
  })

  it('annulation pendant la bascule : aucune piste ne reste ouverte', async () => {
    const first = makeStream('Back Camera', 'wide')
    const second = makeStream('Back Triple Camera', 'triple')
    let release: (s: unknown) => void = () => undefined
    gum.mockResolvedValueOnce(first).mockImplementationOnce(() => new Promise((r) => (release = r)))
    enumerate.mockResolvedValue([TRIPLE])
    const { unmount } = render()
    await waitFor(() => expect(gum).toHaveBeenCalledTimes(2))
    unmount()
    await act(async () => {
      release(second)
    })
    expect(first.track.stop).toHaveBeenCalled()
    expect(second.track.stop).toHaveBeenCalled()
    expect(zx.decode).not.toHaveBeenCalled()
  })

  it('id mémorisé en échec : oublié, retour à la caméra arrière', async () => {
    localStorage.setItem('scan.cameraDeviceId', 'old')
    const fallback = makeStream('Back Camera', 'wide')
    gum
      .mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'OverconstrainedError' }))
      .mockResolvedValueOnce(fallback)
    render()
    await openStream(1)
    expect(gum.mock.calls[0]?.[0].video.deviceId).toEqual({ exact: 'old' })
    expect(gum.mock.calls[1]?.[0].video.facingMode).toEqual({ ideal: 'environment' })
    expect(localStorage.getItem('scan.cameraDeviceId')).toBeNull()
    expect(zx.streams[0]).toBe(fallback)
  })

  it('la lampe passe par la piste', async () => {
    const { result } = render()
    await openStream(1)
    expect(result.current.torchAvailable).toBe(true)
    await act(async () => {
      await result.current.toggleTorch()
    })
    expect(result.current.torchOn).toBe(true)
  })

  it('la lampe renvoie les réglages de piste avec torch', async () => {
    const st = makeStream('Back Camera', 'wide')
    st.track.getCapabilities = () => ({ torch: true, focusMode: ['continuous'] }) as never
    gum.mockResolvedValueOnce(st)
    const { result } = render()
    await openStream(1)
    await act(async () => {
      await result.current.toggleTorch()
    })
    expect(st.track.applyConstraints).toHaveBeenLastCalledWith({
      advanced: [{ focusMode: 'continuous' }, { torch: true }],
    })
  })

  it('enumerateDevices en échec : la première piste est gardée', async () => {
    const first = makeStream('Back Camera', 'wide')
    gum.mockResolvedValueOnce(first)
    enumerate.mockRejectedValue(new Error('x'))
    render()
    await openStream(1)
    expect(gum).toHaveBeenCalledTimes(1)
    expect(zx.streams[0]).toBe(first)
    expect(first.track.stop).not.toHaveBeenCalled()
  })

  it('piste déjà sur l’appareil choisi : pas de réouverture', async () => {
    const first = makeStream('Back Camera', 'triple')
    gum.mockResolvedValueOnce(first)
    enumerate.mockResolvedValue([TRIPLE])
    render()
    await openStream(1)
    expect(gum).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('scan.cameraDeviceId')).toBe('triple')
  })

  it('appareil choisi en échec : repli facingMode, une seule piste ouverte', async () => {
    const first = makeStream('Back Camera', 'wide')
    const fallback = makeStream('Back Camera', 'wide')
    gum
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'AbortError' }))
      .mockResolvedValueOnce(fallback)
    enumerate.mockResolvedValue([TRIPLE])
    render()
    await openStream(1)
    expect(first.track.stop).toHaveBeenCalled()
    expect(zx.streams[0]).toBe(fallback)
    expect(fallback.track.stop).not.toHaveBeenCalled()
    expect(localStorage.getItem('scan.cameraDeviceId')).toBeNull()
  })

  it('refus à la seconde ouverture : permission_denied, rien d’ouvert', async () => {
    const first = makeStream('Back Camera', 'wide')
    gum
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotAllowedError' }))
    enumerate.mockResolvedValue([TRIPLE])
    const { onError } = render()
    await waitFor(() => expect(onError).toHaveBeenCalledWith('permission_denied'))
    expect(first.track.stop).toHaveBeenCalled()
    expect(zx.decode).not.toHaveBeenCalled()
  })

  it('decodeFromStream en échec : la piste est arrêtée', async () => {
    const st = makeStream('Back Camera', 'wide')
    gum.mockResolvedValueOnce(st)
    zx.failNext = true
    const { onError } = render()
    await waitFor(() => expect(onError).toHaveBeenCalled())
    expect(st.track.stop).toHaveBeenCalled()
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
