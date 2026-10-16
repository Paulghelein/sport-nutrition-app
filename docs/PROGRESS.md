# Journal d'avancement

Tenu par l'agent chef. Une nouvelle session commence par lire ce fichier.

## Jalon en cours

**v2 commencée le 2026-10-16.** Feuille de route active : `docs/V2.md` (jalons R0 à R5, remplacent J0–J9),
référence visuelle : `docs/DESIGN.md` + `docs/design/mockups/`. La v1 (J0–J9) est terminée.

R0 — Fondations UI : terminé le 2026-10-16 (validé sans retour, « RAS » supposé : gabarit de retour non rempli).
R1 — Navigation + Aujourd'hui : terminé et **validé sur iPhone le 2026-10-16**.
Suite décidée avec l'utilisateur : (1) en parallèle, les parties moteur F3 (domain/training), F4 + photo OFF
(domain/nutrition, src/db) et F5 (domain/claude) — **fait le 2026-10-16** (eeb548d, afc94c4, c5a56c3) ; (2) écrans R2
et R4 en parallèle — **faits et validés sur iPhone le 2026-10-16** (R4 853e602, R2 e759e74) ; (3) R3 écrans
nutrition ensuite — **fait le 2026-10-16, à valider sur iPhone** ; R5 en dernier.

## Décisions prises

- 2026-10-16 (v2) : refonte de l'UI (thème clair, Archivo + Figtree auto-hébergées, lucide-react) et
  fonctionnalités F1–F6 selon `docs/V2.md` / `docs/DESIGN.md`. Seule nouvelle sortie réseau : la photo Open Food
  Facts, récupérée au moment du scan. Plus aucune couleur en dur hors des jetons.
- 2026-10-16 (R0) : cohabitation v1 / v2 pendant la refonte : les anciens jetons sombres sont renommés `v1-*`
  (`v1-bg`, `v1-surface`, `v1-surface-hi`, `v1-line`) pour libérer les noms de DESIGN.md ; les composants v2 vivent
  dans `src/ui/kit/` (les homonymes v1 de `src/ui/` restent tant que leurs écrans ne sont pas refaits, suppression
  en R5). Chaque écran passe en clair au moment de sa refonte.
- 2026-10-16 (R0) : rayons v2 nommés `rounded-ds-sm|md|lg|xl|pill` (10/16/24/32/999) car `rounded-lg` & co. de
  Tailwind sont utilisés par la v1 ; à renommer en R5. Polices : `@font-face` écrits à la main, sous-ensemble latin
  seul, Archivo en axe de graisse seulement (≈ 55 ko précachés au total). Classes utilitaires `ds-page`,
  `focus-ring`, `ds-sheet-enter`, `ds-fade-enter`.
- 2026-10-16 (R0) : MuscleMap — vue choisie par le nombre de muscles primaires visibles, égalité → vue du premier
  muscle primaire ; `glutes` allume `hips` de face et `glutes` de dos ; pas de niveau « secondaire » (illisible à
  40 px). Garde-fou `tests/noHardcodedColors.test.ts` : liste `V2_SCREENS` à étendre à chaque écran refait.
- 2026-10-16 (R1) : routes v2 centralisées dans `src/app/routes.ts` ; `/seance/*` redirigé vers `/entrainement/*`
  (chemin, query et hash conservés, `replace`, fonction pure `legacyRedirect`), mode séance = `/entrainement/seance`,
  route inconnue et fin d'onboarding → `/`. Réglages n'est plus un onglet (icône en haut à droite d'Aujourd'hui,
  `/reglages` allume l'onglet Aujourd'hui). Mise en page à onglets dans `src/app/shell/` ; mode cuisine sans barre.
