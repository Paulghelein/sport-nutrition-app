# Journal d'avancement

Tenu par l'agent chef. Une nouvelle session commence par lire ce fichier.

## Jalon en cours

J2 — Exercices : **terminé le 2026-10-15, en attente de validation sur iPhone**.
Prochain : J3 — Moteur (après validation de J2).

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
- 2026-10-15 (J1) : identifiants de code en anglais partout, y compris les énumérations (`MealSlot` breakfast/lunch/
  dinner/snack, `Aisle`, `MuscleGroup`) ; l'import Claude (J9) convertira les valeurs françaises d'IMPORT_FORMAT.md.
- 2026-10-15 (J1) : dates locales `YYYY-MM-DD` (`LocalDate`) pour les jours, ISO complet pour les horodatages ;
  utilitaires purs dans `src/domain/shared/dates.ts` (seule source, aussi utilisée par src/db).
- 2026-10-15 (J1) : profil, matériel et réglages = lignes uniques d'id `'me'`. Âge dérivé de la date de naissance.
  Une pesée par jour au plus (index unique `&date`, ajout à une date existante = remplacement).
- 2026-10-15 (J1) : contenu de départ (exercices, recettes) livré dans `src/content/` ; la base ne stocke que
  les créations (`source: 'user'`) et les surcharges (`source: 'seed'`, même id, `deleted` pour masquer).
  « Rétablir l'original » = supprimer la surcharge. Les aliments Ciqual seront chargés en base (SPEC §4.4).
- 2026-10-15 (J1) : règles de validation uniques dans `src/db/validation.ts` (fonctions pures → message FR ou null),
  utilisées à la saisie, à l'onboarding étape par étape et à l'import de sauvegarde. Bornes : âge 14–100 ans,
  taille 100–250 cm, poids 30–250 kg, pas de pesée future (import : tolérance +1 jour), séances/semaine 1–7.
- 2026-10-15 (J1) : sauvegarde = schémas Zod stricts par table (clés vérifiées à la compilation), une transaction,
  `replace` / `merge` par clé primaire ; `onboardingCompleted` = « un profil est présent » après import.
  Version future refusée ; `migrateBackup` prévu sur le JSON brut.
- 2026-10-15 (J1) : export iOS en deux temps (« Préparer » puis « Enregistrer ou partager ») pour appeler
  `navigator.share` dans le geste utilisateur ; repli téléchargement avec confirmation manuelle « C'est enregistré ».
