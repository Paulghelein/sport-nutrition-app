import { ArrowLeft, Flashlight, FlashlightOff } from 'lucide-react'
import { useRef } from 'react'
import type { Ean, ScanErrorKind } from '../../types'
import { useBarcodeCamera } from '../scan/useBarcodeCamera'

/**
 * Contenu du bandeau sombre de la maquette RecetteScan : rangée Retour / titre / lampe en haut, puis le cadre de
 * lecture sur le flux caméra (la logique est celle de `useBarcodeCamera`, partagée avec `CameraView`).
 * `failedTitle` : la caméra est indisponible, le cadre est remplacé par ce titre (le détail est affiché par l'écran).
 */
export function StripCamera({
  active,
  flash,
  hint,
  failedTitle,
  onBack,
  onCode,
  onError,
}: {
  active: boolean
  /** Un code est en cours de recherche. */
  flash: boolean
  hint: string
  failedTitle: string | null
  onBack: () => void
  onCode: (ean: Ean) => void
  onError: (kind: ScanErrorKind) => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const { running, starting, torchAvailable, torchOn, toggleTorch } = useBarcodeCamera(
    video,
    active && failedTitle === null,
    onCode,
    onError,
  )
  const TorchIcon = torchOn ? Flashlight : FlashlightOff
  return (
    <>
      {/* Le flux reste sous la rangée du haut et le cadre ; atténué pour garder le texte lisible. */}
      <video
        ref={video}
        muted
        playsInline
        aria-label="Aperçu de la caméra"
        className="absolute inset-0 size-full object-cover opacity-60"
      />
      <div className="relative flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          aria-label="Retour"
          className="focus-ring grid size-11 place-items-center rounded-full bg-on-inverse/12 text-on-inverse"
        >
          <ArrowLeft size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <h1 className="m-0 font-sans text-body-strong">Recette par scan</h1>
        {torchAvailable ? (
          <button
            type="button"
            aria-pressed={torchOn}
            aria-label="Lampe"
            onClick={() => void toggleTorch()}
            className="focus-ring grid size-11 place-items-center rounded-full bg-on-inverse/12 text-on-inverse"
          >
            <TorchIcon size={20} strokeWidth={1.75} aria-hidden="true" />
          </button>
        ) : (
          <span aria-hidden="true" className="size-11" />
        )}
      </div>
      <div className="relative grid flex-1 place-items-center">
        {failedTitle !== null ? (
          <p className="m-0 text-body-strong">{failedTitle}</p>
        ) : (
          <>
            <div
              aria-hidden="true"
              className={`relative h-[92px] w-60 rounded-ds-md ring-2 ring-inset transition-colors ${
                flash ? 'bg-ember/20 ring-ember' : 'ring-on-inverse/35'
              }`}
            >
              <span className="absolute inset-x-4 top-[45px] h-0.5 rounded-full bg-ember" />
            </div>
            {starting && running ? (
              <p role="status" className="absolute bottom-0 m-0 text-caption text-on-inverse-muted">
                Ouverture de la caméra…
              </p>
            ) : (
              <div className="absolute bottom-0 text-center text-caption text-on-inverse-muted">
                <p className="m-0">{hint}</p>
                <p className="m-0">Tiens le code à 15–20 cm</p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
