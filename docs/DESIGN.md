# DESIGN.md — Refonte de l'interface (v2)

Source de vérité visuelle de Forge v2. Les maquettes validées par l'utilisateur sont dans `docs/design/mockups/*.dc.html`
(HTML autonome, styles en ligne : y lire les valeurs exactes). En cas d'écart, ce document l'emporte sur les maquettes,
et la logique existante (`src/domain`, `src/db`) l'emporte sur les deux : la refonte ne réécrit que l'interface.

## 1. Principes

- **Un écran, une question.** Aujourd'hui : « qu'est-ce que je fais aujourd'hui ? ». Nutrition : « où en sont mes calories ? ».
  Progrès : « est-ce que je progresse ? ». Ce qui ne répond pas à la question de l'écran va ailleurs.
- **Le chiffre d'abord** : chaque carte s'ouvre sur son chiffre clé en Archivo.
- **Visuel avant texte** : miniature musculaire pour chaque exercice, pictogramme pour chaque aliment générique,
  photo Open Food Facts pour chaque produit scanné.
- **Toute saisie passe par le bouton +** (feuille « Ajouter »).
- **Clair partout, sombre en séance** : le mode séance (série, repos) est sur fond `inverse`.
- **Une seule couleur d'accent (`ember`) visible au repos par écran**, hors anneau/barre de calories.

## 2. Jetons (tokens)

À déclarer dans `src/index.css` via `@theme` (Tailwind 4) sous ces noms exacts ; plus aucune couleur en dur dans les composants.

### Couleurs (thème unique, clair)

| Token | Valeur | Usage |
|---|---|---|
| canvas | #e8e6e1 | fond de toutes les pages |
| surface | #f5f4f1 | cartes, lignes, champs |
| surface-raised | #fbfaf8 | feuilles du bas, barre d'onglets |
| surface-sunken | #dcd9d2 | pistes de barres, fonds de miniatures, case vide du calendrier |
| line | #d3cfc7 | séparateurs dans une carte (jamais de bordure de carte) |
| ink | #1d1c1a | texte principal (13,6:1 sur canvas) ; texte sur ember |
| ink-muted | #5f5b54 | texte secondaire (5,4:1 sur canvas) |
| ink-faint | #8a857c | icônes inactives uniquement, jamais de texte |
| inverse | #1d1c1a | fond du mode séance |
| on-inverse | #f5f4f1 | texte sur inverse |
| on-inverse-muted | #a9a49b | texte secondaire sur inverse (6,9:1) |
| ember | #ec6a2e | accent Forge : bouton +, action principale, calories, exercice en cours. Texte dessus = ink, jamais blanc |
| ember-ink | #a8410f | ember lu comme texte/lien sur clair (4,9:1) |
| ember-soft | #f6d2bd | fond d'un élément sélectionné |
| protein / carbs / fat | #2f5fd0 / #a87c0e / #2e8a6e | macros, toujours avec leur mot ou P/G/L ; ne portent jamais de texte |
| heat-0 … heat-4 | #dcd9d2 #f6c7a8 #f09a62 #ec6a2e #a8410f | calendrier : rien, courte, normale, longue, record |
| good / warning / critical | #2f7a3e / #9a5a06 / #b3261e | états, toujours avec un mot ou une icône |
| focus | #2f5fd0 | anneau de focus 2 px plein, décalé de 2 px |

Translucides du mode séance : panneaux `rgba(245,244,241,0.06–0.10)`, pistes `rgba(245,244,241,0.12–0.18)`.

### Typographie

- **Archivo** (titres et TOUS les chiffres, `tabular-nums`) et **Figtree** (texte).
- **Hors ligne obligatoire** : ne PAS charger Google Fonts par CDN. Installer `@fontsource-variable/archivo` et
  `@fontsource-variable/figtree` (fichiers précachés par le service worker).

