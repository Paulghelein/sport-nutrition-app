# Cahier des charges — App Sport & Nutrition

Version 1 — 15 octobre 2026. Source de vérité pour les agents. Toute divergence avec le code se règle ici d'abord.

## 1. Vision et périmètre
- PWA installée sur iPhone, un seul utilisateur, aucune donnée hors du téléphone (sauf export manuel).
- Module Entraînement : séances générées à la demande selon la durée choisie et le volume des 7 derniers jours.
- Module Nutrition : objectifs caloriques de prise de masse, journal alimentaire, recettes, meal prep, courses, scan.
- Hors v1 : Apple Santé, montre, comptes, cloud, partage.

## 2. Profil et matériel
| Élément | Valeur par défaut | Modifiable |
|---|---|---|
| Niveau | débutant (réévalué par mouvement) | oui |
| Objectif | prise de masse (`bulk`) ; prévoir `maintain`, `cut` | oui |
| Kettlebell | réglable, min 12 kg, max 24 kg, pas de 1 kg | oui (min, max, pas) |
| Autre matériel | tapis | oui : barre de traction, élastiques, chaise/banc |
| Fréquence | cible 5/sem., minimum 3 | oui |
| Durée de séance | 20, 30, 45, 60 min, choisie à chaque séance | — |
| Âge, taille, sexe, activité | saisis à l'onboarding | oui |
| Poids | historique de pesées + courbe | à chaque pesée |

Le matériel possédé filtre les exercices disponibles.

## 3. Module Entraînement

### 3.1 Bibliothèque (à compléter par content-writer, chaque exercice avec fiche)
| Schéma (`pattern`) | Débutant | Intermédiaire | Avancé | Muscles |
|---|---|---|---|---|
| hinge | Soulevé de terre KB | Swing deux mains | Swing une main, SLDL unilatéral | fessiers, ischios, lombaires |
| squat | Squat PDC, goblet squat sur boîte | Goblet squat | Goblet tempo/pause, front squat KB | quadriceps, fessiers |
| lunge | Fente arrière PDC | Fente arrière goblet | Split squat bulgare | quadriceps, fessiers |
| push_h | Pompes inclinées | Pompes, floor press KB | Pompes déclinées, archer | pectoraux, triceps, épaules |
| push_v | Développé 1 bras demi-agenouillé | Développé 1 bras debout | Push press, pike push-up | épaules, triceps |
| pull | Rowing 1 bras avec appui | Rowing 1 bras sans appui | Gorilla row, renegade row | dos, biceps |
| core | Planche, dead bug | Hollow hold, planche latérale | Turkish get-up | abdominaux |
| carry | Farmer carry | Suitcase carry | Rack carry | gainage, avant-bras, trapèzes |
| arms | Curl KB, extension triceps KB | Curl marteau, pompes diamant | Curl tempo, extension nuque | biceps, triceps |
| calves | Élévations deux jambes | Une jambe | Une jambe lestée | mollets |

Sans barre de traction : volume de `pull` majoré (cible haute) pour compenser l'absence de tirage vertical.
Si l'utilisateur ajoute une barre : débloquer tractions négatives → australiennes (si table) → tractions.

