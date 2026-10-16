import { describe, expect, it, vi } from 'vitest'
import { multiLensRank, pickMultiLensDevice, setTorch, tuneTrack } from './cameraSetup'

const dev = (label: string, deviceId = label, kind: MediaDeviceKind = 'videoinput') =>
  ({ label, deviceId, kind, groupId: '', toJSON: () => ({}) }) as MediaDeviceInfo

describe('pickMultiLensDevice', () => {
  it('reconnaît les libellés anglais et français', () => {
    expect(pickMultiLensDevice([dev('Back Triple Camera')])?.deviceId).toBe('Back Triple Camera')
    expect(pickMultiLensDevice([dev('Back Dual Camera')])).not.toBeNull()
    expect(pickMultiLensDevice([dev('Caméra double arrière')])).not.toBeNull()
    expect(pickMultiLensDevice([dev('Caméra triple arrière')])).not.toBeNull()
    expect(pickMultiLensDevice([dev('Caméra arrière triple')])).not.toBeNull()
    expect(pickMultiLensDevice([dev('Caméra arrière double grand angle')])).not.toBeNull()
    expect(multiLensRank('Dual Camera')).toBeNull()
  })
  it('exclut les caméras avant et les simples', () => {
    expect(multiLensRank('Front Dual Camera')).toBeNull()
    expect(multiLensRank('Caméra double avant')).toBeNull()
    expect(pickMultiLensDevice([dev('Back Camera'), dev('Front Camera')])).toBeNull()
    expect(pickMultiLensDevice([dev('Back Triple Camera', 'x', 'audioinput')])).toBeNull()
  })
  it('préfère triple > dual wide > dual', () => {
    const list = [dev('Back Dual Camera'), dev('Back Dual Wide Camera'), dev('Back Triple Camera')]
    expect(pickMultiLensDevice(list)?.label).toBe('Back Triple Camera')
    expect(pickMultiLensDevice(list.slice(0, 2))?.label).toBe('Back Dual Wide Camera')
    expect(
      pickMultiLensDevice([dev('Caméra arrière double grand angle'), dev('Back Dual Camera')])?.label,
    ).toBe('Caméra arrière double grand angle')
  })
  it('aucun candidat : null', () => {
    expect(pickMultiLensDevice([])).toBeNull()
  })
})

const track = (caps: unknown, apply = vi.fn().mockResolvedValue(undefined)) =>
  ({ getCapabilities: () => caps, applyConstraints: apply }) as unknown as MediaStreamTrack

describe('tuneTrack', () => {
  it('un seul appel : mise au point continue et zoom 2×', async () => {
    const apply = vi.fn().mockResolvedValue(undefined)
    const kept = await tuneTrack(
      track({ focusMode: ['manual', 'continuous'], zoom: { min: 1, max: 5 } }, apply),
    )
    expect(apply).toHaveBeenCalledTimes(1)
    expect(apply).toHaveBeenCalledWith({ advanced: [{ focusMode: 'continuous' }, { zoom: 2 }] })
    expect(kept).toEqual([{ focusMode: 'continuous' }, { zoom: 2 }])
  })
  it('zoom ramené dans la plage', async () => {
    const apply = vi.fn().mockResolvedValue(undefined)
    await tuneTrack(track({ zoom: { min: 1, max: 1.5 } }, apply))
    expect(apply).toHaveBeenCalledWith({ advanced: [{ zoom: 1.5 }] })
    const apply2 = vi.fn().mockResolvedValue(undefined)
    await tuneTrack(track({ zoom: { min: 3, max: 8 } }, apply2))
    expect(apply2).toHaveBeenCalledWith({ advanced: [{ zoom: 3 }] })
  })
  it('rien sans capacité', async () => {
    const none = vi.fn()
    expect(await tuneTrack(track({}, none))).toEqual([])
    expect(none).not.toHaveBeenCalled()
  })
  it('appel combiné refusé : chaque réglage est retenté seul', async () => {
    const apply = vi
      .fn()
      .mockRejectedValueOnce(new Error('x'))
      .mockRejectedValueOnce(new Error('focus refusé'))
      .mockResolvedValueOnce(undefined)
    const kept = await tuneTrack(track({ focusMode: ['continuous'], zoom: { min: 1, max: 3 } }, apply))
    expect(apply).toHaveBeenCalledTimes(3)
    expect(kept).toEqual([{ zoom: 2 }])
  })
  it('ne lève jamais', async () => {
    const apply = vi.fn().mockRejectedValue(new Error('refusé'))
    await expect(
      tuneTrack(track({ focusMode: ['continuous'], zoom: { min: 1, max: 3 } }, apply)),
    ).resolves.toEqual([])
    const broken = {
      getCapabilities: () => {
        throw new Error('x')
      },
    } as unknown as MediaStreamTrack
    await expect(tuneTrack(broken)).resolves.toEqual([])
    await expect(tuneTrack({} as MediaStreamTrack)).resolves.toEqual([])
  })
})

describe('setTorch', () => {
  it('renvoie les réglages avec la lampe', async () => {
    const apply = vi.fn().mockResolvedValue(undefined)
    await setTorch(track({}, apply), true, [{ zoom: 2 } as MediaTrackConstraintSet])
    expect(apply).toHaveBeenCalledWith({ advanced: [{ zoom: 2 }, { torch: true }] })
  })
})
