import type { DecodeHintType } from '@zxing/library'
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { normalizeEan } from '../../domain/nutrition/off'
import type { Ean, ScanErrorKind } from '../../types'
import {
  deviceConstraints,
  facingConstraints,
  isDeviceGone,
  multiLensRank,
  pickMultiLensDevice,
  readRememberedDevice,
  rememberDevice,
  setTorch,
  supportsTorch,
  tuneTrack,
} from './cameraSetup'
import { classifyCameraError, createScanGate } from './scanLogic'

interface Controls {
  stop: () => void | Promise<void>
}

export interface BarcodeCamera {
  /** Le flux est demandé (actif et app au premier plan). */
  running: boolean
  /** Ouverture de la caméra en cours. */
  starting: boolean
  torchAvailable: boolean
  torchOn: boolean
  toggleTorch: () => Promise<void>
}

/**
 * Cycle de vie de la lecture EAN-13 / EAN-8 / UPC-A (@zxing chargé à la demande, chunk séparé), partagé par
 * `CameraView` et la caméra en bandeau de « Recette par scan ». Le flux est coupé quand `active` passe à faux, au
 * démontage et quand l'app passe en arrière-plan ; un même code n'est accepté qu'une fois par fenêtre de 3 s.
 */
export function useBarcodeCamera(
  video: RefObject<HTMLVideoElement | null>,
  active: boolean,
  onCode: (ean: Ean) => void,
  onError: (kind: ScanErrorKind) => void,
): BarcodeCamera {
  const controls = useRef<Controls | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const settingsRef = useRef<MediaTrackConstraintSet[]>([])
  const onCodeRef = useRef(onCode)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onCodeRef.current = onCode
    onErrorRef.current = onError
  })
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden')
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [starting, setStarting] = useState(true)

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const running = active && !hidden
  useEffect(() => {
    if (!running) return
    let cancelled = false
    const gate = createScanGate()
    const stop = (c: Controls | null) => {
      try {
        void Promise.resolve(c?.stop()).catch(() => undefined)
      } catch {
        // flux déjà arrêté
      }
    }
    const stopStream = (st: MediaStream | null) => {
      st?.getTracks().forEach((t) => {
        try {
          t.stop()
        } catch {
          // piste déjà arrêtée
        }
      })
    }
    const open = (c: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(c)
    const denied = (e: unknown) =>
      classifyCameraError(e, { isSecureContext: true, hasMediaDevices: true }) === 'permission_denied'
    /** Ouvre un appareil précis ; null si échec autre qu'un refus (le refus remonte). */
    const openDevice = async (id: string, forgetIfGone: boolean): Promise<MediaStream | null> => {
      try {
        return await open(deviceConstraints(id))
      } catch (e) {
        if (denied(e)) throw e
        if (forgetIfGone && isDeviceGone(e)) rememberDevice(null)
        return null
      }
    }
    const trackId = (st: MediaStream) => st.getVideoTracks()[0]?.getSettings?.().deviceId
    /** Ouvre la caméra arrière, sur l'objectif multi-objectifs s'il existe. Une seule piste ouverte à la fois. */
    const openBest = async (): Promise<MediaStream | null> => {
      const remembered = readRememberedDevice()
      if (remembered) {
        const s = await openDevice(remembered, true)
        if (cancelled) {
          stopStream(s)
          return null
        }
        if (s) return s
      }
      const first = await open(facingConstraints())
      if (cancelled) {
        stopStream(first)
        return null
      }
      const firstId = trackId(first)
      if (multiLensRank(first.getVideoTracks()[0]?.label ?? '') !== null) {
        if (firstId) rememberDevice(firstId)
        return first
      }
      let pick: MediaDeviceInfo | null = null
      try {
        pick = pickMultiLensDevice(await navigator.mediaDevices.enumerateDevices())
      } catch {
        // énumération indisponible : on garde la première piste
      }
      if (cancelled) {
        stopStream(first)
        return null
      }
      if (!pick) return first
      if (firstId === pick.deviceId) {
        rememberDevice(pick.deviceId)
        return first
      }
      stopStream(first)
      const better = await openDevice(pick.deviceId, false)
      if (cancelled) {
        stopStream(better)
        return null
      }
      if (better) {
        rememberDevice(pick.deviceId)
        return better
      }
      // appareil choisi en échec : retour à la caméra arrière par défaut
      const fallback = await open(facingConstraints())
      if (cancelled) {
        stopStream(fallback)
        return null
      }
      return fallback
    }
    const start = async () => {
      const env = {
        isSecureContext: window.isSecureContext,
        hasMediaDevices: typeof navigator.mediaDevices?.getUserMedia === 'function',
      }
      if (!env.isSecureContext || !env.hasMediaDevices) {
        onErrorRef.current(classifyCameraError(undefined, env))
        return
      }
      try {
        const [{ BrowserMultiFormatOneDReader }, { BarcodeFormat, DecodeHintType: Hint }] = await Promise.all(
          [import('@zxing/browser'), import('@zxing/library')],
        )
        if (cancelled) return
        const hints = new Map<DecodeHintType, unknown>([
          [Hint.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A]],
        ])
        const reader = new BrowserMultiFormatOneDReader(hints as Map<DecodeHintType, never>, {
          delayBetweenScanAttempts: 120,
        })
        const stream = await openBest()
        if (!stream) return
        streamRef.current = stream
        const track = stream.getVideoTracks()[0]
        settingsRef.current = track ? await tuneTrack(track) : []
        if (cancelled) return
        const c = await reader.decodeFromStream(stream, video.current ?? undefined, (result) => {
          if (!result) return
          const ean = normalizeEan(result.getText())
          if (ean && gate(ean, Date.now())) onCodeRef.current(ean)
        })
        if (cancelled) {
          stop(c)
          stopStream(stream)
          return
        }
        controls.current = c
        setTorchAvailable(track ? supportsTorch(track) : false)
        setStarting(false)
      } catch (e) {
        stopStream(streamRef.current)
        streamRef.current = null
        if (!cancelled) onErrorRef.current(classifyCameraError(e, env))
      }
    }
    void start()
    return () => {
      cancelled = true
      stop(controls.current)
      controls.current = null
      stopStream(streamRef.current)
      streamRef.current = null
      setTorchAvailable(false)
      setTorchOn(false)
      setStarting(true)
    }
  }, [running, video])

  const toggleTorch = async () => {
    const next = !torchOn
    try {
      const track = streamRef.current?.getVideoTracks()[0]
      if (!track) return
      await setTorch(track, next, settingsRef.current)
      setTorchOn(next)
    } catch {
      setTorchAvailable(false)
    }
  }

  return { running, starting, torchAvailable, torchOn, toggleTorch }
}