Champs d'un exercice : `id, name, pattern, level (1|2|3), muscles: {primary[], secondary[]}, equipment[],
loadType ('kettlebell'|'bodyweight'|'timed'), repRange [min,max] ou durationRange, restSec, compound (bool),
unilateral (bool), loadStepKg (1|2), progressionCriteria, technique {setup, steps[], cues[], mistakes[]},
illustration (SVG id), videoUrl? (saisi par l'utilisateur)`.

### 3.2 Génération d'une séance (fonction pure)
Entrées : durée, profil, matériel, historique 7 jours, état de chaque exercice, date.
1. Volume hebdo : séries effectives par groupe musculaire (primaire = 1, secondaire = 0,5) sur 7 jours glissants.
   Cible débutant prise de masse : 8 à 12 séries / grand groupe / semaine (dos : 10 à 14 sans barre).
2. Score de priorité par groupe = déficit par rapport à la cible ; pénalité forte si le groupe a reçu ≥ 4 séries
   lourdes il y a moins de 48 h.
3. Budget temps : durée − échauffement. Coût d'une série = reps × 3 s (ou durée) + repos. Unilatéral = × 2.
4. Sélection : polyarticulaires d'abord (un par schéma prioritaire), puis accessoires, jusqu'à épuisement du budget.
   Pas deux fois le même schéma dans une séance de ≤ 30 min.
5. Formats : 20 min = 3 ex. × 3 séries en supersets ; 30 min = 4 ex. × 3 en supersets agoniste/antagoniste ;
   45 min = 5-6 ex. × 3-4 ; 60 min = 6-7 ex. × 3-4 + finisher (swings ou portés).
6. Échauffement généré : 3 à 6 min de mobilité + séries légères du premier mouvement.
7. Sortie : liste ordonnée de blocs (exercice ou superset), séries avec reps visées et charge, durée estimée.
   Déterministe pour une même entrée (graine dérivée de la date) afin d'être testable.
L'utilisateur peut remplacer un exercice (même schéma, niveau ≤ atteint) ou en retirer : durée recalculée.

### 3.3 Progression
- Double progression : toutes les séries au haut de `repRange` → charge + `loadStepKg` à la séance suivante
  (+1 kg push/pull/arms, +2 kg hinge/squat/lunge), arrondie à une charge réglable.
- Ressenti par série : `easy | ok | hard`. Deux `hard` consécutifs → charge inchangée ; trois séances `hard` → −1 palier.
- Charge max atteinte et haut de fourchette atteint → proposer la variante du niveau supérieur, sinon tempo 3-1-1.
- Poids du corps : critère de niveau (ex. 3 × 15 propres sur pompes inclinées → pompes au sol).
- Deload : toutes les 6 semaines ou après 3 séances `hard` majoritaires sur 7 jours → volume × 0,5.

### 3.4 Mode guidé
Écran par série : nom, charge à régler, reps visées, n° de série. Minuteur de repos auto (vibration + son),
bouton « Comment faire ? » (fiche), saisie des reps réelles + ressenti, passer / remplacer, récapitulatif final
(volume, records). Wake Lock actif pendant la séance. Reprise possible si l'app est fermée en cours de séance.

### 3.5 Préférences et personnalisation
- Chaque exercice porte une préférence `liked | neutral | disliked | hidden`. Le moteur multiplie le score
  d'un exercice `liked` par 1,5 et `disliked` par 0,3 ; `hidden` est exclu. Jamais au prix d'un groupe musculaire
  privé de volume : s'il ne reste qu'un exercice `disliked` pour couvrir un groupe en déficit, il est proposé.
- Exercices personnels : création et modification complète (mêmes champs que §3.1, `source: 'user'`).
  Les exercices fournis sont modifiables aussi ; une modification crée une surcharge, « Rétablir l'original » possible.
- Séance : édition avant départ (remplacer, ajouter, retirer, réordonner), « Enregistrer comme modèle ».
- Réglages avancés : cibles de volume par groupe, paliers de charge, fréquence du deload.

### 3.6 Suivi
Historique de chaque séance, consultable et corrigeable. Les graphiques sont dans la page Progrès (§8).

## 4. Module Nutrition

### 4.1 Objectifs
- BMR Mifflin-St Jeor : homme `10·P + 6,25·T − 5·A + 5` (utilisateur confirmé homme ; garder le champ sexe).
- TDEE = BMR × activité (1,2 / 1,375 / 1,55 / 1,725).
- Prise de masse : TDEE × (1 + surplus), surplus par défaut 0,12 (réglable 0,05–0,20).
- Protéines 1,8 g/kg (réglable 1,6–2,2) ; lipides 27 % des kcal ; glucides = reste.
- Recalcul à chaque pesée (moyenne mobile 7 jours). Si moyenne stable (< +0,1 kg) sur 21 jours → proposer +150 kcal.
  Cible de prise : 0,25 à 0,5 % du poids / semaine.

### 4.2 Journal
Accueil nutrition : anneau kcal, barres P/G/L, repas du jour (petit-déj, déjeuner, dîner, collations).
Ajout par : portion de recette · aliment Ciqual + grammes · scan code-barres (Open Food Facts, mis en cache) ·
favoris/récents · saisie libre (nom + kcal, macros optionnelles) · import JSON (voir `IMPORT_FORMAT.md`).
Macros figées dans l'entrée au moment du log. Copier un repas d'hier en un tap.

### 4.3 Recettes et meal prep
- 30 à 40 recettes de départ (content-writer) : petits-déj, plats batch, collations protéinées.
- Ingrédients en grammes reliés à un aliment ; macros par portion calculées.
- Mode cuisine : portions ajustables, étapes, écran allumé.
- Frigo : portions préparées restantes, décrémentées au log.
- Liste de courses : plusieurs recettes × portions → ingrédients fusionnés, groupés par rayon, cochables.
- Filtres : repas, temps, protéines/portion, ingrédient.

### 4.4 Données alimentaires
- Ciqual (ANSES) : téléchargé une fois, converti par un script en JSON compact (kcal, prot, gluc, lip, fibres / 100 g),
  embarqué dans l'app et chargé dans Dexie au premier lancement.
- Open Food Facts : `GET https://world.openfoodfacts.org/api/v2/product/{ean}.json`, champs `product_name`,
  `nutriments.energy-kcal_100g`, `proteins_100g`, `carbohydrates_100g`, `fat_100g`. Produit introuvable →
  formulaire de création d'aliment pré-rempli avec l'EAN.
- Scan : @zxing/browser, caméra arrière, HTTPS requis.

## 5. Données et technique
Tables Dexie : `profile, weighIns, measurements, equipment, exercises, exercisePrefs, exerciseState, sessions,
sessionTemplates, foods, recipes, fridge, foodLog, shoppingLists, settings`. Export : un fichier JSON versionné (`schemaVersion`) vers Fichiers/iCloud ;
import avec choix remplacer / fusionner ; rappel d'export hebdomadaire.

## 6. Navigation
Onglets bas : **Séance** (démarrer, choix de durée, historique) · **Nutrition** (journal, recettes, courses, frigo) ·
**Progrès** (poids, charges, volume, records) · **Réglages** (profil, matériel, objectifs, sauvegarde, import).

## 8. Page Progrès
| Bloc | Contenu |
|---|---|
| Poids | pesées + moyenne mobile 7 j + couloir cible (+0,25 à +0,5 %/semaine) |
| Régularité | séances / semaine sur 12 semaines, série de semaines ≥ 3 séances, minutes totales |
| Force | charge × reps par exercice dans le temps, records, niveau atteint par mouvement |
| Volume | séries / groupe sur 7 j vs cible, carte du corps colorée |
| Nutrition | kcal et protéines moyennes de la semaine vs objectif, jours dans la cible (±10 %) |
| Bilan hebdo | carte du lundi : séances, records, tendance du poids, kcal moyennes, une suggestion par règles simples |
| Mensurations | optionnel : bras, poitrine, taille, cuisses (table `measurements`) |
Calculs dans `src/domain/progress/` (fonctions pures, testées).

## 9. Tout est modifiable
Le contenu de départ (`source: 'seed'`) n'est jamais verrouillé : exercices, séances, recettes, aliments, objectifs
et réglages du moteur sont éditables dans l'app. Toute entité éditable a un écran de modification et une suppression
(avec confirmation). Les nouvelles fonctionnalités passent par le code (Claude Code, §10.3).

## 10. Bouton « Demander à Claude »
### 10.1 Envoi
Bouton sur : journal du jour, écran de séance (avant et après), fiche recette, page Progrès, bilan hebdo.
L'app construit un message : contexte (profil résumé, objectifs, données concernées en JSON compact) + la demande
saisie par l'utilisateur + rappel du format de réponse attendu. Puis :
1. copie le message dans le presse-papiers (`navigator.clipboard.writeText`) ;
2. ouvre l'URL du Projet Claude « Coach » enregistrée dans Réglages (à défaut `https://claude.ai/new`).
   Si un paramètre de pré-remplissage par URL est supporté par Claude au moment du développement, l'utiliser ;
   le vérifier, ne pas le supposer. Le presse-papiers reste toujours le mécanisme de secours.
### 10.2 Retour
Bouton « Coller la réponse de Claude » : lecture du presse-papiers (geste utilisateur, sinon zone de collage),
extraction du ou des blocs JSON, validation Zod (formats de `IMPORT_FORMAT.md`), aperçu des changements, application.
### 10.3 Faire évoluer l'app
Dans Réglages, « Faire évoluer l'app » ouvre `https://claude.ai/code` (Claude Code sur le web) ; l'utilisateur y choisit
le dépôt. Les changements poussés sur main se déploient seuls ; le service worker affiche « Nouvelle version
disponible — recharger ».
### 10.4 Confidentialité
Rien n'est envoyé sans action explicite : l'utilisateur voit le message avant de le coller dans Claude.

## 11. Non-fonctionnel
Hors ligne complet (sauf scan). Démarrage < 2 s sur iPhone. Mode sombre. Accessible à une main.
Pas de collecte de données, pas de traqueur.
