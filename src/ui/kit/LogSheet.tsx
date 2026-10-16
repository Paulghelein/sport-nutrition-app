import {
  CookingPot,
  FilePlus,
  Hash,
  MessageSquareText,
  Play,
  ScanBarcode,
  Scale,
  Search,
  Video,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import type { MealSlot } from '../../types'
import { Button } from './Button'
import { Segmented } from './Segmented'
import { Sheet } from './Sheet'

export type LogAction =
  | 'scan'
  | 'search'
  | 'recipe-or-fridge'
  | 'describe-to-claude'
  | 'quick-entry'
  | 'weigh-in'
  | 'recipe-from-scan'
  | 'recipe-from-video'

export interface LogMealOption {
  id: MealSlot
  /** Libellé court, en minuscules (« déjeuner »). */
  label: string
  /** Complément complet pour la phrase « au déjeuner », « à la collation ». */
  phrase: string
}

export interface LogSheetProps {
  /** Repas ciblé (déduit de l'heure par l'appelant). */
  meal: MealSlot
  /** Repas proposés dans le sélecteur. */
  meals: readonly LogMealOption[]
  onMealChange: (meal: MealSlot) => void
  /** Une tuile ou un lien « Créer » a été touché. */
  onAction: (action: LogAction) => void
  /** Bouton sombre « Démarrer une séance ». */
  onStartSession: () => void
  onClose: () => void
}

const TILES: { action: LogAction; label: string; Icon: LucideIcon }[] = [
  { action: 'scan', label: 'Scanner', Icon: ScanBarcode },
  { action: 'search', label: 'Chercher', Icon: Search },
  { action: 'recipe-or-fridge', label: 'Recette ou frigo', Icon: CookingPot },
  { action: 'describe-to-claude', label: 'Décrire à Claude', Icon: MessageSquareText },
  { action: 'quick-entry', label: 'Saisie rapide', Icon: Hash },
  { action: 'weigh-in', label: 'Pesée', Icon: Scale },
]

const CREATE: { action: LogAction; label: string; Icon: LucideIcon }[] = [
  { action: 'recipe-from-scan', label: 'Recette par scan', Icon: FilePlus },
  { action: 'recipe-from-video', label: 'Recette d’une vidéo', Icon: Video },
]

/**
 * Feuille « Ajouter » (bouton +) : toute la saisie passe par ici. Composant présentationnel : il ne sait rien du
 * routage ni de la base, l'appelant branche `onAction`. Le repas ciblé est affiché dans le sous-titre et modifiable
 * (toucher le mot ouvre le choix du repas).
 */
export function LogSheet({ meal, meals, onMealChange, onAction, onStartSession, onClose }: LogSheetProps) {
  const [picking, setPicking] = useState(false)
  const current = meals.find((m) => m.id === meal)
  const mealPhrase = current?.phrase ?? ''

  return (
    <Sheet
      title="Ajouter"
      onClose={onClose}
      description={
        <>
          <button
            type="button"
            aria-expanded={picking}
            aria-label={`Repas ${mealPhrase}. Changer de repas`}
            onClick={() => setPicking((p) => !p)}
            className="focus-ring -my-2 inline-flex min-h-11 min-w-11 items-center justify-center font-bold text-ink underline decoration-ink-faint underline-offset-4"
          >
            {mealPhrase}
          </button>{' '}
          · modifiable
        </>
      }
    >
      {picking && (
        <Segmented
          ariaLabel="Repas"
          columns={2}
          value={meal}
          options={meals.map((m) => ({ value: m.id, label: m.label }))}
          onChange={(id) => {
            onMealChange(id)
            setPicking(false)
          }}
        />
      )}

      <div className="grid grid-cols-3 gap-2">
        {TILES.map(({ action, label, Icon }) => (
          <button
            key={action}
            type="button"
            onClick={() => onAction(action)}
            className="focus-ring flex min-h-24 flex-col items-center justify-center gap-2 rounded-ds-md bg-surface px-1 text-center text-caption font-semibold text-ink shadow-card active:opacity-70"
          >
            <Icon size={28} strokeWidth={1.75} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-label uppercase text-ink-muted">Créer</h3>
        <div className="grid grid-cols-2 gap-2">
          {CREATE.map(({ action, label, Icon }) => (
            <button
              key={action}
              type="button"
              onClick={() => onAction(action)}
              className="focus-ring flex min-h-14 items-center gap-2.5 rounded-ds-md bg-surface px-3.5 text-left text-[14px] font-semibold leading-[18px] text-ink shadow-card active:opacity-70"
            >
              <Icon size={24} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <Button
        variant="dark"
        fullWidth
        className="min-h-14"
        icon={<Play size={22} strokeWidth={1.75} aria-hidden="true" />}
        onClick={onStartSession}
      >
        Démarrer une séance
      </Button>
    </Sheet>
  )
}
