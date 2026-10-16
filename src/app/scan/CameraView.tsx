import type { DecodeHintType } from '@zxing/library'
import { useEffect, useRef, useState } from 'react'
import { normalizeEan } from '../../domain/nutrition'
import type { Ean, ScanErrorKind } from '../../types'
import { classifyCameraError, createScanGate } from './scanLogic'

interface Controls {
  stop: () => void | Promise<void>
  switchTorch?: (on: boolean) => Promise<void>
}

/**
 * Flux caméra arrière + lecture EAN-13 / EAN-8 / UPC-A. @zxing est chargé à la demande (chunk séparé).
 * Le flux est coupé quand `active` passe à faux, au démontage et quand l'app passe en arrière-plan.
 */
export function CameraView({
  active,
  onCode,
  onError,
  flash,
}: {
  active: boolean
  onCode: (ean: Ean) => void
  onError: (kind: ScanErrorKind) => void
  /** Cadre vert : un code vient d'être lu. */
  flash: boolean
}) {
  const video = useRef<HTMLVideoElement>(null)
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
  }, [running])

  const toggleTorch = async () => {
    const next = !torchOn
    try {
      await controls.current?.switchTorch?.(next)
      setTorchOn(next)
    } catch {
      setTorchAvailable(false)
    }
  }

  return (
    <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-2xl bg-black">
      <video
        ref={video}
        muted
        playsInline
        className="size-full object-cover"
        aria-label="Aperçu de la caméra"
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-6 top-1/2 h-1/3 -translate-y-1/2 rounded-2xl border-4 transition-colors ${flash ? 'border-emerald-400 bg-emerald-400/20' : 'border-white/80'}`}
      />
      {starting && running ? (
        <p role="status" className="absolute inset-x-0 bottom-3 text-center text-base text-white">
          Ouverture de la caméra…
        </p>
      ) : null}
      {torchAvailable ? (
        <button
          type="button"
          aria-pressed={torchOn}
          onClick={() => void toggleTorch()}
          className="absolute right-3 top-3 flex min-h-11 items-center rounded-full bg-black/60 px-4 text-base font-semibold text-white active:bg-black/80"
        >
          {torchOn ? 'Lampe allumée' : 'Lampe'}
        </button>
      ) : null}
    </div>
  )
}