- 2026-10-16 (R1) : barre du kit `fixed` flottante ; `<main>` reste le seul élément qui défile et réserve
  `--bar-clearance` en padding bas ; les zones collantes restent en `bottom-0`/`bottom-2` (le sticky se mesure depuis
  la boîte de contenu de `<main>`, padding exclu : un `bottom` incluant la barre la comptait deux fois et faisait
  monter le bouton « Terminer » sur la liste, défaut présent dès la v1, aussi en mode cuisine). Fond de
  `<main>` = canvas sur les écrans v2, `v1-bg` ailleurs (cohabitation : barre claire sur écrans v1 sombres jusqu'à leur refonte).
- 2026-10-16 (R1) : feuille Ajouter = `AddHost` (shell) ; repas ciblé `slotForNow()` à chaque ouverture. Actions vers
  l'existant : `?ouvrir=recette|libre` sur l'écran Ajouter, `?claude=1` sur le journal (ouvre l'aperçu d'envoi ; la
  copie reste derrière le tap), pesée = WeightSheet v1 ouverte après fermeture de la feuille du kit (piles `inert`
  séparées, jamais superposées), Mensurations = `/progres#mensurations`. « Créer » affiche en attendant R3 « Nouvelle
  recette » et « Nouvel aliment » (pas de bouton mort pour F4/F5) ; section « Autres » en pastilles (réponse de
  Claude, import, mensurations) pour que toutes les saisies existantes soient joignables depuis +.
- 2026-10-16 (R1) : F1 `sessionHeadline` : titre par familles de schémas (bas du corps, poussée, tirage + gainage,
  bras, mollets), raison = grands groupes travaillés, sous le bas de leur cible ET dans `plan.focus` (le moteur en
  retire les groupes fatigués), 2 au plus ; deload et « rien de fait en 7 jours » prioritaires. `MUSCLE_LABELS_FR`
  vit dans `domain/training/volume.ts` (training ne dépend pas de progress).
- 2026-10-16 (R1) : F2 `dayActivities` : records = règle de `summarizeSession` (première séance d'un exercice ≠
  record), historique complet exigé ; nutrition jugée sur kcal ET protéines, objectifs du jour = `targetWeight` +
  `nutritionTargets` (profil actuel appliqué aux jours passés, même limite que Progrès) ; pas de point avant la
  première pesée. WeekStrip non interactif en R1 (résumé du jour en R4).
- 2026-10-16 (R1) : carte « Séance du jour » = même plan que l'aperçu (`planForDuration`, même graine, édition de
  l'aperçu reprise) ; moteur et contenu en `lazy` (démarrage +3 kB gzip seulement).

- 2026-10-16 (F3) : `setType` optionnel, lu partout par `setTypeOf` (absent = `time` si durée sans reps, sinon `reps`) ;
  bloc F3 dans `src/domain/training/setTypes.ts`. AMRAP **opt-in** par drapeau de contenu `Exercise.amrap` (relecture :
  les tractions négatives devenaient éligibles) posé sur incline-push-up, push-up, bodyweight-squat, australian-row,
  pull-up ; en plus : poids du corps en reps, ni finisher ni learnUnloaded, ≥ 2 séances faites, dernier ressenti ≠ hard,
  groupe non fatigué, jamais en deload ni deux jours de suite, au plus une par séance (dernière série), superset permis.
  Max > haut × 1,3 → level_up (garde-fous J3 inchangés). Temps fixe : finishers en reps non unilatéraux (swings),
  fenêtre 45 s à 60 min (30/40 s pour les modèles plus courts) — **45 s et non 60 s** par prudence en fin de séance ;
  seuil = floor(haut × fenêtre / 45) ; +1 palier après 2 séances au seuil avec record égalé/battu ; `topStreak` partagé
  avec les séances en reps. Records timedMax séparés par fenêtre (`PersonalRecord.windowSec`) ; force : séries timedMax
  exclues des reps/durée. Remplacer un exercice AMRAP/timedMax → séries normales.
- 2026-10-16 (F4/F6) : Dexie v3 = table `foodPhotos` (hors `TABLE_NAMES`), octets en **ArrayBuffer** et non Blob :
  WebKit refuse les Blob dans IndexedDB en session éphémère (navigation privée, Playwright). Sauvegarde v3 : section
  `photos` en base64 hors `tables`, une photo doit avoir son aliment dans le fichier, v1/v2 acceptées. Photo : hôtes
  `images.`/`static.openfoodfacts.org` seulement, HTTPS, sans cookie ni referrer, `redirect: 'error'`, lecture en flux
  arrêtée à 300 ko, jpeg/png/webp (CORS vérifié : `Access-Control-Allow-Origin: *`). Aliment perso de même EAN : la photo
  lui est rattachée s'il n'en a pas. `packageG` = `product_quantity` en g (kg × 1000, ml ignorés). Recette par scan :
  étape par défaut « Recette créée par scan… » (la validation exige une étape), repas par défaut déjeuner, unité omise si
  « portions » ; `createRecipeWithFridge` en une transaction ; bornes de recette dans `src/domain/nutrition/limits.ts`.
- 2026-10-16 (F5) : `extractVideoLink` = premier lien https **valide** du texte, pistage retiré sans réencoder la query ;
  message vidéo : profil réduit aux objectifs du jour, commentaire puis un seul objet `recipe`, captures demandées plutôt
  qu'une recette inventée, fidélité à la vidéo sauf demande contraire.

- 2026-10-16 (R2) : mode séance = utilitaire `ds-session` (fond inverse) ; translucides par `on-inverse/6…18` (pas de
  nouveau jeton). Composants de séance du kit (SetPanel, RestTimer, ExerciseRow, SessionProgress, Fields, ConfirmSheet…)
  importés par chemin direct, seuls leurs types sont dans le barrel (sinon chunk `kit` du démarrage alourdi).
  L'interface ne crée jamais de série max : remplacer/ajouter un exercice dans l'aperçu donne des séries normales.
  « Commencer la séance » → « Démarrer », « Difficile » → « Dur ». −15 s / +15 s / Passer inactifs 600 ms (double tap
  sur le ressenti). Chronos en `role="timer"` silencieux, fin annoncée par `role="status"`. Compte à rebours du temps
  fixe lancé par un tap, « Saisir sans chrono » possible ; il ne survit pas à un rechargement (comme le chrono v1).
  Barre d'onglets gardée sous l'aperçu. Case « Peut finir par une série max » : poids du corps en reps, hors finisher.
- 2026-10-16 (R4) : CalendarHeatmap/DaySummarySheet hors barrel (même raison). Cases ≈ 22×19 px (maquette, 84 cases) :
  zone tactile étendue de 2 px + boutons jour précédent/suivant ≥ 44 px dans le résumé (alternative WCAG). Journée en
  cours exclue du % nutrition et affichée « Journée en cours » (pas « Hors cible »). « Ce mois » = mois calendaire ;
  % nutrition = jours évalués (journal non vide, objectif connu) sur 12 semaines. `loadCalendarData` ne borne que le
  journal (séances/pesées/exercices lus en entier : records et série). Jeton `--text-micro` (10 px). WeightSheet et
  MeasurementSheet déplacés dans `src/app/forms/` (encore v1). `PROGRESS_FOOD_DAYS` 35 → 84.
- 2026-10-16 (R3) : pictogramme d'un aliment = `foodCategory` (src/domain/nutrition/category.ts) : groupe Ciqual de tête
  affiné par mots entiers du nom (pluriel toléré ; « pomme de terre » ≠ pomme ; oléagineux → `fat` ; légumineuses et
  tubercules → `starch` ; défaut `dish`). `entryVisual` donne le visuel d'une entrée ; produit scanné = `isScannedFood`
  (EAN ou source OFF), une seule règle. Le groupe Ciqual est lu pour les seuls aliments du jour (`getCiqualFoodsByIds`).
- 2026-10-16 (R3) : photos affichées par `usePhotoUrls` (src/app/nutrition) : Blob recréé depuis `bytes`, URL recréée
  seulement si la photo change, révoquée 300 ms après remplacement et au démontage. Scan : `resolveScan`
  (src/app/scan) = cache → OFF → photo → `cacheOffFoodWithPhoto` ; photo refusée par la base → aliment réenregistré
  sans photo ; `packageG` arrondi à l'entier, aussi transmis pour un produit OFF incomplet. Caméra mutualisée :
  `useBarcodeCamera` + `useBeep` (ScanScreen, CameraView, recette par scan).
- 2026-10-16 (R3) : sections Journal · Recettes · Frigo · Courses = `NutritionTabs`, une `<nav>` de liens en pastilles
  (`aria-current`, pas d'onglets ARIA : ce sont des pages), une seule ligne défilante ; « Frigo · N » lu « Frigo, N
  portions ». « Jour suivant » permis au-delà d'aujourd'hui (comme en v1). Filet des lignes porté par le `<li>`.
- 2026-10-16 (R3) : feuille + : « Créer » = Recette par scan, Recette d'une vidéo ; « Nouvelle recette » reste sur
  Recettes (« Créer une recette »), « Nouvel aliment » sur l'écran Ajouter. Recette par scan plein écran (barre
  d'onglets masquée), bandeau caméra collant en haut (marges négatives couplées au padding de `<main>`, commenté) ;
  même code relu = « Déjà dans la liste », pas d'incrément ; brouillon `localStorage` `forge.recipeScanDraft.v1`
  validé à la relecture ; produit inconnu → « Chercher un aliment » ou « Créer l'aliment » (formulaire avec
  `retour` en liste blanche = seul `RECIPE_SCAN_PATH`, puis `?ajout=<id>`) ; création → fiche en `replace`.
- 2026-10-16 (R3) : recette d'une vidéo = écran `/nutrition/recette-video` (onglets visibles) ; pont Claude extrait
  dans `useClaudeBridge` (AskClaudeButton inchangé). Retour arrière sans historique → Nutrition.
- 2026-10-16 (R3) : « Annuler » après log d'une portion (fiche, frigo, cuisine) visible 7 s comme le toast du journal ;
  macros par portion = part des objectifs du jour ; « Ajouté au journal : N portion(s) » (unité libre non accordée).
  Variantes `flat` et `dangerSoft` de `buttonClass`. Restent v1 : RecipeFormScreen, ImportScreen, AddFoodScreen,
  FoodScreen, FoodFormScreen, RecipePickerSheet, FoodPickerSheet, LogRecipeSheet, QuantitySheet, FreeEntrySheet.

- 2026-10-16 (R3, retour iPhone « pas de mise au point au scan ») : `useBarcodeCamera` ouvre lui-même le flux
  (1920×1080 idéal) puis zxing `decodeFromStream` ; bascule vers la caméra arrière multi-objectifs iOS (libellé
  triple / double grand-angle / double + marqueur arrière, préférée dans cet ordre, id mémorisé en localStorage) qui
  passe seule en macro de près ; focus continu + zoom 2× (borné) en un seul `applyConstraints`, réglages renvoyés
  avec la lampe. Replis : toute erreur sauf un refus → caméra arrière par défaut ; id oublié seulement si l'appareil
  a disparu. Logique pure dans `src/app/scan/cameraSetup.ts`. Indication « Tiens le code à 15–20 cm ».
  Hypothèse à confirmer sur iPhone : zoom 1 = ultra grand-angle sur la caméra virtuelle.
- 2026-10-16 (process) : les agents n'utilisent plus `git add/mv/rm` (un `git mv` dans l'index partagé est parti dans le
  commit F3 et a cassé le build de main, réparé en e0e1895 ; le site en ligne n'a pas été touché). Jalons parallèles
  committés séparément depuis une copie de travail isolée.

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
- 2026-10-15 (J3) : contrats du moteur dans `src/types/engine.ts` (`EngineInput`, `SessionPlan`, `ProgressionOutcome`…).
  `ExerciseState` gagne `targetDurationSec`, `topStreak`, `tempo` (optionnels, pas de nouvelle version Dexie) ;
  `SessionExercise.tempo` (`'3-1-1'`). Niveau atteint par schéma = max(profil, plus haut niveau ayant un état).
- 2026-10-15 (J3) : cibles de volume par défaut : grands groupes 8–12 (dos 10–14 sans barre), biceps/triceps/abdos/
  mollets 4–8, avant-bras/trapèzes/lombaires 0 (comptent pour la fatigue seulement). « < 48 h » approché par
  « aujourd'hui ou hier » (≥ 4 séries en primaire → groupe mis en retrait).
- 2026-10-15 (J3) : coût d'une séance : 60 s d'installation par exercice, série = reps (milieu) × 3 s (5 s en tempo)
  ou durée, × 2 unilatéral, + repos ; superset = 20 s d'enchaînement et un seul repos (le plus long) après le tour ;
  repos ajustés × 0,7–1,5 pour coller à la durée (±10 % vérifié en scénarios). À 20 min, le 3e exercice rejoint
  parfois le superset (circuit).
- 2026-10-15 (J3) : deload = séries max(2, ⌈n/2⌉), charge inchangée, pas de hausse ni de suggestion pendant le deload ;
  séance « hard » = au moins la moitié des séries `hard`. Pas de durée +5 s ; portés : durée puis charge.
- 2026-10-15 (J3) : sécurité : une variante proposée ne dépasse jamais `profileLevel + 1` (un débutant n'atteint jamais
  le niveau 3, dont le Turkish get-up) ; pas de suggestion après 2 séances `hard`. Swings repérés par id
  (`FINISHER_SWING_IDS`, `BALLISTIC_IDS`, `LEARN_UNLOADED_IDS`).
- 2026-10-15 (J3) : `applySessionResult` n'est pas idempotente : une seule application par exercice et par séance.
- 2026-10-15 (J3) : réglages du moteur modifiés uniquement par `updateEngineSettings` (fusion transactionnelle +
  validation : deload 3–12 semaines, cibles 0–30) ; `updateSettings` n'accepte plus `engine`.
- 2026-10-15 (J3) : ne jamais importer `domain/training` par son index depuis `src/ui` ou le code de démarrage
  (le moteur entrerait dans le bundle principal).

- 2026-10-15 (J4/J5) : `<main>` est le seul élément qui défile (`min-h-0`, `relative`) ; barre d'onglets dans le flux
  (plus `fixed`). Cause du décalage J3 : les radios `sr-only` (absolute) allongeaient le document et iOS le faisait
  défiler au focus. Test e2e de non-régression (position et taille de la barre identiques sur toutes les routes).
  2026-10-16 : retour iPhone « barre trop haute » → conteneur de l'app en `fixed inset-0` (en standalone iOS,
  `height: 100%` peut s'arrêter avant le bas de l'écran).
