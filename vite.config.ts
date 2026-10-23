import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'

// L'app est servie par GitHub Pages sous https://<user>.github.io/sport-nutrition-app/
const base = '/sport-nutrition-app/'
// = --color-canvas de src/index.css (vérifié par tests/noHardcodedColors.test.ts).
const themeColor = '#e8e6e1'

// GitHub Pages : une URL inconnue renvoie 404.html, qui doit être l'app (fallback SPA).
function spaFallback404(): Plugin {
  let outDir = 'dist'
  return {
    name: 'spa-fallback-404',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle: {
      order: 'post',
      handler() {
        copyFileSync(resolve(outDir, 'index.html'), resolve(outDir, '404.html'))
      },
    },
  }
}

// Tests dans un fuseau fixe non UTC (la CI est en UTC) : les bugs de date locale/UTC ne passent plus inaperçus.
// Posé ici, avant le démarrage des workers Vitest, qui héritent de l'environnement.
if (process.env.VITEST || process.argv.some((a) => a.includes('vitest'))) {
  process.env.TZ = 'America/Los_Angeles'
}

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt' : une nouvelle version attend l'accord de l'utilisateur (UpdatePrompt) au lieu de recharger en pleine séance.
      registerType: 'prompt',
      injectRegister: 'auto',
      manifest: {
        id: base,
        name: 'Forge',
        short_name: 'Forge',
        description: 'Séances de renforcement et suivi nutrition pour la prise de masse.',
        lang: 'fr',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: themeColor,
        background_color: themeColor,
        scope: base,
        start_url: base,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,json,woff2}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
    spaFallback404(),
  ],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
    // Le garde-fou des couleurs lit src/index.css en texte brut (?raw) : sans cette option Vitest le vide.
    css: { include: [/src\/index\.css/] },
  },
})
