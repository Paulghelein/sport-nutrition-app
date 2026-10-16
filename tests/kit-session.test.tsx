import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExerciseRow } from '../src/ui/kit/ExerciseRow'
import { RestTimer } from '../src/ui/kit/RestTimer'
import { SessionProgress, SetDots } from '../src/ui/kit/SessionProgress'
import { SetPanel } from '../src/ui/kit/SetPanel'

afterEach(cleanup)

describe('SetPanel', () => {
  const steps = (over: Partial<Parameters<typeof SetPanel>[0]['steps'] & object> = {}) => ({
    onDecrease: vi.fn(),
    onIncrease: vi.fn(),
    decreaseLabel: 'Une répétition de moins',
    increaseLabel: 'Une répétition de plus',
    ...over,
  })

  it('groupe nommé, valeur lisible, boutons ± de 64 px qui appellent les rappels', () => {
    const s = steps()
    render(<SetPanel label="Répétitions" value="10" hint="Objectif 8–12" steps={s} />)
    expect(screen.getByRole('group', { name: 'Répétitions' })).toBeTruthy()
    expect(screen.getByText('10')).toBeTruthy()
    const plus = screen.getByRole('button', { name: 'Une répétition de plus' })
    expect(plus.className).toContain('size-16')
    fireEvent.click(plus)
    fireEvent.click(screen.getByRole('button', { name: 'Une répétition de moins' }))
    expect(s.onIncrease).toHaveBeenCalledTimes(1)
    expect(s.onDecrease).toHaveBeenCalledTimes(1)
  })

  it('canDecrease faux : bouton désactivé ; sans steps : aucun bouton (panneau d’information)', () => {
    const { rerender } = render(<SetPanel label="Max" value="0" steps={steps({ canDecrease: false })} />)
    expect(
      (screen.getByRole('button', { name: 'Une répétition de moins' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    rerender(<SetPanel label="Charge" value="Poids du corps" valueSize="l" />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('nom accessible de groupe distinct pour le max', () => {
    render(<SetPanel label="Max" groupLabel="Maximum de répétitions" value="12" />)
    expect(screen.getByRole('group', { name: 'Maximum de répétitions' })).toBeTruthy()
  })
})

describe('RestTimer', () => {
  it('role="timer" ne contient que le temps restant ; « sur 1:30 » est à côté', () => {
    render(<RestTimer remainingSec={72} totalSec={90} caption="sur 1:30" />)
    const timer = screen.getByRole('timer', { name: 'Temps de repos restant' })
    expect(timer.textContent).toBe('1:12')
    expect(screen.getByText('sur 1:30')).toBeTruthy()
  })

  it('arc proportionnel au temps restant, vide à 0', () => {
    const { container, rerender } = render(<RestTimer remainingSec={45} totalSec={90} />)
    const arc = container.querySelectorAll('circle')[1]
    expect(Number(arc?.getAttribute('stroke-dasharray')?.split(' ')[0])).toBeCloseTo(Math.PI * 118, 3)
    rerender(<RestTimer remainingSec={0} totalSec={90} />)
    expect(container.querySelectorAll('circle')).toHaveLength(1)
    expect(screen.getByRole('timer').textContent).toBe('0:00')
  })
})

describe('SetDots et SessionProgress', () => {
  it('SetDots : une pastille par série, décoratives', () => {
    const { container } = render(<SetDots states={['done', 'current', 'todo', 'skipped']} />)
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelectorAll('span > span')).toHaveLength(4)
  })

  it('SessionProgress : un segment par exercice, libellé « exercice 2 sur 5 »', () => {
    render(<SessionProgress fractions={[1, 0.25, 0, 0, 0]} current={2} />)
    const bar = screen.getByRole('progressbar', { name: 'Avancement : exercice 2 sur 5' })
    expect(bar.getAttribute('aria-valuenow')).toBe('1')
    expect(bar.children).toHaveLength(5)
  })
})

describe('ExerciseRow', () => {
  it('nom, prescription en gras et suite en muted, actions à droite', () => {
    render(
      <ExerciseRow
        muscles={['quads']}
        title="Goblet squat"
        summary="4 × 8–12"
        detail="18 kg"
        actions={<button type="button">Remplacer</button>}
      />,
    )
    expect(screen.getByText('Goblet squat')).toBeTruthy()
    expect(screen.getByText('4 × 8–12').tagName).toBe('B')
    expect(screen.getByRole('button', { name: 'Remplacer' })).toBeTruthy()
    expect(screen.getByRole('img', { name: /Muscles ciblés/ })).toBeTruthy()
  })
})
