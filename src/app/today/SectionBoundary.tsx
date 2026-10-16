import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Button, Card } from '../../ui/kit'

/** Attrape l'échec d'un chargement `lazy()` (hors ligne, cache périmé) sans casser le reste de l'écran. */
export class SectionBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
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
      <Card role="alert" className="flex flex-col items-start gap-3">
        <p className="m-0 text-body text-ink">Impossible de charger cette section.</p>
        <Button variant="secondary" onClick={() => location.reload()}>
          Recharger
        </Button>
      </Card>
    )
  }
}

/** Message d'erreur de lecture d'une carte (la base ne répond pas). */
export function CardError({ children }: { children: ReactNode }) {
  return (
    <Card role="alert">
      <p className="m-0 text-body text-ink">{children}</p>
    </Card>
  )
}
