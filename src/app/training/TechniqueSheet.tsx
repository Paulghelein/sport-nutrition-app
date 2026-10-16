import type { ReactNode } from 'react'
import { illustrations } from '../../content'
import type { Exercise } from '../../types'
import { Button, Sheet } from '../../ui/kit'
import { formatTarget } from './format'

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 font-display text-title">{title}</h3>
      {children}
    </section>
  )
}

function List({ title, items, numbered }: { title: string; items: string[]; numbered?: boolean }) {
  if (items.length === 0) return null
  const Tag = numbered ? 'ol' : 'ul'
  return (
    <Block title={title}>
      <Tag className={`m-0 flex flex-col gap-2 pl-5 text-body ${numbered ? 'list-decimal' : 'list-disc'}`}>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </Tag>
    </Block>
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
          className="rounded-ds-md bg-canvas p-3 text-ink [&>svg]:block [&>svg]:h-auto [&>svg]:max-h-56 [&>svg]:w-full"
          // Contenu de confiance embarqué dans l'app (src/content), jamais un texte saisi.
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : null}
      <p className="m-0 text-body text-ink-muted">Objectif : {formatTarget(exercise)}</p>
      {t.setup.trim() !== '' ? (
        <Block title="Mise en place">
          <p className="m-0 text-body">{t.setup}</p>
        </Block>
      ) : null}
      <List title="Étapes" items={t.steps} numbered />
      <List title="Points clés" items={t.cues} />
      <List title="Erreurs fréquentes" items={t.mistakes} />
      <Button variant="secondary" fullWidth onClick={onClose}>
        Fermer
      </Button>
    </Sheet>
  )
}
