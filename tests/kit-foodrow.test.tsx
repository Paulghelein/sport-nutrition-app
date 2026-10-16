import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FoodRow } from '../src/ui/kit/FoodRow'

afterEach(cleanup)

const base = {
  name: 'Œufs entiers',
  quantity: '3 œufs',
  protein: 19,
  carbs: 1,
  fat: 15.4,
  kcal: 214,
  category: 'egg' as const,
}

describe('FoodRow', () => {
  it('nom, quantité + P/G/L, kcal à droite ; pictogramme sans photo', () => {
    const { container } = render(<FoodRow {...base} />)
    expect(screen.getByText('Œufs entiers')).toBeTruthy()
    expect(screen.getByText('3 œufs · P 19 · G 1 · L 15,4')).toBeTruthy()
    expect(screen.getByText('214')).toBeTruthy()
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelectorAll('svg').length).toBe(1)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('toute la ligne est un bouton qui appelle onPress, avec son nom accessible', () => {
    const onPress = vi.fn()
    render(<FoodRow {...base} onPress={onPress} ariaLabel="Modifier Œufs entiers, 214 kcal" />)
    const button = screen.getByRole('button', { name: 'Modifier Œufs entiers, 214 kcal' })
    expect(button.className).toContain('min-h-12')
    fireEvent.click(button)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('produit scanné : photo, badge code-barres et mot « scanné »', () => {
    const { container } = render(<FoodRow {...base} photoUrl="blob:http://x/1" scanned />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:http://x/1')
    expect(container.querySelector('.lucide-scan-barcode')).not.toBeNull()
    expect(screen.getByText(/· scanné$/)).toBeTruthy()
  })

  it('photo en erreur : repli sur le pictogramme, le badge reste', () => {
    const { container } = render(<FoodRow {...base} photoUrl="blob:http://x/1" scanned />)
    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.lucide-scan-barcode')).not.toBeNull()
  })

  it('portion du frigo : visuel sur ember-soft, sans badge', () => {
    const { container } = render(<FoodRow {...base} category="dish" fromFridge />)
    expect(container.querySelector('.bg-ember-soft')).not.toBeNull()
    expect(container.querySelector('.lucide-scan-barcode')).toBeNull()
  })

  it('dans une liste, chaque <li> porte son filet sauf le premier ; la ligne n’en ajoute pas', () => {
    const { container } = render(
      <ul>
        {['a', 'b'].map((n) => (
          <li key={n} className="border-t border-line first:border-t-0">
            <FoodRow {...base} name={n} />
          </li>
        ))}
      </ul>,
    )
    const items = [...container.querySelectorAll('li')]
    expect(items).toHaveLength(2)
    expect(items.every((li) => li.className.includes('border-t'))).toBe(true)
    expect(container.querySelectorAll('li > div.border-t')).toHaveLength(0)
  })
})
