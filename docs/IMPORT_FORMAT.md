# Format d'import JSON (recettes et repas)

L'écran **Réglages → Importer** accepte un tableau JSON de recettes et repas ; « Coller la réponse de Claude »
accepte en plus séances, exercices et préférences. L'app valide avec Zod, affiche un aperçu, puis enregistre.
Quand un ingrédient correspond à un aliment Ciqual (`ciqualCode` ou nom proche), les macros sont recalculées
depuis Ciqual ; sinon les valeurs `per100g` fournies sont utilisées.

## Recette
```json
{
  "type": "recipe",
  "name": "Poulet, riz basmati et brocoli",
  "meal": ["dejeuner", "diner"],
  "servings": 4,
  "prepMinutes": 15,
  "cookMinutes": 25,
  "fridgeDays": 4,
  "tags": ["batch", "riche-en-proteines"],
  "ingredients": [
    { "name": "Blanc de poulet cru", "grams": 600, "ciqualCode": "36005", "aisle": "boucherie" },
    { "name": "Riz basmati cru", "grams": 320, "aisle": "epicerie",
      "per100g": { "kcal": 354, "protein": 8.1, "carbs": 77.5, "fat": 0.9 } },
    { "name": "Brocoli", "grams": 500, "aisle": "fruits-legumes" }
  ],
  "steps": ["Cuire le riz.", "Saisir le poulet en dés.", "Cuire le brocoli à la vapeur 6 min.", "Répartir en 4 boîtes."]
}
```

## Repas (pour le journal, ex. restaurant)
```json
{
  "type": "meal",
  "name": "Burger frites au resto",
  "date": "2026-10-15",
  "slot": "diner",
  "estimated": true,
  "totals": { "kcal": 1150, "protein": 45, "carbs": 110, "fat": 58 }
}
```

## Préférence d'exercice
```json
{ "type": "exercisePreference", "exerciseId": "two-hand-swing", "preference": "disliked", "reason": "fatigue le bas du dos" }
```
`preference` ∈ `liked | neutral | disliked | hidden`.

## Séance modifiée (remplace la séance proposée du jour)
```json
{
  "type": "sessionPlan",
  "durationMin": 30,
  "blocks": [
    { "exerciseId": "box-goblet-squat", "sets": 3, "reps": [8, 12], "loadKg": 12, "restSec": 90 },
    { "exerciseId": "incline-push-up", "sets": 3, "reps": [10, 15], "restSec": 60, "group": 1 },
    { "exerciseId": "Hip thrust au sol KB", "sets": 3, "reps": [10, 15], "restSec": 60, "group": 1 }
  ]
}
```
- `exerciseId` : un id fourni dans le contexte, sinon le nom exact d'un exercice (les exercices personnels sont
  envoyés par leur nom), sinon le `name` d'un objet `exercise` de la même réponse (il est créé d'abord).
  Une ligne dont l'exercice est inconnu est écartée avec un avertissement.
- `reps` (répétitions) ou `durationSec` (exercices en durée) ; `loadKg`, `restSec` et `group` optionnels.
  Lignes consécutives de même `group` = superset (3 exercices au plus).
- Bornes : `durationMin` ∈ 20 | 30 | 45 | 60 (arrondie sinon), 12 lignes et 30 séries au plus, 1 à 10 séries par ligne.
- Charges ramenées dans la plage et au pas de la kettlebell, et **jamais au-dessus de la progression** : Claude peut
  alléger, pas alourdir. Répétitions plafonnées au haut de la fourchette de l'exercice.
- Une seule séance par réponse (la dernière l'emporte). Appliquer = modèle « Séance proposée par Claude » (id
  `claude-plan`, écrasé à chaque fois) ouvert dans l'aperçu, modifiable avant « Commencer ».

## Exercice personnel
```json
{
  "type": "exercise", "name": "Hip thrust au sol KB", "pattern": "hinge", "level": 1,
  "muscles": { "primary": ["fessiers"], "secondary": ["ischios"] },
  "loadType": "kettlebell", "repRange": [10, 15], "restSec": 75, "compound": true, "unilateral": false,
  "technique": { "setup": "...", "steps": ["..."], "cues": ["..."], "mistakes": ["..."] }
}
```
Champs optionnels complétés par l'app s'ils manquent : `equipment`, `loadStepKg`, `progressionCriteria`, `restSec`,
`technique` ; `durationRange` à la place de `repRange` pour un exercice en durée. Muscles et schémas acceptés en
français ou en anglais.

La réponse de Claude peut contenir plusieurs objets dans un même tableau, de types différents.

Valeurs autorisées : `meal`/`slot` ∈ `petit-dej | dejeuner | diner | collation` ;
`aisle` ∈ `fruits-legumes | boucherie | poissonnerie | cremerie | epicerie | surgeles | boulangerie | autre`.

## Instructions pour le Projet Claude « Coach » (à coller dans les instructions du projet)
Texte à jour dans l'app (Réglages, constante `COACH_PROJECT_INSTRUCTIONS` de src/domain/claude/instructions.ts) ;
résumé :
> Tu es mon coach sport et nutrition, connecté à mon app. Mon matériel, mon niveau et mes objectifs sont dans le
> contexte envoyé ; respecte-les.
> Mes messages commencent par un contexte envoyé par l'app (objectifs, journal, séance ou bilan) puis ma demande.
> Réponds d'abord en quelques phrases simples en français. Puis, si quelque chose doit entrer dans l'app
> (repas mangé, recette, séance modifiée, préférence d'exercice, nouvel exercice), termine par UN bloc ```json
> contenant un tableau d'objets aux formats ci-dessous, quantités en grammes crus. N'invente pas d'exerciseId :
> utilise ceux fournis dans le contexte, ou crée un objet `exercise`.
> [coller ici tous les exemples ci-dessus]
