import type { ReactNode } from 'react'
import { illustrations } from '../../content'
import type { Exercise } from '../../types'
import { Button, Sheet } from '../../ui'
import { formatTarget } from './format'

function List({ title, items, numbered }: { title: string; items: string[]; numbered?: boolean }) {
  if (items.length === 0) return null
  const Tag = numbered ? 'ol' : 'ul'
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-lg font-bold">{title}</h3>
      <Tag
        className={`m-0 flex flex-col gap-2 pl-5 text-base leading-relaxed text-zinc-200 ${numbered ? 'list-decimal' : 'list-disc'}`}
      >
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </Tag>
    </section>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 text-lg font-bold">{title}</h3>
      {children}
    </section>
  )
}

/** « Comment faire ? » : technique de l'exercice dans une feuille (empilable sur une autre feuille). */
export function TechniqueSheet({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const svg =
    exercise.illustration !== undefined && Object.hasOwn(illustrations, exercise.illustration)
      ? illustrations[exercise.illustration]
      : undefined
  const t = exercise.technique
  return (
    <Sheet title={`Comment faire ? ${exercise.name}`} onClose={onClose}>
      {svg ? (
        <div
          role="img"
          aria-label={exercise.name}
          className="rounded-2xl border border-v1-line bg-v1-surface-hi p-3 text-zinc-200 [&>svg]:block [&>svg]:h-auto [&>svg]:max-h-56 [&>svg]:w-full"
          // Contenu de confiance embarqué dans l'app (src/content), jamais un texte saisi.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : null}
      <p className="m-0 mt-3 text-base text-zinc-300">Objectif : {formatTarget(exercise)}</p>
      {t.setup.trim() !== '' ? (
        <Block title="Mise en place">
          <p className="m-0 text-base leading-relaxed text-zinc-200">{t.setup}</p>
        </Block>
      ) : null}
      <List title="Étapes" items={t.steps} numbered />
      <List title="Points clés" items={t.cues} />
      <List title="Erreurs fréquentes" items={t.mistakes} />
      <div className="mt-6">
        <Button variant="secondary" onClick={onClose}>
          Fermer
        </Button>
      </div>
    </Sheet>
  )
}
