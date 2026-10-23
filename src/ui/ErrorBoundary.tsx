import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button } from './kit'

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
      <div role="alert" className="rounded-lg bg-surface p-4 font-sans text-ink shadow-card">
        <p className="m-0 text-body">Impossible de charger cette section.</p>
        <Button variant="dark" className="mt-3" onClick={() => location.reload()}>
          Recharger
        </Button>
      </div>
    )
  }
}