| Style | Police | Taille / interligne | Graisse | Usage |
|---|---|---|---|---|
| display-xl | Archivo | 64/64 (76 pour le minuteur) | 800, -0.02em | charge, reps, minuteur en séance |
| display-l | Archivo | 34/38 | 800, -0.015em | titre d'écran (un par écran) |
| number-l | Archivo | 28/32 | 700–800 | chiffre clé d'une carte |
| title | Archivo | 20–22/26 | 700 | titre de carte |
| headline | Figtree | 16–17/22 | 600 | nom d'exercice / d'aliment |
| body | Figtree | 15/22 | 400 | texte courant |
| caption | Figtree | 12–13/18 | 500 | détails, ink-muted |
| label | Figtree | 11/14 | 700, capitales, +0.06em | étiquettes au-dessus d'un chiffre |

### Espacement, rayons, ombres

- Espacements : 4, 8, 12, 16, 20, 24, 32, 48 px. Marge latérale des écrans 16, écart entre cartes 14–24, padding de carte 16–20.
- Rayons : 10 (miniatures, cases), 16 (lignes, tuiles), 24 (cartes), 32 (feuilles, barre d'onglets), pastille 999.
- Ombres : `card` = `0 1px 2px rgba(29,28,26,.06), 0 6px 18px rgba(29,28,26,.05)` ; `float` = `0 10px 30px rgba(29,28,26,.16)`.
- Cibles tactiles ≥ 44 px ; 64 px en mode séance.

## 3. Navigation (nouvelle architecture)

Barre d'onglets flottante : **Aujourd'hui · Entraînement · [+] · Nutrition · Progrès**. Réglages derrière l'icône en haut
à droite d'Aujourd'hui. Barre masquée en mode séance et en mode cuisine.

| Route | Écran | Remplace |
|---|---|---|
| `/` | Aujourd'hui | (nouveau ; `/seance` n'est plus l'accueil) |
| `/entrainement` | Aperçu de séance + bibliothèque, historique, modèles (sous-sections) | `/seance/*` |
| `/entrainement/seance` | Mode séance (série ↔ repos), plein écran sombre | mode guidé actuel |
| `/nutrition` | Journal du jour, onglets Journal · Recettes · Frigo · Courses | `/nutrition/*` |
| `/nutrition/recette-scan` | Recette par scan | (nouveau) |
| `/progres` | Progrès | `/progres` |
| `/reglages` | Réglages | `/reglages` |

Garder des redirections depuis les anciennes routes. Détails : glissent depuis la droite, retour en haut à gauche.
Actions courtes (quantité, pesée, choix) : feuille du bas. Transitions 200 ms ease-out ; `prefers-reduced-motion` → fondu 100 ms.

## 4. Écrans (voir la maquette du même nom)

- **Aujourd'hui** (`Main.dc.html`) : date + titre ; carte « Ta semaine » (7 cases heat + point nutrition, série en
  semaines, séances faites/cible) ; carte « Séance du jour » (titre et raison générés par le moteur, miniatures des
  exercices, sélecteur 20/30/45/60 min, bouton vers l'aperçu) ; carte calories (anneau 96 px + 3 barres de macros,
  touche → Nutrition).
- **Ajouter** (`Ajouter.dc.html`) : feuille du bas. Tuiles : Scanner, Chercher, Recette ou frigo, Décrire à Claude,
  Saisie rapide, Pesée. Section « Créer » : Recette par scan, Recette d'une vidéo. Bouton sombre « Démarrer une séance ».
  Le repas ciblé est déduit de l'heure, affiché, modifiable.
- **Nutrition** (`Nutrition.dc.html`) : jour ‹ › ; onglets en pastilles ; carte bilan (kcal / objectif, barre ember,
  3 macros) ; une carte par repas avec total ; lignes aliment (visuel 40 px, nom, quantité + P/G/L, kcal).
  Produit scanné : badge code-barres sur le visuel. Portion depuis le frigo : visuel sur `ember-soft`.
