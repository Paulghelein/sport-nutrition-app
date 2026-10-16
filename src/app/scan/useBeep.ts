import { useEffect, useRef } from 'react'

/** Bip court de lecture : un seul AudioContext, déverrouillé au premier toucher, fermé au démontage. */
export function useBeep(): () => void {
  const ctx = useRef<AudioContext | null>(null)
  useEffect(() => {
    const unlock = () => {
      try {
        ctx.current ??= new window.AudioContext()
        void ctx.current.resume().catch(() => undefined)
      } catch {
        // pas de son : l'animation du cadre suffit
      }
    }
    document.addEventListener('pointerdown', unlock, { once: true })
    return () => {
      document.removeEventListener('pointerdown', unlock)
      void ctx.current?.close().catch(() => undefined)
      ctx.current = null
    }
  }, [])
  return () => {
    const c = ctx.current
    if (!c || c.state !== 'running') return
    const osc = c.createOscillator()
    osc.frequency.value = 880
    osc.connect(c.destination)
    osc.start()
    osc.stop(c.currentTime + 0.12)
  }
}
