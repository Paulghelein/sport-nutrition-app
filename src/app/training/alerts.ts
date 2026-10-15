// Fin de repos : vibration (absente sur iOS Safari) et petit signal sonore généré par Web Audio (aucun fichier audio).
// Le contexte audio doit être créé ou réveillé dans un geste de l'utilisateur : `unlockAudio()` est appelée à chaque
// bouton important du mode guidé (« C'est parti », validation d'une série…).

type AudioCtor = typeof AudioContext

let context: AudioContext | null = null

function audioConstructor(): AudioCtor | undefined {
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }
  return w.AudioContext ?? w.webkitAudioContext
}

/** À appeler depuis un geste (tap) : crée le contexte audio ou le sort de la suspension. Sans effet si non supporté. */
export function unlockAudio(): void {
  try {
    const Ctor = audioConstructor()
    if (Ctor === undefined) return
    context ??= new Ctor()
    if (context.state !== 'running' && context.state !== 'closed')
      void context.resume().catch(() => undefined)
  } catch {
    // Pas de son : la vibration et l'affichage suffisent.
  }
}

/** Bips courts (880 Hz). Silencieux si le contexte n'a jamais été déverrouillé. */
export function beep(count = 3): void {
  const ctx = context
  if (ctx === null || ctx.state === 'closed') return
  try {
    const start = ctx.currentTime + 0.02
    for (let i = 0; i < count; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const t = start + i * 0.32
      osc.type = 'sine'
      osc.frequency.value = i === count - 1 ? 1175 : 880
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.25)
    }
  } catch {
    // Ignoré.
  }
}

export function vibrate(pattern: number | number[] = [220, 90, 220, 90, 340]): void {
  try {
    if ('vibrate' in navigator) navigator.vibrate(pattern)
  } catch {
    // Ignoré.
  }
}

/** Fin de repos ou de chrono : vibration (si dispo) ET son. */
export function alertEnd(): void {
  vibrate()
  beep()
}
