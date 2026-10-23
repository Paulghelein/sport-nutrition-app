import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from './cx'

export interface NoteProps {
  /** `error` : problème (role alert) ; `success` : confirmation (role status) ; `warning` : à savoir. */
  tone?: 'error' | 'success' | 'warning'
  children: ReactNode
  className?: string
}

const TONES = {
  error: { Icon: XCircle, icon: 'text-critical', role: 'alert' },
  success: { Icon: CheckCircle2, icon: 'text-good', role: 'status' },
  warning: { Icon: AlertTriangle, icon: 'text-warning', role: undefined },
} as const

/** Message court : icône colorée ET texte (la couleur ne porte jamais le sens seule). */
export function Note({ tone = 'error', children, className }: NoteProps) {
  const { Icon, icon, role } = TONES[tone]
  return (
    <div
      role={role}
      className={cx('flex gap-2.5 rounded-md bg-surface p-3 text-body text-ink shadow-card', className)}
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" className={cx('mt-0.5 shrink-0', icon)} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
