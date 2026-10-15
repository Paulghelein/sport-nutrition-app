import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button } from './Button'

interface Props {
  children: ReactNode
}

/** Attrape l'échec d'un chargement `lazy()` (hors ligne, cache périmé) et propose de recharger. */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn('Section non chargée', error, info.componentStack)
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div role="alert" className="rounded-2xl border border-red-400/40 bg-red-500/10 p-4">
        <p className="text-base text-red-100">Impossible de charger cette section.</p>
        <Button variant="secondary" className="mt-3" onClick={() => location.reload()}>
          Recharger
        </Button>
      </div>
    )
  }
}
