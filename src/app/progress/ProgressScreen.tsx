import { buildProgressMessage } from '../../domain/claude/context'
import { ErrorNote } from '../../ui'
import { AskClaudeButton } from '../claude/AskClaudeButton'
import { progressData } from '../claude/inputs'
import { BackupBanner } from './BackupBanner'
import { MeasurementsSection } from './MeasurementsSection'
import { NutritionSection } from './NutritionSection'
import { RegularitySection } from './RegularitySection'
import { ReviewCard } from './ReviewCard'
import { StrengthSection } from './StrengthSection'
import { VolumeSection } from './VolumeSection'
import { WeightSection } from './WeightSection'
import { useScrollToHash } from '../useScrollToHash'
import { useProgress } from './useProgress'

/** Écran Progrès (SPEC §8). Chargé en lazy : `export default`. Les composants n'affichent que `useProgress()`. */
export default function ProgressScreen() {
  const { model, error } = useProgress()
  // `#mensurations` : lien « Mensurations » de la feuille Ajouter.
  useScrollToHash(model !== undefined)

  return (
    <>
      <h1 className="text-3xl font-bold">Progrès</h1>
      {error ? (
        <div className="mt-4">
          <ErrorNote>Impossible de lire tes données de progression.</ErrorNote>
        </div>
      ) : null}
      {model === undefined && !error ? <div className="mt-6 h-64" aria-busy="true" /> : null}
      {model === null ? (
        <p className="mt-6 text-base text-zinc-300">Termine d’abord la configuration de ton profil.</p>
      ) : null}
      {model ? (
        <>
          {model.review ? <ReviewCard review={model.review} nameOf={model.nameOf} /> : null}
          {model.backup ? <BackupBanner reminder={model.backup} /> : null}
          <WeightSection weight={model.weight} />
          <RegularitySection regularity={model.regularity} target={model.regularityTarget} />
          <StrengthSection model={model} />
          <VolumeSection volumes={model.volumes} />
          <NutritionSection
            week={model.nutrition}
            hasTargets={model.hasNutritionTargets}
            daysElapsed={model.nutritionDaysElapsed}
          />
          <div id="mensurations">
            <MeasurementsSection measurements={model.measurements} />
          </div>
          <div className="mt-8">
            <AskClaudeButton
              kind="progress"
              build={(base) => buildProgressMessage({ ...base, ...progressData(model) })}
            />
          </div>
        </>
      ) : null}
    </>
  )
}
