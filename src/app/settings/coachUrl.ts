// Saisie de l'URL du Projet « Coach » (J9) : fonction pure. Vide = adresse par défaut (claude.ai/new).
import { isAllowedCoachUrl } from '../../domain/claude/coachUrl'

export type CoachUrlCheck = { ok: true; value: string | null } | { ok: false; error: string }

const MESSAGE = 'Colle l’adresse de ton Projet Claude : elle commence par https://claude.ai/'

export function checkCoachUrlInput(input: string): CoachUrlCheck {
  const raw = input.trim()
  if (raw === '') return { ok: true, value: null }
  if (isAllowedCoachUrl(raw)) return { ok: true, value: new URL(raw).toString() }
  return { ok: false, error: MESSAGE }
}
