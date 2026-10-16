import type { DecodeHintType } from '@zxing/library'
import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { normalizeEan } from '../../domain/nutrition/off'
import type { Ean, ScanErrorKind } from '../../types'
import { classifyCameraError, createScanGate } from './scanLogic'

interface Controls {
  stop: () => void | Promise<void>
  switchTorch?: (on: boolean) => Promise<void>
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
        const c = await reader.decodeFromConstraints(
          { audio: false, video: { facingMode: { ideal: 'environment' } } },
          video.current ?? undefined,
          (result) => {
            if (!result) return
            const ean = normalizeEan(result.getText())
            if (ean && gate(ean, Date.now())) onCodeRef.current(ean)
          },
        )
        if (cancelled) {
          stop(c)
          return
        }
        controls.current = c
        setTorchAvailable(typeof c.switchTorch === 'function')
        setStarting(false)
      } catch (e) {
        if (!cancelled) onErrorRef.current(classifyCameraError(e, env))
      }
    }
    void start()
    return () => {
      cancelled = true
      stop(controls.current)
      controls.current = null
      setTorchAvailable(false)
      setTorchOn(false)
      setStarting(true)
    }
  }, [running, video])

  const toggleTorch = async () => {
    const next = !torchOn
    try {
      await controls.current?.switchTorch?.(next)
      setTorchOn(next)
    } catch {
      setTorchAvailable(false)
    }
  }

  return { running, starting, torchAvailable, torchOn, toggleTorch }
}
