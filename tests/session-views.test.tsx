import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Equipment, SessionBlock, SetEntry } from '../src/types'
import type { SetInput } from '../src/types/guided'

const alertEnd = vi.hoisted(() => vi.fn())
vi.mock('../src/app/training/alerts', () => ({
  alertEnd,
  unlockAudio: vi.fn(),
  beep: vi.fn(),
  vibrate: vi.fn(),
}))

import type { StepInfo } from '../src/app/training/guidedInfo'
import { RestView, SetView } from '../src/app/training/guidedViews'

const top = { onQuit: vi.fn(), progress: null }
const equipment = {
  id: 'me',
  kettlebell: { minKg: 8, maxKg: 24, stepKg: 2 },
  owned: ['mat'],
  updatedAt: '2026-01-01T00:00:00.000Z',
} satisfies Equipment

function step(set: SetEntry, blockKind: SessionBlock['kind'] = 'single', nSets = 3): StepInfo {
  const sets = Array.from({ length: nSets }, () => ({ ...set }))
  const se = { exerciseId: 'x', restSec: 60, sets }
  return {
    cursor: { block: 0, exercise: 0, set: nSets - 1 },
    block: { id: 'b', kind: blockKind, exercises: [se] },
    se,
    set: sets[nSets - 1] as SetEntry,
    exercise: undefined,
    state: undefined,
    learning: false,
  }
}

