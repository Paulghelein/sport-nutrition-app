import { useState } from 'react'
import { normalizeEan } from '../../domain/nutrition/off'
import type { Ean } from '../../types'
import { Button } from '../../ui/kit'
import { IntegerField } from '../../ui/kit/Fields'
import { Sheet } from '../../ui/kit/Sheet'

/** Saisie à la main du code-barres (caméra absente, refusée ou illisible). */
export function CodeSheet({ onSubmit, onClose }: { onSubmit: (ean: Ean) => void; onClose: () => void }) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <Sheet title="Saisir un code" description="Les chiffres sous le code-barres" onClose={onClose}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          const ean = normalizeEan(text)
          if (!ean) {
            setError('Code invalide : 8, 12 ou 13 chiffres, clé de contrôle comprise. Vérifie les chiffres.')
            return
          }
          onSubmit(ean)
        }}
      >
        <IntegerField
          label="Code-barres"
          value={text}
          onChange={(v) => {
            setText(v)
            setError(null)
          }}
          autoFocus
          aria-invalid={error !== null}
          hint={error ?? '8, 12 ou 13 chiffres.'}
        />
        <Button type="submit" fullWidth disabled={text === ''}>
          Chercher ce produit
        </Button>
      </form>
    </Sheet>
  )
}