- **Recette par scan** (`RecetteScan.dc.html`) : caméra en bandeau sombre en haut, ouverte en continu ; liste des
  ingrédients (visuel, nom, source « scanné · paquet entier » / Ciqual, pastille de quantité éditable) ; + Chercher un
  aliment / Saisir un code ; feuille du bas : « Ça donne N [unité] » avec −/+, macros par portion, bouton
  « Créer et mettre N portions au frigo ».
- **Progrès** (`Progres.dc.html`) : 3 chiffres (série, séances du mois, % jours nutrition OK) ; calendrier 12 semaines ;
  carte poids (moyenne 7 j, courbe, couloir de prise) ; records récents.
- **Aperçu de séance** (`Seance.dc.html`) : titre, durée/séries/volume ; lignes d'exercice (miniature 52 px, prescription,
  hausse de charge en ember-ink, bouton Remplacer) ; barre du bas Modifier + Démarrer ; « Demander à Claude » en haut.
- **Série** (`Effort.dc.html`, sombre) : progression par exercice + chrono ; miniature, nom, « Comment faire ? » ;
  pastilles de séries ; deux panneaux géants Charge (±1 palier) et Répétitions (±1) — ou Durée pour une série en temps,
  ou « max » pour une AMRAP ; validation par Facile / Correct / Dur (un tap = série validée + ressenti).
- **Repos** (`Repos.dc.html`, sombre) : rappel de la série validée, anneau 260 px + temps restant 76 px, carte
  « Ensuite », −15 s / +15 s / Passer.

## 5. Composants à créer dans `src/ui/`

Button (principal ember, secondaire surface, sombre inverse, texte ember-ink), TabBar, LogSheet, Sheet (existe : à
restyler), Card, ListRow, StatTile, Segmented (durée), PillTabs, KcalRing, MacroBar, FoodRow, ExerciseRow, MuscleMap,
FoodPictogram, CalendarHeatmap, WeekStrip, RestTimer, SetPanel (charge/reps/durée), Stepper (mutualiser l'existant).
Supprimer les doublons signalés dans PROGRESS.md (Stepper/Switch de `recipes/parts.tsx`, `Stat`, `formatNumber`).

## 6. Visuels

- **MuscleMap** : SVG 40×56 en parties nommées, muscles ciblés en ember, le reste en surface-sunken (sur fond sombre :
  `rgba(245,244,241,.14)`). Vue de face existante dans les maquettes (delts, chest, abs, arms, fore, hips, quads, calves) ;
  **créer la vue de dos** (traps, back/lats, lower-back, glutes, hamstrings, triceps, calves). Choisir la vue selon les
  muscles primaires ; mapper depuis l'énumération `MuscleGroup` existante. Générer depuis les données de l'exercice,
  jamais d'image par exercice.
- **Pictogrammes d'aliments** : icône au trait par catégorie (viande, poisson, œuf, laitage, fromage, féculent, pain,
  légume, fruit, matière grasse, boisson, plat, sucré), déduite du groupe Ciqual ; pour les recettes, pictogramme du plat.
- **Photo Open Food Facts** : récupérée AU MOMENT DU SCAN (`image_front_small_url`), stockée en Blob dans Dexie avec le
  cache produit (hors ligne ensuite). C'est le même appel réseau autorisé qu'aujourd'hui : mettre à jour la règle
  réseau de CLAUDE.md en conséquence. Pas de photo → pictogramme.
- **Icônes** : `lucide-react`, trait 1,75, 24 px.

## 7. Accessibilité

Contrastes déjà vérifiés pour les paires ci-dessus. Vrais `<button>` / `<a>`, `aria-label` sur les boutons-icônes,
`role="timer"` sur le minuteur, minuteur annoncé seulement à la fin. Couleur jamais seule porteuse de sens.
