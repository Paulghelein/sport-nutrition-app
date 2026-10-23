import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Inbox } from 'lucide-react'
import { EmptyState, KcalRing, MacroBar, ScreenSkeleton, Sheet } from '../src/ui/kit'
import { FoodTile } from '../src/ui/kit/FoodPictogram'

afterEach(cleanup)

const dash = (container: HTMLElement) => {
  const circles = container.querySelectorAll('circle')
  return circles[1]?.getAttribute('stroke-dasharray') ?? ''
}
const FULL = 2 * Math.PI * 40

describe('KcalRing', () => {
  it('reste : libellé et anneau proportionnel', () => {
    const { container } = render(<KcalRing consumed={1000} target={2000} />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('1 000 kcal restantes sur 2 000 kcal')
    expect(Number(dash(container).split(' ')[0])).toBeCloseTo(FULL / 2, 5)
  })

  it('dépassement : anneau plein (pas de débordement) et texte « en trop »', () => {
    const { container } = render(<KcalRing consumed={2500} target={2000} />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('500 kcal au-dessus')
    expect(Number(dash(container).split(' ')[0])).toBeCloseTo(FULL, 5)
    expect(screen.getByText('en trop')).toBeTruthy()
    expect(screen.getByText('500')).toBeTruthy()
  })

  it('objectif 0 : pas de NaN, anneau vide', () => {
    const { container } = render(<KcalRing consumed={300} target={0} />)
    expect(dash(container)).not.toContain('NaN')
    expect(Number(dash(container).split(' ')[0])).toBe(0)
  })

  it('consommé négatif : anneau vide', () => {
    const { container } = render(<KcalRing consumed={-50} target={2000} />)
    expect(Number(dash(container).split(' ')[0])).toBe(0)
  })
})

describe('MacroBar', () => {
  const fillWidth = (c: HTMLElement) =>
    (c.querySelector('[role="progressbar"] > div') as HTMLElement).style.width

  it('proportion et attributs ARIA', () => {
    const { container } = render(<MacroBar kind="protein" value={60} target={120} />)
    const bar = screen.getByRole('progressbar', { name: 'Protéines' })
    expect(bar.getAttribute('aria-valuenow')).toBe('60')
    expect(bar.getAttribute('aria-valuemax')).toBe('120')
    expect(fillWidth(container)).toBe('50%')
  })

  it('dépassement : barre plafonnée à 100 %', () => {
    const { container } = render(<MacroBar kind="carbs" value={400} target={300} />)
    expect(fillWidth(container)).toBe('100%')
  })

  it('objectif 0 : 0 %, pas de NaN', () => {
    const { container } = render(<MacroBar kind="fat" value={10} target={0} />)
    expect(fillWidth(container)).toBe('0%')
  })

  it('le mot est toujours affiché (jamais la couleur seule)', () => {
    render(<MacroBar kind="fat" value={10} target={70} />)
    expect(screen.getByText('Lipides')).toBeTruthy()
  })
})

describe('FoodTile', () => {
  it('photo affichée, puis repli sur le pictogramme si elle échoue', () => {
    const { container } = render(<FoodTile category="meat" photoUrl="https://example.invalid/a.jpg" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(container.querySelector('svg')).toBeNull()
    fireEvent.error(img as HTMLImageElement)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('sans photo : pictogramme directement', () => {
    const { container } = render(<FoodTile category="egg" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('nouvelle URL après un échec : la photo est retentée', () => {
    const { container, rerender } = render(
      <FoodTile category="meat" photoUrl="https://example.invalid/a.jpg" />,
    )
    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    rerender(<FoodTile category="meat" photoUrl="https://example.invalid/b.jpg" />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.invalid/b.jpg')
  })

  it('badge code-barres et fond frigo', () => {
    const { container } = render(<FoodTile category="dairy" badge="barcode" fromFridge />)
    expect(container.firstElementChild?.className).toContain('bg-ember-soft')
    expect(container.querySelectorAll('svg').length).toBe(2)
  })
})

describe('Sheet (kit)', () => {
  it('Échap ferme, le focus passe dans la feuille puis revient au déclencheur', () => {
    const root = document.createElement('div')
    root.id = 'root'
    document.body.appendChild(root)
    const trigger = document.createElement('button')
    root.appendChild(trigger)
    trigger.focus()
    const onClose = vi.fn()
    const { unmount } = render(
      <Sheet title="Ajouter" onClose={onClose}>
        <button>Action</button>
      </Sheet>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Ajouter' })
    expect(document.activeElement).toBe(dialog)
    expect(root.hasAttribute('inert')).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
    expect(document.activeElement).toBe(trigger)
    expect(root.hasAttribute('inert')).toBe(false)
    root.remove()
  })

  it('occupée : Échap, croix et fond sont sans effet', () => {
    const onClose = vi.fn()
    render(
      <Sheet title="Import" onClose={onClose} busy>
        <p>…</p>
      </Sheet>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }))
    fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('clic sur le fond ferme, clic dans la feuille non', () => {
    const onClose = vi.fn()
    render(
      <Sheet title="T" onClose={onClose}>
        <button>Action</button>
      </Sheet>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Action' }))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('dialog').parentElement as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Tab piégé : du dernier élément vers le premier', () => {
    render(
      <Sheet title="T" onClose={() => undefined}>
        <button>Dernier</button>
      </Sheet>,
    )
    const last = screen.getByRole('button', { name: 'Dernier' })
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fermer' }))
  })

  it('feuilles empilées : Échap ne ferme que celle du dessus', () => {
    const a = vi.fn()
    const b = vi.fn()
    render(
      <>
        <Sheet title="A" onClose={a}>
          <p>a</p>
        </Sheet>
        <Sheet title="B" onClose={b}>
          <p>b</p>
        </Sheet>
      </>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(b).toHaveBeenCalledTimes(1)
    expect(a).not.toHaveBeenCalled()
  })
})

describe('EmptyState et squelettes', () => {
  it('EmptyState : titre, phrase et action', () => {
    render(
      <EmptyState icon={Inbox} title="Rien ici" action={<button type="button">Ajouter un truc</button>}>
        Fais ceci.
      </EmptyState>,
    )
    expect(screen.getByText('Rien ici')).toBeTruthy()
    expect(screen.getByText('Fais ceci.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ajouter un truc' })).toBeTruthy()
  })

  it('ScreenSkeleton : conteneur occupé avec un texte masqué', () => {
    const { container } = render(<ScreenSkeleton />)
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
    expect(screen.getByText('Chargement…').className).toContain('sr-only')
  })
})
