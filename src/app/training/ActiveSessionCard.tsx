import { History, LayoutTemplate, Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import { getActiveSession } from '../../db'
import { useLiveQuery } from '../../ui'
import { Card, buttonClass } from '../../ui/kit'
import { GUIDED_PATH, HISTORY_PATH, TEMPLATES_PATH } from '../routes'

/** « Séance en cours — Reprendre » : visible en tête de l'écran Entraînement tant qu'une séance est commencée. */
export function ActiveSessionCard() {
  const { data } = useLiveQuery(() => getActiveSession(), [])
  if (!data) return null
  let done = 0
  let total = 0
  for (const b of data.blocks)
    for (const e of b.exercises)
      for (const s of e.sets) {
        total++
        if (s.status !== undefined) done++
      }
  return (
    <Card padding="large" className="flex flex-col gap-3 bg-ember-soft" aria-label="Séance en cours">
      <div className="flex flex-col gap-1">
        <p className="m-0 font-display text-title">Séance en cours</p>
        <p className="m-0 text-body">
          {done === 0
            ? 'Pas encore commencée.'
            : `${done} série${done > 1 ? 's' : ''} sur ${total} déjà faite${done > 1 ? 's' : ''} ou passée${done > 1 ? 's' : ''}.`}
        </p>
      </div>
      <Link to={GUIDED_PATH} className={buttonClass('primary', 'normal', true)}>
        <Play size={20} strokeWidth={1.75} aria-hidden="true" />
        Reprendre
      </Link>
    </Card>
  )
}

/** Raccourcis vers l'historique et les modèles. */
export function SessionLinks() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Link to={HISTORY_PATH} className={buttonClass('secondary', 'normal', true)}>
        <History size={20} strokeWidth={1.75} aria-hidden="true" />
        Historique
      </Link>
      <Link to={TEMPLATES_PATH} className={buttonClass('secondary', 'normal', true)}>
        <LayoutTemplate size={20} strokeWidth={1.75} aria-hidden="true" />
        Modèles
      </Link>
    </div>
  )
}