- 2026-10-15 (J4/J5) : `registerType: 'prompt'` + `UpdatePrompt` (API service worker native, `SKIP_WAITING`,
  vérification au retour au premier plan) ; absent du mode guidé. Sheet empilable (pile, `inert`, Échap/Tab en haut).
- 2026-10-15 (J4/J5) : Dexie v2 = une seule version pour les deux jalons : table `ciqual` (référence, hors sauvegarde,
  `settings.ciqualVersion` locale jamais importée) ; upgrade qui pose `finisher`/`learnUnloaded` sur les surcharges
  d'exercices antérieures. Accès J4 dans `src/db/sessions.ts`, J5 dans `src/db/nutrition.ts`.
- 2026-10-15 (J4) : séance créée `in_progress` au départ (pas de `planned`), une seule à la fois, sauvegardée à chaque
  série (`cursor`, `restEndsAt`) ; fin = `completeSessionPlan` (pure) puis `completeSession` (transaction, garde-fou
  `progressionAppliedAt`). Corriger une séance `done` ne rejoue jamais la progression. Suggestions gardées sur la
  séance, résolues dans la transaction (`makeState`). Pas de déblocage implicite d'un niveau non atteint.
- 2026-10-15 (J4) : drapeaux `finisher` / `learnUnloaded` sur l'exercice (fin des listes d'ids) ; balistique =
  finisher du schéma hinge. TGU appris sans charge jusqu'à 2 séances au haut de la fourchette.
