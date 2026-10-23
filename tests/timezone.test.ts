import { expect, it } from 'vitest'

// vite.config.ts fixe TZ=America/Los_Angeles pour les tests : la CI (UTC) ne doit pas masquer les bugs de date locale.
it('les tests tournent dans un fuseau fixe non UTC', () => {
  expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(480)
})