- 2026-10-15 (J1) : `navigator.storage.persist()` demandé au démarrage (limite l'éviction des données par iOS).
- 2026-10-15 (J2) : cible d'un exercice = exactement un de `repRange` / `durationRange`. `loadType` décrit la charge :
  `timed` = gainage au poids du corps (durée), `bodyweight` = reps, `kettlebell` = reps ou durée (portés chargés).
  Le moteur J3 devra faire porter la double progression sur la durée pour les portés, puis la charge.
- 2026-10-15 (J2) : 45 exercices de départ (`src/content/exercises/<pattern>.ts`), ids anglais kebab-case **figés** ;
  SVG dans `src/content/illustrations/<id>.svg` chargés par `import.meta.glob(?raw)`, injectés (contenu de confiance
  embarqué uniquement). Contenu et SVG dans un chunk séparé (`useLibrary`, 15 kB gzip), écrans en `lazy()`.
  Matériel requis = strict minimum (pompes inclinées sur une table → aucun) ; au moins un exercice de niveau 1 par
  schéma disponible avec le matériel par défaut (testé). Exercices unilatéraux : série complète d'un côté puis de l'autre.
- 2026-10-15 (J2) : fusion seed + base + préférences par la fonction pure `mergeLibrary` (src/domain/training/library.ts).
  Suppression d'un exercice de départ = surcharge `deleted` (restaurable, « Exercices supprimés ») ; suppression d'un
  exercice perso = suppression logique (`deleted: true`, préférence et état gardés) pour que l'historique J4 garde un nom.
  Enregistrer sans changement ne crée pas de surcharge.
- 2026-10-15 (J2) : routes `/seance/exercices[/nouveau|/supprimes|/:id|/:id/modifier]` ; filtres dans l'URL ;
  brouillon de formulaire en `sessionStorage`. `Button` a une prop `width` (`w-full` n'est plus forcé).
- 2026-10-15 (J2) : illustrations générées par un petit script Python à squelette articulé (hors dépôt) pour 24
  dessins ; les retoucher = éditer les SVG directement.

## Fait

- J0 Socle (2026-10-15) : projet Vite + React + TS strict, Tailwind, PWA « Forge » (manifest FR, standalone,
  précache complet, autoUpdate), 4 onglets vides avec safe areas, dépendances de la stack installées, arborescence
  avec `index.ts` minimal, tests (Vitest : smoke + fake-indexeddb ; Playwright : onglets sur iPhone 13, hors ligne),
  dépôt public https://github.com/Paulghelein/sport-nutrition-app, déploiement GitHub Actions → Pages.
  URL : https://paulghelein.github.io/sport-nutrition-app/

- J1 Données et profil (2026-10-15) : types partagés des 15 tables (`src/types/`), base Dexie v1 + repositories
  + validation + export/import JSON (`src/db/`), dates et tendance du poids (`src/domain/shared`, `src/domain/progress`),
  onboarding en 6 étapes, bloc Poids (résumé, courbe pesées + moyenne 7 j, historique modifiable), Réglages
  (profil, matériel, sauvegarde). 93 tests Vitest, 11 e2e (onboarding, pesées, sauvegarde aller-retour, hors ligne).

- J2 Exercices (2026-10-15) : 45 exercices sur les 10 schémas × 3 niveaux de SPEC §3.1 (+ tractions négatives,
  rowing australien, tractions), fiches techniques et SVG ; bibliothèque (recherche sans accents, filtres schéma /
  niveau / matériel / masqués), fiche (illustration, muscles, prescription, technique, variantes, vidéo, préférence),
  création / modification / suppression / restauration d'exercices, préférences liked/neutral/disliked/hidden.
  308 tests Vitest (dont 139 d'intégrité du contenu), 22 e2e.

## À faire ensuite

- Validation J2 sur iPhone, puis J3 (Moteur).
- Remarques non bloquantes reportées (J2) :
  - Illustrations les plus faibles : pompes archer, dead bug, pompes diamant (≈ pompes) ; kettlebells en cercle vide
    sur les dessins d'origine vs disque plein sur les redessinés (harmoniser si besoin).
  - `box-goblet-squat` demande une chaise mais n'exige pas `bench` (un canapé suffit) : à revoir si gênant.
  - Bundle principal 435 kB (137 kB gzip, +19 kB) : barrels `src/ui` / `src/db` ; le chunk `useLibrary` est chargé
    dès `/seance` (compteur). À traiter avec la remarque Zod de J1.
  - J3 : ne pas proposer le Turkish get-up à un débutant sans critère validé ; double progression en durée pour les portés.
  - Pas encore d'écran pour restaurer un exercice perso supprimé.
- Remarques non bloquantes du reviewer reportées (J1) :
  - `Sheet` : une seule feuille montée à la fois ; gérer l'empilement (compteur `inert`, pile pour Échap/Tab) quand
    J4/J6 en auront besoin.
  - Zod et le code de sauvegarde restent dans le bundle principal (~415 kB bruts, ~131 kB gzip) car
    `src/db/repositories.ts` importe les schémas : sortir Zod du démarrage (validateurs sans Zod, `import()` du module
    backup) si le démarrage dépasse 2 s.
  - `weightSeries` en O(n²) : fenêtre glissante si les pesées dépassent quelques centaines.
  - `weightTargetCorridor` prêt mais non affiché (J8).
  - `tests/format.test.ts` (cas Infinity) dépend de la base partagée : tester `checkWeighIn` directement.
  - Couverture Vitest chiffrée : `@vitest/coverage-v8` non installé (à décider).
  - Bornes métier non contrôlées à l'import pour les tables encore inutilisées (aliments, journal…) : à ajouter avec
    leurs jalons.
- Remarques non bloquantes du reviewer reportées (J0) :
  - Avant J4 (séance guidée) : `registerType: 'autoUpdate'` peut recharger la page lors d'un nouveau déploiement ;
    persister l'état de séance dans Dexie à chaque série (déjà prévu SPEC) et envisager `registerType: 'prompt'`.
  - `tseslint.config()` déprécié → migrer vers `defineConfig` de `eslint/config`.
  - CI : actions GitHub en Node 20 dépréciées (checkout@v4, setup-node@v4…) → passer aux versions majeures suivantes.
  - Envisager Playwright en CI.

## Points ouverts / questions pour l'utilisateur

_(aucun — accent orange et icône « F » validés avec J0)_
