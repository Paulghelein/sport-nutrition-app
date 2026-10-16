import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Ruler } from 'lucide-react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LogSheet } from '../src/ui/kit'
import type { LogEntry } from '../src/ui/kit'

afterEach(cleanup)

const MEALS = [
  { id: 'lunch', label: 'déjeuner', phrase: 'au déjeuner' },
  { id: 'dinner', label: 'dîner', phrase: 'au dîner' },
] as const

function setup(props: Partial<React.ComponentProps<typeof LogSheet>> = {}) {
  const onAction = vi.fn()
  render(
    <LogSheet
      meal="lunch"
      meals={MEALS}
      onMealChange={() => undefined}
      onAction={onAction}
      onStartSession={() => undefined}
      onClose={() => undefined}
      {...props}
    />,
  )
  return { onAction }
}

describe('LogSheet', () => {
  it('par défaut : entrées « Créer » du kit, pas de section « Autres »', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Recette par scan' })).toBeTruthy()
    expect(screen.queryByText('Autres')).toBeNull()
  })

  it('entrées « Créer » et « Autres » paramétrables, avec l’action transmise', () => {
    const create: LogEntry[] = [{ action: 'recipe-new', label: 'Nouvelle recette', Icon: Ruler }]
    const others: LogEntry[] = [{ action: 'measurements', label: 'Mensurations', Icon: Ruler }]
    const { onAction } = setup({ createEntries: create, otherEntries: others })
    expect(screen.queryByRole('button', { name: 'Recette par scan' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle recette' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mensurations' }))
    expect(onAction).toHaveBeenNthCalledWith(1, 'recipe-new')
    expect(onAction).toHaveBeenNthCalledWith(2, 'measurements')
  })

  it('« Créer » vide : section masquée', () => {
    setup({ createEntries: [] })
    expect(screen.queryByText('Créer')).toBeNull()
  })
})
