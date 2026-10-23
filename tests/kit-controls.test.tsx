import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PillTabs, Segmented, Stepper, withUnit } from '../src/ui/kit'

afterEach(cleanup)

describe('Stepper', () => {
  const setup = (props: Partial<React.ComponentProps<typeof Stepper>> = {}) => {
    const onChange = vi.fn()
    render(<Stepper label="Charge" value={10} onChange={onChange} {...props} />)
    return {
      onChange,
      minus: screen.getByRole('button', { name: 'Diminuer : Charge' }) as HTMLButtonElement,
      plus: screen.getByRole('button', { name: 'Augmenter : Charge' }) as HTMLButtonElement,
    }
  }

  it('incrémente et décrémente du pas', () => {
    const { onChange, minus, plus } = setup({ step: 2 })
    fireEvent.click(plus)
    fireEvent.click(minus)
    expect(onChange).toHaveBeenNthCalledWith(1, 12)
    expect(onChange).toHaveBeenNthCalledWith(2, 8)
  })

  it('pas décimal sans erreur flottante (0,1 + 0,2)', () => {
    const { onChange, plus } = setup({ value: 0.1, step: 0.2 })
    fireEvent.click(plus)
    expect(onChange).toHaveBeenCalledWith(0.3)
  })

  it('pas de 0,5 : 72,4 -> 72,9 exactement', () => {
    const { onChange, plus } = setup({ value: 72.4, step: 0.5 })
    fireEvent.click(plus)
    expect(onChange).toHaveBeenCalledWith(72.9)
  })

  it('pas de 0,1 répété ne dérive pas', () => {
    function Host() {
      const [v, setV] = useState(0)
      return <Stepper label="Charge" value={v} onChange={setV} step={0.1} />
    }
    render(<Host />)
    const plus = screen.getByRole('button', { name: 'Augmenter : Charge' })
    for (let i = 0; i < 10; i++) fireEvent.click(plus)
    expect(screen.getByRole('status').textContent).toBe('1')
  })

  it('désactive − au minimum et + au maximum', () => {
    const atMin = setup({ value: 5, min: 5, max: 9 })
    expect(atMin.minus.disabled).toBe(true)
    expect(atMin.plus.disabled).toBe(false)
    cleanup()
    const atMax = setup({ value: 9, min: 5, max: 9 })
    expect(atMax.plus.disabled).toBe(true)
    expect(atMax.minus.disabled).toBe(false)
  })

  it('borne le résultat (pas plus grand que la marge restante)', () => {
    const { onChange, plus } = setup({ value: 9, max: 10, step: 5 })
    fireEvent.click(plus)
    expect(onChange).toHaveBeenCalledWith(10)
  })

  it('désactivé : les deux boutons sont inertes', () => {
    const { onChange, minus, plus } = setup({ disabled: true })
    expect(minus.disabled && plus.disabled).toBe(true)
    fireEvent.click(plus)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('format personnalisé et par défaut', () => {
    setup({ value: 16, format: (v) => withUnit(v, 'kg') })
    expect(screen.getByRole('status').textContent).toBe('16 kg')
    cleanup()
    setup({ value: 72.5 })
    expect(screen.getByRole('status').textContent).toBe('72,5')
  })

  it('libellés personnalisés des boutons', () => {
    render(
      <Stepper
        label="Charge"
        value={1}
        onChange={() => undefined}
        decreaseLabel="Moins"
        increaseLabel="Plus"
      />,
    )
    expect(screen.getByRole('button', { name: 'Moins' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Plus' })).toBeTruthy()
  })
})

const OPTIONS = [
  { value: 20, label: '20' },
  { value: 30, label: '30' },
  { value: 45, label: '45' },
] as const

describe('Segmented', () => {
  it('marque le choix courant et appelle onChange au clic', () => {
    const onChange = vi.fn()
    render(<Segmented ariaLabel="Durée" options={OPTIONS} value={30} onChange={onChange} />)
    expect(screen.getByRole('radio', { name: '30' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: '20' }).getAttribute('aria-checked')).toBe('false')
    fireEvent.click(screen.getByRole('radio', { name: '45' }))
    expect(onChange).toHaveBeenCalledWith(45)
  })

  it('flèches : suivant / précédent avec retour circulaire, et déplace le focus', () => {
    function Host() {
      const [v, setV] = useState<number>(45)
      return <Segmented ariaLabel="Durée" options={OPTIONS} value={v} onChange={setV} />
    }
    render(<Host />)
    const group = screen.getByRole('radiogroup', { name: 'Durée' })
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(screen.getByRole('radio', { name: '20' }).getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '20' }))
    fireEvent.keyDown(group, { key: 'ArrowLeft' })
    expect(screen.getByRole('radio', { name: '45' }).getAttribute('aria-checked')).toBe('true')
  })

  it('tabIndex : seul le choix courant est dans l’ordre de tabulation', () => {
    render(<Segmented ariaLabel="Durée" options={OPTIONS} value={30} onChange={() => undefined} />)
    expect(screen.getByRole('radio', { name: '30' }).tabIndex).toBe(0)
    expect(screen.getByRole('radio', { name: '20' }).tabIndex).toBe(-1)
  })

  it('tabIndex : valeur hors liste, le premier choix reste atteignable au clavier', () => {
    render(<Segmented ariaLabel="Durée" options={OPTIONS} value={99 as 20} onChange={() => undefined} />)
    expect(screen.getByRole('radio', { name: '20' }).tabIndex).toBe(0)
    expect(screen.getByRole('radio', { name: '30' }).tabIndex).toBe(-1)
  })

  it('valeur hors liste : → va au premier choix, ← au dernier', () => {
    const onChange = vi.fn()
    render(<Segmented ariaLabel="Durée" options={OPTIONS} value={99 as 20} onChange={onChange} />)
    const group = screen.getByRole('radiogroup')
    fireEvent.keyDown(group, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(OPTIONS[0]?.value)
    fireEvent.keyDown(group, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith(OPTIONS[OPTIONS.length - 1]?.value)
  })

  it('désactivé : ni clic ni flèches', () => {
    const onChange = vi.fn()
    render(<Segmented ariaLabel="Durée" options={OPTIONS} value={30} onChange={onChange} disabled />)
    fireEvent.click(screen.getByRole('radio', { name: '45' }))
    fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('PillTabs', () => {
  const TABS = [
    { id: 'journal', label: 'Journal' },
    { id: 'recipes', label: 'Recettes' },
    { id: 'fridge', label: 'Frigo' },
  ] as const

  it('sélection par clic, aria-selected et aria-controls', () => {
    const onChange = vi.fn()
    render(
      <PillTabs
        ariaLabel="Nutrition"
        tabs={TABS}
        value="journal"
        onChange={onChange}
        panelIdPrefix="panel"
      />,
    )
    const journal = screen.getByRole('tab', { name: 'Journal' })
    expect(journal.getAttribute('aria-selected')).toBe('true')
    expect(journal.getAttribute('aria-controls')).toBe('panel-journal')
    fireEvent.click(screen.getByRole('tab', { name: 'Frigo' }))
    expect(onChange).toHaveBeenCalledWith('fridge')
  })

  it('tabIndex : valeur hors liste, le premier onglet reste atteignable au clavier', () => {
    render(<PillTabs ariaLabel="N" tabs={TABS} value={'inconnu' as 'journal'} onChange={() => undefined} />)
    expect(screen.getByRole('tab', { name: 'Journal' }).tabIndex).toBe(0)
    expect(screen.getByRole('tab', { name: 'Frigo' }).tabIndex).toBe(-1)
  })

  it('valeur hors liste : → va au premier onglet, ← au dernier', () => {
    const onChange = vi.fn()
    render(<PillTabs ariaLabel="N" tabs={TABS} value={'inconnu' as 'journal'} onChange={onChange} />)
    const list = screen.getByRole('tablist')
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenLastCalledWith(TABS[0]?.id)
    fireEvent.keyDown(list, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith(TABS[TABS.length - 1]?.id)
  })

  it('pas d’aria-controls sans panelIdPrefix', () => {
    render(<PillTabs ariaLabel="N" tabs={TABS} value="journal" onChange={() => undefined} />)
    expect(screen.getByRole('tab', { name: 'Journal' }).hasAttribute('aria-controls')).toBe(false)
  })

  it('flèches avec retour circulaire', () => {
    function Host() {
      const [v, setV] = useState<(typeof TABS)[number]['id']>('fridge')
      return <PillTabs ariaLabel="N" tabs={TABS} value={v} onChange={setV} />
    }
    render(<Host />)
    const list = screen.getByRole('tablist')
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(screen.getByRole('tab', { name: 'Journal' }).getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Journal' }))
    fireEvent.keyDown(list, { key: 'ArrowLeft' })
    expect(screen.getByRole('tab', { name: 'Frigo' }).getAttribute('aria-selected')).toBe('true')
  })
})
