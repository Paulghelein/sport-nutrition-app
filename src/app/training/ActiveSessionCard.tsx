import { Link } from 'react-router-dom'
import { getActiveSession } from '../../db'
import { Card, linkButtonClass, useLiveQuery } from '../../ui'
import { GUIDED_PATH } from '../routes'

/** « Séance en cours — Reprendre » : visible en tête de l'écran Séance tant qu'une séance est commencée. */
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
    <Card className="mt-5 border-orange-400/60 bg-orange-400/10">
      <p className="m-0 text-xl font-bold">Séance en cours</p>
      <p className="m-0 mt-1 text-base text-zinc-200">
        {done === 0
          ? 'Pas encore commencée.'
          : `${done} série${done > 1 ? 's' : ''} sur ${total} déjà faite${done > 1 ? 's' : ''} ou passée${done > 1 ? 's' : ''}.`}
      </p>
      <Link to={GUIDED_PATH} className={`${linkButtonClass('primary')} mt-3`}>
        Reprendre
      </Link>
    </Card>
  )
}

/** Raccourcis vers l'historique et les modèles. */
export function SessionLinks() {
  const cls =
    'flex min-h-14 flex-1 items-center justify-center rounded-xl border border-v1-line bg-v1-surface px-3 text-base font-semibold text-zinc-100 no-underline active:bg-v1-surface-hi focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-400'
  return (
    <div className="mt-4 flex gap-3">
      <Link to="/seance/historique" className={cls}>
        Historique
      </Link>
      <Link to="/seance/modeles" className={cls}>
        Modèles
      </Link>
    </div>
  )
}
