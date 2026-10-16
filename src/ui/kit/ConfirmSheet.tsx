import { Button } from './Button'
import { Sheet } from './Sheet'

export interface ConfirmSheetProps {
  title: string
  message: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  /** Action destructive (bouton rouge) ; `false` : bouton principal. */
  danger?: boolean
}

/** Confirmation dans une feuille du bas : action principale puis « Annuler ». */
export function ConfirmSheet({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy = false,
  danger = true,
}: ConfirmSheetProps) {
  return (
    <Sheet title={title} onClose={onCancel} busy={busy}>
      <p className="m-0 text-body text-ink-muted">{message}</p>
      <div className="flex flex-col gap-2">
        <Button variant={danger ? 'danger' : 'primary'} fullWidth onClick={onConfirm} disabled={busy}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" fullWidth onClick={onCancel} disabled={busy}>
          Annuler
        </Button>
      </div>
    </Sheet>
  )
}
