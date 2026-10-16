import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, linkButtonClass } from '../../ui'
import type { SessionDuration } from '../../types'
import { PREVIEW_PATH } from '../routes'
import { DurationPicker } from './DurationPicker'
import { loadDuration, saveDuration } from './durations'

/** Carte de l'écran Séance : choix du temps puis lien vers l'aperçu (durée dans l'URL). */
export function SessionLauncher() {
  const [duration, setDuration] = useState<SessionDuration>(loadDuration)
  return (
    <Card className="mt-5">
      <p className="mb-3 text-lg font-semibold">Quelle séance aujourd’hui ?</p>
      <DurationPicker
        value={duration}
        onChange={(d) => {
          saveDuration(d)
          setDuration(d)
        }}
      />
      <Link to={`${PREVIEW_PATH}?duree=${duration}`} className={`${linkButtonClass('primary')} mt-4`}>
        Voir la séance
      </Link>
    </Card>
  )
}