function view(info: StepInfo, onValidate: (i: SetInput) => void = vi.fn()) {
  return render(
    <SetView
      top={top}
      info={info}
      equipment={equipment}
      position={{ current: 1, total: 2 }}
      lastLoadKg={undefined}
      onValidate={onValidate}
      onHelp={vi.fn()}
    />,
  )
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-05-01T10:00:00Z'))
  alertEnd.mockClear()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SetView : une vue par type de série', () => {
  it('reps : groupe Répétitions, objectif, pas de consigne d’arrêt', () => {
    view(step({ setType: 'reps', targetReps: [8, 12] }))
    expect(screen.getByRole('group', { name: 'Répétitions' })).toBeTruthy()
    expect(screen.getByText(/Objectif 8/)).toBeTruthy()
    expect(screen.queryByText(/Arrête-toi/)).toBeNull()
  })

  it('time : durée tenue et chronomètre à lancer', () => {
    view(step({ setType: 'time', targetDurationSec: 30 }))
    expect(screen.getByRole('group', { name: 'Durée tenue' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Lancer le chrono' })).toBeTruthy()
  })

  it('amrap : consigne d’arrêt, groupe « Maximum de répétitions », aucune cible', () => {
    view(step({ setType: 'amrap', targetReps: [8, 12] }))
    expect(screen.getByText('Arrête-toi dès que la forme se dégrade ; descends contrôlé.')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Maximum de répétitions' })).toBeTruthy()
    expect(screen.getByText(/Pas de cible/)).toBeTruthy()
    expect(screen.queryByText(/Objectif/)).toBeNull()
  })

  it('timedMax sans fenêtre valide = série en répétitions normale', () => {
    view(step({ setType: 'timedMax', targetReps: [8, 12] }))
    expect(screen.getByRole('group', { name: 'Répétitions' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Lancer les/ })).toBeNull()
    expect(screen.queryByText(/Arrête-toi/)).toBeNull()
  })
})

describe('SetView : timedMax', () => {
  const info = () => step({ setType: 'timedMax', targetDurationSec: 30 }, 'finisher', 2)

  it('prête : bouton de lancement et saisie sans chrono, aucun ressenti', () => {
    view(info())
    expect(screen.getByRole('button', { name: 'Lancer les 30 s' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Saisir sans chrono' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Correct' })).toBeNull()
  })

  it('compte à rebours, bip à la fin (une seule fois), puis saisie des répétitions', () => {
    const onValidate = vi.fn()
    view(info(), onValidate)
    fireEvent.click(screen.getByRole('button', { name: 'Lancer les 30 s' }))
    const group = screen.getByRole('group', { name: 'Compte à rebours de la série' })
    expect(group.textContent).toContain('0:30')
    expect(screen.getByRole('button', { name: 'Arrêter maintenant' })).toBeTruthy()
    act(() => void vi.advanceTimersByTime(10_000))
    expect(screen.getByRole('group', { name: 'Compte à rebours de la série' }).textContent).toContain('0:20')
    expect(alertEnd).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(20_400))
    expect(alertEnd).toHaveBeenCalledTimes(1)
    act(() => void vi.advanceTimersByTime(5_000))
    expect(alertEnd).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('group', { name: 'Répétitions' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Une répétition de plus' }))
    fireEvent.click(screen.getByRole('button', { name: 'Correct' }))
    const input = onValidate.mock.calls[0]?.[0] as SetInput
    expect(input.feeling).toBe('ok')
    expect(input.reps).toBeGreaterThan(0)
    expect(input.durationSec).toBeUndefined()
  })

  it('arrêt manuel : la saisie apparaît sans bip', () => {
    view(info())
    fireEvent.click(screen.getByRole('button', { name: 'Lancer les 30 s' }))
    act(() => void vi.advanceTimersByTime(5_000))
    fireEvent.click(screen.getByRole('button', { name: 'Arrêter maintenant' }))
    expect(screen.getByRole('group', { name: 'Répétitions' })).toBeTruthy()
    expect(alertEnd).not.toHaveBeenCalled()
  })

  it('saisie sans chrono : directement les répétitions, jamais de chrono ni de bip', () => {
    const onValidate = vi.fn()
    view(info(), onValidate)
    fireEvent.click(screen.getByRole('button', { name: 'Saisir sans chrono' }))
    expect(screen.queryByRole('group', { name: 'Compte à rebours de la série' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Répétitions' })).toBeTruthy()
    act(() => void vi.advanceTimersByTime(60_000))
    expect(alertEnd).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Dur' }))
    expect((onValidate.mock.calls[0]?.[0] as SetInput).feeling).toBe('hard')
  })
})

describe('SetView : cibles tactiles de séance', () => {
  it('boutons ± et de ressenti ≥ 64 px (classes size-16 / min-h-16)', () => {
    view(step({ setType: 'reps', targetReps: [8, 12], loadKg: 12 }))
    for (const name of ['Une répétition de plus', 'Une répétition de moins', 'Plus un palier de charge'])
      expect(screen.getByRole('button', { name }).className).toMatch(/size-16|min-h-16/)
    for (const name of ['Facile', 'Correct', 'Dur'])
      expect(screen.getByRole('button', { name }).className).toContain('min-h-16')
  })
})

describe('RestView', () => {
  const rest = (
    over: { endsAt?: number; totalSec?: number; onAdjust?: () => void; onEnd?: () => void } = {},
  ) =>
    render(
      <RestView
        top={top}
        endsAt={over.endsAt ?? Date.now() + 90_000}
        totalSec={over.totalSec ?? 90}
        label="Repos"
        recap="Série 2 validée"
        next={null}
        onAdjust={over.onAdjust ?? vi.fn()}
        onEnd={over.onEnd ?? vi.fn()}
      />,
    )

  it('role=timer avec le seul temps restant ; annonce de début dans une région polie', () => {
    rest()
    const timer = screen.getByRole('timer', { name: 'Temps de repos restant' })
    expect(timer.textContent).toBe('1:30')
    const status = screen.getByRole('status')
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.textContent).toBe('Repos de 1 min 30 s.')
  })

  it('±15 s appellent onAdjust ; ≥ 64 px', () => {
    const onAdjust = vi.fn()
    rest({ onAdjust })
    // Armés après 600 ms comme « Passer » : le geste de validation ne doit pas ajuster le repos (double tap).
    fireEvent.click(screen.getByRole('button', { name: '−15 s' }))
    expect(onAdjust).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(700))
    fireEvent.click(screen.getByRole('button', { name: '−15 s' }))
    fireEvent.click(screen.getByRole('button', { name: '+15 s' }))
    expect(onAdjust.mock.calls).toEqual([[-15], [15]])
    expect(screen.getByRole('button', { name: '+15 s' }).className).toContain('min-h-16')
  })

  it('Passer : désactivé juste après la validation, actif après 600 ms', () => {
    const onEnd = vi.fn()
    rest({ onEnd })
    const pass = screen.getByRole('button', { name: 'Passer le repos' }) as HTMLButtonElement
    expect(pass.disabled).toBe(true)
    act(() => void vi.advanceTimersByTime(700))
    expect(pass.disabled).toBe(false)
    fireEvent.click(pass)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('annonce « plus que 10 secondes », puis fin : bip unique, bouton « Série suivante »', () => {
    rest({ endsAt: Date.now() + 15_000, totalSec: 15 })
    act(() => void vi.advanceTimersByTime(6_000))
    expect(screen.getByRole('status').textContent).toBe('Plus que 10 secondes.')
    expect(alertEnd).not.toHaveBeenCalled()
    act(() => void vi.advanceTimersByTime(10_000))
    expect(screen.getByRole('status').textContent).toBe('Repos terminé.')
    expect(screen.getByRole('button', { name: 'Série suivante' })).toBeTruthy()
    expect(screen.getByRole('timer', { name: 'Temps de repos restant' }).textContent).toBe('0:00')
    expect(alertEnd).toHaveBeenCalledTimes(1)
  })
})
