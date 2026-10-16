import { useRef } from 'react'
import type { Ean, ScanErrorKind } from '../../types'
import { useBarcodeCamera } from './useBarcodeCamera'

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
  const { running, starting, torchAvailable, torchOn, toggleTorch } = useBarcodeCamera(
    video,
    active,
    onCode,
    onError,
  )

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
      ) : (
        <p className="absolute inset-x-0 bottom-3 text-center text-base text-zinc-300">
          Tiens le code à 15–20 cm
        </p>
      )}
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