- 2026-10-15 (J4) : reps préremplies au bas de la fourchette puis aux reps réelles de la série précédente (valider
  sans saisir ne déclenche pas la hausse de charge). Ressenti = bouton de validation (un tap). Minuteur sur
  horodatage absolu ; iOS n'a pas de vibration : bip Web Audio (contexte déverrouillé à chaque geste).
- 2026-10-15 (J4) : modèles groupés (`TemplateBlock.group`/`kind`) ; enregistrés depuis un deload → séries d'avant le
  deload ; tonnage unilatéral × 2 ; finisher toujours en dernier.
- 2026-10-15 (J5) : Ciqual **2025** (Dataverse Anses, `npm run ciqual`), 3 398 aliments, 73 kB gzip, chunk à part chargé
  par `import()` ; version `2025-r2` ; préparé en tâche de fond 2 s après le démarrage (~0,3 s). Attribution affichée.
- 2026-10-15 (J5) : récents dérivés du journal (pas de `lastUsedAt`) ; favori sur un aliment Ciqual = surcharge complète
  (fige ses valeurs, « Rétablir l'original » garde le favori). Corriger une quantité met à l'échelle les macros figées
  (jamais relues depuis l'aliment). Modifier les valeurs d'une entrée recette/import la convertit en `free`.
- 2026-10-15 (J5) : objectifs : maintain = TDEE, cut = TDEE × (1 − surplus), ajustement ajouté à tous les objectifs ;
  +150 kcal proposé si moyenne 7 j < +0,1 kg sur 21 j (≥ 3 pesées par fenêtre), refusé si ajustement < 21 j ou > 1000.
  Écran Ajouter : on reste sur l'écran pour enchaîner (« Terminer (n ajoutés) »), jour/repas conservés partout.
- 2026-10-15 : recettes de départ (J6 anticipé) : 39 recettes `src/content/recipes/`, ids anglais, codes Ciqual
  vérifiés par test ; skyr et whey sans code Ciqual (`per100g`). Non branchées.
- 2026-10-16 (J6/J7) : pas de version Dexie 3 : les tables v1/v2 suffisaient (recipes, fridge, shoppingLists, foods
  avec index `ean`). Nouveaux champs optionnels seulement (`ShoppingItem.key`/`manual`, `FoodInput.ean`,
  `SetEntry.plannedLoadKg`) ; `migrateBackup` remplit `key` s'il manque. Accès J6 dans `src/db/recipes.ts`, J7 dans
  `src/db/foods-off.ts`. Contrats : `src/types/recipes.ts`, `scan.ts`, `progress.ts`.
- 2026-10-16 (J6) : recettes = seed + surcharges comme les exercices (`mergeRecipes`) ; favori sur une recette de départ =
  surcharge, « Modifiée » seulement si le contenu diffère ; « Rétablir l'original » garde le favori (l'écran passe
  l'original : src/db n'importe jamais src/content). Recette perso supprimée = ligne supprimée + frigo vidé (journal figé).
- 2026-10-16 (J6) : macros d'une recette jamais stockées : calculées depuis l'aliment relié, sinon Ciqual, sinon
  `per100g`, sinon « sans données » signalé (« ≈ ») ; Ciqual non chargé → bandeau et log bloqué (pas de macros fausses
  figées). Log d'une portion = `perServing × portions`, frigo décrémenté dans la même transaction (`logRecipeEntries`) ;
  « Annuler » du toast rend les portions (`undoRecipeEntries`, instantané) ; supprimer plus tard une entrée ne les rend pas.
- 2026-10-16 (J6) : courses : clé de fusion `ciqual:<code>` / `food:<id>` / `name:<nom normalisé>` ; régénérer garde les
  cochés et les articles manuels ; une liste courante. Rayons dans l'ordre d'un magasin (`AISLE_ORDER`).
- 2026-10-16 (J6) : import : texte collé (bloc ```json de Claude) ou fichier ; Zod dans un chunk chargé par l'écran ;
  valeurs françaises et anglaises acceptées ; aperçu validé avec les mêmes règles que l'enregistrement (validateurs
  injectés) ; appariement Ciqual par nom volontairement prudent (premier mot, couverture ≥ 0,5, huile/beurre/jus/fumé…
  exclus) : un faux lien fausse les macros, mieux vaut « pas de valeurs ». Types J9 (séance, exercice, préférence)
  reconnus mais « pris en charge avec le bouton Claude ».
- 2026-10-16 (J7) : Open Food Facts = seul appel réseau (`lookupOff`, fetch injecté dans src/domain : exception assumée
  à la pureté, testée avec un faux fetch) ; `credentials: 'omit'`, `no-referrer`, délai 8 s ; seul l'EAN part.
  Cache = ligne `foods` `off-<ean>` (une ligne perso avec le même EAN gagne). Produit incomplet ou peu plausible
  (P+G+L > 105 g, kcal incohérentes) → formulaire pré-rempli. UPC-A converti en EAN-13. Flux caméra gardé ouvert entre
  deux produits, coupé au démontage et en arrière-plan ; bip seulement pour une lecture caméra.
- 2026-10-16 (J8) : semaines du lundi ; minutes d'une séance plafonnées à 2 × la durée prévue ; records de l'historique
  par exercice (durée toutes charges) vs records d'une période = règles du récapitulatif ; bilan : `weight_stalled`
  uniquement si `kcalSuggestion` est active (21 j, SPEC §4.1), `weight_too_fast` sur 14 jours avec ≥ 3 pesées.
  `undoSet`/`skipSet` rétablissent la charge prévue (`plannedLoadKg`, 0 = pas de charge prévue).
- 2026-10-16 : **refonte complète de l'UI prévue après la v1** (écrans, pages, navigation, design). D'ici là : finir
  J8 et J9 avec une UI fonctionnelle et sobre, sans polissage visuel ni refactor de src/ui ; toute la logique dans
  src/domain, src/db et des hooks, pour que la refonte ne réécrive que les composants.

- 2026-10-16 (J8) : carte du lundi fermée = `settings.reviewDismissedWeek` (champ optionnel, pas de version Dexie),
  ne recule jamais, jamais dans le futur ; fusion de sauvegarde = max. Carte masquée si le profil a été créé après
  la semaine évaluée. Bilan jugé avec les objectifs de la fin de la semaine (poids à `range.to`, ajustement
  +150 accepté depuis retiré) ; `few_sessions` contre `weeklySessionsTarget`.
- 2026-10-16 (J8) : série de régularité au seuil `min(3, weeklySessionsMin)` (SPEC §8 complétée).
- 2026-10-16 (J8) : nutrition de la semaine en cours = lundi → hier (la journée en cours fausserait la moyenne).
- 2026-10-16 (J8) : couloir de poids (prise de masse seulement) ancré au lundi de la semaine d'il y a 56 jours, ou au
  dernier ajustement kcal s'il est plus récent ; départ = moyenne des 7 jours suivant la première pesée.
- 2026-10-16 (J8) : rappel de sauvegarde à 7 jours (`backupReminder`), lien `/reglages#sauvegarde`.
- 2026-10-16 (J8) : « mode sombre » = thème sombre forcé déjà en place (color-scheme, theme-color, barre d'état) ;
  la SPEC ne demande pas de mode clair : à reconsidérer avec la refonte.
- 2026-10-16 (J8) : écran Progrès en `lazy()`, Recharts dans des chunks à la demande ; données lues en une
  transaction (`loadProgressData`), modèle pur `buildProgressModel` (src/app/progress/progressModel.ts) : la refonte
  ne réécrira que les composants.
- 2026-10-16 (J9) : pas de pré-remplissage par URL (`claude.ai/new?q=` non documenté, déjà cassé par le passé, peut
  envoyer seul, contextes trop longs pour une URL) : presse-papiers uniquement.
- 2026-10-16 (J9) : séance de Claude = modèle unique `claude-plan` écrasé à chaque application puis ouvert dans
  l'aperçu ; cibles de Claude reprises, charge jamais au-dessus de la progression.

- 2026-10-16 (J9) : envoi = aperçu du message dans une feuille, puis dans le même tap `clipboard.writeText` et
  `window.open(coachUrl)` ; si Safari bloque l'ouverture, lien « Ouvrir Claude » ; si la copie échoue, texte
  sélectionnable + « Copier ». Lecture du presse-papiers seulement dans le geste « Coller », sinon zone de collage.
- 2026-10-16 (J9) : URL du Projet Coach limitée à https://claude.ai (et sous-domaines), vérifiée à la saisie, à l'import
  de sauvegarde (une sauvegarde avec une autre URL est refusée : aucun cas réel avant J9) et à l'ouverture.
- 2026-10-16 (J9) : import Claude borné (12 lignes, 30 séries, plage et pas de la kettlebell, textes et ids bornés) ;
  lignes écartées signalées à l'aperçu (niveau, matériel, masqué, exercice non coché) ; exercice homonyme d'un
  existant non coché par défaut (`duplicateOf`) ; une seule séance cochée à la fois.
- 2026-10-16 (J9) : `reachedTop` compare au moins au haut de la fourchette de l'exercice : une cible abaissée par Claude
  ne déclenche jamais de hausse de charge ou de durée.
- 2026-10-16 (J9) : `src/db/claude.ts` hors du barrel `src/db` et `resolvePlanBlocks` dans `domain/claude/plan.ts`
  (sans dépendance) : sinon le générateur de séances entrait dans le démarrage (+30 kB).

## Fait

- R3 Nutrition (2026-10-16) : journal restylé (jour ‹ ›, sections en pastilles, carte bilan, cartes par repas, FoodRow
  avec pictogramme / photo OFF / badge code-barres / fond frigo), photo OFF enregistrée au scan, contenance du paquet
  dans le formulaire d'aliment, recette par scan (F4), recette d'une vidéo (F5), feuille + branchée, Recettes, Frigo,
  Courses, fiche et mode cuisine en clair. Total : 2088 tests Vitest, 111 e2e. Démarrage 593 kB / 181,6 kB gzip (+0,6).

- R2 Entraînement (2026-10-16) : aperçu restylé, mode séance sombre (Série, Repos), séries max et temps fixe dans
  l'interface, écrans d'entraînement en clair. R4 Progrès (2026-10-16) : calendrier 12 semaines + résumé du jour
  (aussi depuis Aujourd'hui), 3 chiffres, cartes restylées. Moteur F3, F4 + photo OFF (Dexie v3), F5. Total : 1963 tests
  Vitest, 100 e2e. Entrée + chunks préchargés (js + css) : 591 kB / 181 kB gzip (180,7 kB avant R2/R4).

- R1 Navigation + Aujourd'hui (2026-10-16) : routes v2 et redirections `/seance/*`, barre d'onglets flottante,
  feuille Ajouter branchée sur toutes les saisies existantes, écran Aujourd'hui (Ta semaine / Séance du jour /
  calories), WeekStrip, `sessionHeadline` (F1) et `dayActivities` (F2). Corrigé au passage : StickyStack qui montait
  sur la liste (défaut v1), rejet non attrapé de l'AudioContext du scan. Total : 1435 tests Vitest, 93 e2e.
  Démarrage +3 kB gzip (moteur et contenu de la carte séance en lazy).

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

- J3 Moteur (2026-10-15) : moteur en fonctions pures (`src/domain/training/` : volume, niveaux, deload, estimation,
  génération, progression, charges réglables, PRNG seedé sur la date) ; aperçu de séance `/seance/apercu?duree=` (non
  enregistré), volume des 7 derniers jours sur l'écran Séance, Réglages > Moteur d'entraînement (deload, cibles par
  groupe). 518 tests Vitest (dont 85 de scénarios de semaines simulées), 25 e2e.

- J4 Séance guidée (2026-10-15) : barre d'onglets corrigée, aperçu éditable, mode guidé (minuteur, Wake Lock, son,
  ressenti, passer / remplacer / corriger, reprise après fermeture), récapitulatif avec records et suggestions,
  historique corrigeable, modèles, remarques J3 traitées. Moteur : guided / completion / summary / templates.
- J5 Journal alimentaire (2026-10-15) : script Ciqual → JSON, objectifs (Réglages), journal du jour (anneau, P/G/L,
  4 repas, copie d'hier), recherche sans accents, quantité, favoris / récents, saisie libre, aliments perso et
  surcharges Ciqual, hors ligne. Total : 873 tests Vitest, 41 e2e.
- J6 Recettes (2026-10-16) : liste et filtres, fiche, création / modification / suppression / rétablir, mode cuisine,
  frigo, liste de courses, import JSON, portion de recette dans le journal.
- J7 Scan (2026-10-16) : scan caméra, saisie manuelle, Open Food Facts + cache, création d'aliment pré-remplie,
  EAN sur les aliments, mention ODbL.
- J9 Bouton Claude (2026-10-16) : messages de contexte (journal, séance avant/après, recette, progrès, bilan), « Coller
  la réponse » (repas, recettes, séance, exercice, préférence), séance de Claude dans l'aperçu (cibles reprises,
  charges plafonnées, notes), Réglages (URL Coach, instructions à copier, « Faire évoluer l'app »).
  Total : 1301 tests Vitest, 78 e2e. Entrée + chunks préchargés 473 KiB (484 kB) / 148 KiB gzip.
- J8 Page Progrès (2026-10-16) : bilan du lundi fermable, rappel de sauvegarde, poids + couloir cible, régularité,
  force et records par exercice, niveau par schéma, volume 7 j, nutrition de la semaine, mensurations. Remarques
  traitées : `weightSeries` sans O(n²), seuil de série, `plannedLoadKg` des corrections (règle partagée `setLoads`).
  Total : 1158 tests Vitest, 68 e2e. Entrée + chunks préchargés ≈ 483 kB / 152 kB gzip.
- J8 moteur (2026-10-16) : régularité, force et records, volume vs cible, nutrition de la semaine, bilan du lundi.
  Total : 1077 tests Vitest, 66 e2e. Bundle d'entrée 480 kB / 149,5 kB gzip (recettes, Ciqual, Zod d'import, @zxing
  en chunks à la demande).

## À faire ensuite

- **Valider R3 sur iPhone**, puis R5 (finitions).
- À vérifier sur iPhone (R3) : mise au point du scan à 15–20 cm (caméra multi-objectifs, zoom 2×, ouverture pas trop
  lente, lampe) ; scan réel d'un produit → photo dans le journal, aussi en mode avion ; egg muffins par
  scan (caméra en continu, paquet entier, quantité, fermer l'app puis rouvrir : brouillon intact) puis 6 portions au
  frigo et « 6 muffins » sur la fiche ; recette depuis un vrai TikTok (« Coller le lien » et bulle iOS, copier +
  ouvrir Claude, « Coller la réponse ») ; journal lisible (pastilles sur une ligne, noms longs, photos 40 px) ; bandeau
  caméra collé en haut sous la barre d'état ; fond au rebond (body encore sombre v1) ; mode cuisine clair d'une main.
- Remarques reportées (R3, pour R5) : RecipeLogSheet (v2) / LogRecipeSheet (v1) en double (même logique, fusionner
  avec la refonte d'AddFoodScreen) ; NutritionTabs relit le frigo (2e requête sur l'écran Frigo) et duplique le style
  de PillTabs ; marges négatives des écrans pleine largeur (recette par scan, pastilles) couplées au padding de
  `<main>` ; `body` encore au fond v1 ; feuille d'AskClaudeButton toujours v1 ; écrans nutrition v1 listés ci-dessus.
- À vérifier sur iPhone (R2) : lisibilité à 1 m (panneaux 64 px, repos 76 px), une main, petit écran (SE) ; bip de fin
  du temps fixe en mode silencieux ; série max avec la consigne d'arrêt ; Facile/Correct/Dur en un tap ; aperçu avec la
  barre d'onglets sous Modifier/Démarrer ; fond sombre sans bande claire au rebond ; feuilles claires sur le mode séance.
- À vérifier sur iPhone (R4) : cases du calendrier au doigt ; jours de « Ta semaine » ouvrant le résumé ; calendrier
  juste sur l'historique réel (niveaux, record le bon jour, point nutrition) ; courbe de poids et couloir, toucher ;
  chiffres de tête ; défilement sous la barre flottante.
- Remarques reportées (R2/R4, pour R5) : AskClaudeButton et sa feuille en v1 sombre (aperçu, Progrès) ; ErrorBoundary
  v1 ; WeightSheet/MeasurementSheet (src/app/forms) en champs v1 hors garde-fou couleurs ; tailles en dur dans
  guidedViews (`text-[28px]`…) ; chrono de série en durée / compte à rebours non repris après rechargement ;
  `ExerciseRecords` sans record timedMax (historique de force) ; seuil timedMax (haut de fourchette) à ajuster après
  essai ; `dayActivities` O(R × H) (≈ 5 ms en usage réel) ; ordre des cartes de Progrès (bilan/sauvegarde en tête).

- Remarques reportées (R1) : WeekCard charge tout `loadProgressData` pour 7 jours (requête limitée en R4) ;
  `dayActivities` en O(R × H) pour les records (passage chronologique unique en R4 si lent) ; pesée depuis + : si
  la feuille est fermée pendant la lecture des pesées, la feuille de pesée s'ouvre quand même (rare) ; pas de toast
  de confirmation après une pesée depuis + ; l'invite de mise à jour `fixed` recouvre la zone collante tant qu'elle
  est affichée ; carte séance : l'édition de l'aperçu est relue au montage seulement ; chaînes '/entrainement…' en
  dur dans les écrans d'entraînement (constantes à reprendre en R2) ; « Nouvel exercice » non proposé dans +
  (création contextuelle depuis la bibliothèque) ; e2e `scan.spec.ts:144` et `:205` instables sous charge (4 workers),
  verts isolément (3/3).

- Valider R0 sur iPhone, puis R1 (navigation + Aujourd'hui).
- Remarques reportées (R0) : lien « Composants de l'interface (dev) » et page `/dev/ui` présents en production
  (retirer ou conditionner à `import.meta.env.DEV` en R5) ; le kit dépend de `src/ui/choices` (v1) pour
  `muscleLabel` : ne pas le supprimer avec les homonymes v1 en R5 ; `formatInt`/`withUnit` du kit à fusionner avec
  `src/ui/format.ts` ; Sheet du kit et Sheet v1 ont des piles `inert` séparées (ne pas les superposer) ;
  Segmented/PillTabs sans `tabIndex` 0 si `value` absente de la liste ; libellés de TabBar inactifs en `ink-muted`
  (icônes en `ink-faint`) et cibles 44 px au lieu des 36–40 px des maquettes, par choix d'accessibilité.

- Valider J8 et J9 sur iPhone (fin de la v1), puis refonte complète de l'UI.
- À vérifier sur iPhone (J6/J7) : barre d'onglets collée en bas en standalone (e2e OK, standalone non émulable) ;
  lecture réelle d'un EAN, voyant caméra éteint en quittant l'écran / en arrière-plan, message « Réglages → Apps →
  Safari → Caméra » exact, lampe (probablement absente), bip ; mode cuisine d'une main (boutons collés en bas, Wake
  Lock) ; cases de courses 64 px ; formulaire de recette long ; « Depuis le frigo » présélectionné.
- À vérifier sur iPhone (J9) : « Copier et ouvrir Claude » en un tap (Safari et standalone) ; URL d'un Projet ouverte
  dans l'app Claude ou Safari ; bulle « Coller » d'iOS et refus ; feuille d'envoi avec le clavier ouvert ; place des
  6 boutons « Demander à Claude ».
- Remarques reportées (J9) : cartes d'aperçu dupliquées entre ImportScreen et ClaudeResponseScreen (refonte) ;
  ImportScreen de Réglages appelle encore `commitImport` (recettes/repas seulement) ; Zod toujours dans le démarrage
  via les schémas de `src/db` (remarque J1) ; `scan.spec.ts:205` a échoué une fois (non reproduit en 10 essais).
- Remarques reportées (J8, pour la refonte ou plus tard) : libellés coupés (« Au- / dessus », « Poussée
  horizontale »), « 0 » au-dessus des semaines vides, tooltip du poids à vérifier au tactile, `Stat` et
  `formatNumber` dupliqués, ticks de l'axe de force ; test « pesée future » sensible au fuseau (UTC-11).
- Remarques non bloquantes reportées (J6/J7/J8) :
  - Stepper / Switch dupliqués dans src/app/recipes/parts.tsx (vs src/ui/Stepper, LibraryScreen) : mutualiser dans src/ui.
  - Filtre e2e « Importing a module script failed » global (WebKit ne donne pas l'URL du chunk).
  - Mode cuisine dans la barre d'onglets (pas plein écran comme le mode guidé) : à revoir selon le retour iPhone.
  - « Riz basmati cru » sans candidat Ciqual sûr à l'import par nom (garde ses `per100g` s'ils sont fournis).
  - Bundle d'entrée +22 kB (db/recipes, foods-off réexportés par src/db/index.ts) : avec la remarque Zod (J1).
- À vérifier sur iPhone (J4) : son en mode silencieux, Wake Lock en standalone, lisibilité à 1 m, panneau du bas
  (« Comment faire ? » parfois sous le pli), repos de 20 s entre exercices de superset sans bip distinct.
- À vérifier sur iPhone (J5) : anneau 176 px, bouton collant « Terminer », toasts de 7 s, noms Ciqual longs,
  « Copier d'hier » visible même si le repas du jour est rempli.
- Remarques non bloquantes reportées (J4/J5) :
  - Profil repassé de 2 à 1 avec un état niveau 3 : niveau conservé (choix assumé : les niveaux gagnés restent).
  - Aperçu édité en sessionStorage : charges figées au moment de l'édition (risque faible, même jour).
  - `CiqualFood.search` stocké mais l'index renormalise (les `Food` fusionnés n'ont pas le champ).
  - Bundle d'entrée 458 kB / 143 kB gzip (+23 kB depuis J3) : à surveiller avec la remarque Zod (J1).
- Remarques non bloquantes reportées (J3) :
  - Débutant : pectoraux souvent sous la cible à 5 séances/sem. (un seul exercice niveau 1) ; 5 × 60 min dépasse
    les cibles (excès inévitable).
  - Prettier : 23 fichiers antérieurs à J3 non formatés (`npx prettier --list-different src e2e`).
  - e2e : les `ChoiceGroup` (radios `sr-only`) ne se cochent pas avec `.check()` ; cliquer l'étiquette.
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
  - `tests/format.test.ts` (cas Infinity) dépend de la base partagée : tester `checkWeighIn` directement.
  - Couverture Vitest chiffrée : `@vitest/coverage-v8` non installé (à décider).
- Remarques non bloquantes du reviewer reportées (J0) :
  - `tseslint.config()` déprécié → migrer vers `defineConfig` de `eslint/config`.
  - CI : actions GitHub en Node 20 dépréciées (checkout@v4, setup-node@v4…) → passer aux versions majeures suivantes.
  - Envisager Playwright en CI.

## Points ouverts / questions pour l'utilisateur

_(aucun — accent orange et icône « F » validés avec J0)_
