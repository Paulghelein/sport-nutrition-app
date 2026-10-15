# CLAUDE.md — App Sport & Nutrition (PWA personnelle)

Ce fichier est la mémoire du projet. Toute session (chef ou sous-agent) le lit en premier.

## Le projet en une phrase

PWA iPhone mono-utilisateur qui génère des séances de renforcement (kettlebell réglable + poids du corps)
adaptées au temps disponible et au volume de la semaine, et qui suit l'alimentation pour une prise de masse.

## Documents de référence (à lire selon la tâche)

- `docs/SPEC.md` — cahier des charges complet (fonctionnalités, algorithmes, modèle de données).
- `docs/ROADMAP.md` — jalons J0 à J9 et critères de validation.
- `docs/PROGRESS.md` — journal d'avancement. **Le lire au début de chaque session, le mettre à jour après chaque tâche.**
- `docs/IMPORT_FORMAT.md` — format JSON des recettes et repas importés.

## Stack (ne pas changer sans accord explicite)

React 18 + TypeScript (strict) + Vite · Tailwind CSS · vite-plugin-pwa · Dexie.js (IndexedDB) · React Router ·
Recharts · @zxing/browser · Zod · Vitest · Playwright · déploiement GitHub Pages via GitHub Actions.

## Arborescence

```
src/
  types/            contrats partagés (écrits par le chef en premier)
  db/               Dexie, schéma, migrations, export/import        -> data-layer
  domain/training/  bibliothèque, génération, progression, volume   -> training-engine
  domain/nutrition/ objectifs, macros, Ciqual, OFF, courses         -> nutrition-engine
  domain/progress/  tendances, records, bilan hebdo                 -> nutrition-engine (nutrition) / training-engine (force, volume)
  domain/claude/    messages de contexte, parsing des réponses      -> nutrition-engine
  content/          fiches exercices, recettes JSON, SVG            -> content-writer
  ui/  app/         écrans, composants, navigation, PWA             -> ui-builder
tests/  e2e/        tests unitaires et Playwright                   -> qa-tester
docs/               spécifications et suivi                         -> chef
```

## Rôle de la session principale : l'agent chef

1. Lire `docs/PROGRESS.md` puis le jalon en cours dans `docs/ROADMAP.md`.
2. Découper le jalon en tâches courtes (une tâche = un agent = un dossier).
3. Écrire ou mettre à jour d'abord les types partagés dans `src/types/`.
4. Déléguer aux sous-agents de `.claude/agents/` ; en parallèle seulement si les dossiers ne se recoupent pas.
5. Faire passer chaque résultat par `qa-tester` puis `reviewer`. Renvoyer les corrections à l'agent concerné.
6. Committer (messages en français, format `feat(training): ...`), pousser, mettre à jour `docs/PROGRESS.md`.
7. **En fin de jalon : s'arrêter**, résumer ce qui a été fait, et demander à l'utilisateur de tester sur son iPhone.

Le chef écrit peu de code lui-même : il planifie, délègue, intègre et vérifie.

## Règles de code

- TypeScript strict, pas de `any`. Fonctions pures pour toute la logique métier (`src/domain/`), sans accès à Dexie ni au DOM.
- La logique métier est testée unitairement (Vitest) avant d'être branchée sur l'interface.
- Interface mobile d'abord (viewport 390×844), cibles tactiles ≥ 44 px, utilisable d'une main pendant une séance.
- Textes de l'interface en français. Identifiants de code en anglais.
- Aucun appel réseau sauf Open Food Facts lors d'un scan. Aucune clé d'API, aucun secret dans le dépôt.
- Les macros d'une entrée du journal sont figées au moment du log.
- Tout contenu est modifiable par l'utilisateur dans l'app (SPEC §9) : jamais de donnée « en dur » non éditable.
- Le pont avec Claude (SPEC §10) n'envoie rien sans action explicite de l'utilisateur.
- Toute modification du schéma Dexie passe par une nouvelle version + migration.

## Commandes

- `npm run dev` — serveur de dev (accessible sur le réseau local pour tester sur l'iPhone : `--host`)
- `npm run test` — Vitest · `npm run e2e` — Playwright · `npm run build` — build de production
- `npm run lint` / `npm run typecheck`

## Définition de « terminé » pour une tâche

Typecheck OK, lint OK, tests verts, relu par `reviewer` sans point bloquant, `docs/PROGRESS.md` à jour.

## L'utilisateur

Étudiant à l'école 42, bases de code solides. Débutant en musculation, objectif prise de masse, iPhone.
Expliquer brièvement les choix techniques non évidents dans les résumés de fin de tâche.
