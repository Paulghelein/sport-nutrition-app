import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { SessionDuration } from '../../types'
import { Card, buttonClass } from '../../ui/kit'
import { PREVIEW_PATH } from '../routes'
import { DurationPicker } from './DurationPicker'
import { loadDuration, saveDuration } from './durations'

/** Carte de l'écran Entraînement : choix du temps puis lien vers l'aperçu (durée dans l'URL). */
export function SessionLauncher() {
  const [duration, setDuration] = useState<SessionDuration>(loadDuration)
  return (
    <Card padding="large" className="flex flex-col gap-3.5">
      <p className="m-0 font-display text-title">Quelle séance aujourd’hui ?</p>
      <DurationPicker
        value={duration}
        onChange={(d) => {
          saveDuration(d)
          setDuration(d)
        }}
      />
      <Link to={`${PREVIEW_PATH}?duree=${duration}`} className={buttonClass('primary', 'normal', true)}>
        Voir la séance
      </Link>
    </Card>
  )
}
