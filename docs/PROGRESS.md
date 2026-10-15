# Journal d'avancement

Tenu par l'agent chef. Une nouvelle session commence par lire ce fichier.

## Jalon en cours

J0 — Socle : **terminé et validé sur iPhone le 2026-10-15**.
Prochain : J1 — Données et profil.

## Décisions prises

- 2026-10-15 : stack et architecture fixées (voir CLAUDE.md, docs/SPEC.md).
- 2026-10-15 : utilisateur homme (formule BMR homme).
- 2026-10-15 : dépôt GitHub public pour l'instant (GitHub Pages gratuit) ; passage en privé possible plus tard avec GitHub Pro.
- 2026-10-15 : ajout de la personnalisation complète (SPEC §9), de la page Progrès (§8) et du bouton Claude (§10, jalon J9).
- 2026-10-15 (J0) : versions — React 18.3 (imposé), Vite 8, TypeScript 6.0 (TS 7 pas encore supporté par
  typescript-eslint), Tailwind 4 via `@tailwindcss/vite` (pas de tailwind.config, thème dans `src/index.css`),
  ESLint 10 flat config, Vitest 5, Playwright 1.64, Zod 4, Dexie 4, React Router 7.
- 2026-10-15 (J0) : routage `BrowserRouter` avec `basename = import.meta.env.BASE_URL` ; sur GitHub Pages,
  `dist/404.html` est une copie d'`index.html` (plugin `spaFallback404` dans vite.config.ts) pour les liens profonds ;
  hors ligne, la `NavigationRoute` du service worker sert `index.html`.
- 2026-10-15 (J0) : thème sombre forcé (`#0b0b0f`, accent orange) ; icônes générées depuis `public/icon.svg`
  par `npm run icons` (@vite-pwa/assets-generator).
- 2026-10-15 (J0) : `npm run build` = `vite build` seul ; le typecheck est une étape séparée (`npm run typecheck`, aussi en CI).
- 2026-10-15 (J0) : Playwright — projet « iPhone 13 » (WebKit) pour les parcours ; projet « chromium-offline » pour le
  test hors ligne (les service workers ne sont fiables que sous Chromium dans Playwright). Playwright ne tourne pas en CI.
- 2026-10-15 (J0) : Prettier ne formate pas le Markdown (`*.md` et `.claude/` dans .prettierignore).

## Fait

- J0 Socle (2026-10-15) : projet Vite + React + TS strict, Tailwind, PWA « Forge » (manifest FR, standalone,
  précache complet, autoUpdate), 4 onglets vides avec safe areas, dépendances de la stack installées, arborescence
  avec `index.ts` minimal, tests (Vitest : smoke + fake-indexeddb ; Playwright : onglets sur iPhone 13, hors ligne),
  dépôt public https://github.com/Paulghelein/sport-nutrition-app, déploiement GitHub Actions → Pages.
  URL : https://paulghelein.github.io/sport-nutrition-app/

## À faire ensuite

- J1 (Données et profil).
- Remarques non bloquantes du reviewer reportées :
  - Avant J4 (séance guidée) : `registerType: 'autoUpdate'` peut recharger la page lors d'un nouveau déploiement ;
    persister l'état de séance dans Dexie à chaque série (déjà prévu SPEC) et envisager `registerType: 'prompt'`.
  - Couleur `#0b0b0f` dupliquée (App, TabBar, index.css, vite.config, index.html) → token Tailwind `@theme`.
  - `tseslint.config()` déprécié → migrer vers `defineConfig` de `eslint/config`.
  - CI : actions GitHub en Node 20 dépréciées (checkout@v4, setup-node@v4…) → passer aux versions majeures suivantes.
  - Envisager Playwright en CI.

## Points ouverts / questions pour l'utilisateur

_(aucun — accent orange et icône « F » validés avec J0)_
