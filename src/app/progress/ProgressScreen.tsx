import { useState } from 'react'
import { buildProgressMessage } from '../../domain/claude/context'
import type { LocalDate } from '../../types'
import { ScreenSkeleton } from '../../ui/kit'
import { AskClaudeButton } from '../claude/AskClaudeButton'
import { progressData } from '../claude/inputs'
import { BackupBanner } from './BackupBanner'
import { DayDetail } from './DayDetail'
import { MeasurementsSection } from './MeasurementsSection'
import { NutritionSection } from './NutritionSection'
import { Note } from './parts'
import { RecordsSection } from './RecordsSection'
import { RegularitySection } from './RegularitySection'
import { ReviewCard } from './ReviewCard'
import { PatternsSection, StrengthSection } from './StrengthSection'
import { VolumeSection } from './VolumeSection'
import { WeighInHistory, WeightSection } from './WeightSection'
import { useScrollToHash } from '../useScrollToHash'
import { useProgress } from './useProgress'

/**
 * Écran Progrès (SPEC §8, DESIGN §4). Une question : « est-ce que je progresse ? ». Ordre : les trois chiffres et
 * le calendrier, le bilan du lundi et le rappel de sauvegarde, le poids, les records et la force, puis le reste
 * (niveau, volume, nutrition, mesures).
 * Chargé en lazy : `export default`. Les composants n'affichent que `useProgress()`.
 */
export default function ProgressScreen() {
  const { model, error } = useProgress()
  const [selected, setSelected] = useState<LocalDate | null>(null)
  // `#mensurations` : lien « Mensurations » de la feuille Ajouter.
  useScrollToHash(model !== undefined)

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-end justify-between gap-3">
        <h1 className="m-0 font-display text-display-l">Progrès</h1>
        <span className="pb-1 text-caption font-semibold text-ink-muted">12 dernières semaines</span>
      </header>
      {error ? (
        <p
          role="alert"
          className="m-0 rounded-md bg-surface px-4 py-3 text-body font-semibold text-critical shadow-card"
        >
          Impossible de lire tes données de progression.
        </p>
      ) : null}
      {model === undefined && !error ? <ScreenSkeleton cards={3} title={false} /> : null}
      {model === null ? <Note>Termine d’abord la configuration de ton profil.</Note> : null}
      {model ? (
        <>
          <RegularitySection
            headline={model.headline}
            days={model.days}
            regularity={model.regularity}
            target={model.regularityTarget}
            selectedDate={selected}
            onSelectDay={setSelected}
          />
          {model.review ? <ReviewCard review={model.review} nameOf={model.nameOf} /> : null}
          {model.backup ? <BackupBanner reminder={model.backup} /> : null}
          <WeightSection weight={model.weight} />
          <RecordsSection records={model.records} />
          <StrengthSection model={model} />
          <PatternsSection patterns={model.patterns} />
          <VolumeSection volumes={model.volumes} />
          <NutritionSection
            week={model.nutrition}
            hasTargets={model.hasNutritionTargets}
            daysElapsed={model.nutritionDaysElapsed}
          />
          <WeighInHistory rows={model.weight.recent} />
          <div id="mensurations" className="scroll-mt-4">
            <MeasurementsSection measurements={model.measurements} />
          </div>
          <AskClaudeButton
            kind="progress"
            build={(base) => buildProgressMessage({ ...base, ...progressData(model) })}
          />
          {selected !== null && (
            <DayDetail
              date={selected}
              minDate={model.days[0]?.date ?? selected}
              onSelect={setSelected}
              input={model.dayInput}
              nameOf={model.nameOf}
              onClose={() => setSelected(null)}
            />
          )}
        </>
      ) : null}
    </div>
  )
}
