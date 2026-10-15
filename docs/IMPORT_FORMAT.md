# Format d'import JSON (recettes et repas)

L'écran **Réglages → Importer** accepte un tableau JSON. L'app valide avec Zod, affiche un aperçu, puis enregistre.
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
{ "type": "exercisePreference", "exerciseId": "kb-swing-2h", "preference": "disliked", "reason": "fatigue le bas du dos" }
```
`preference` ∈ `liked | neutral | disliked | hidden`.

## Séance modifiée (remplace la séance proposée du jour)
```json
{
  "type": "sessionPlan",
  "durationMin": 30,
  "blocks": [
    { "exerciseId": "goblet-squat", "sets": 3, "reps": [8, 12], "loadKg": 16, "restSec": 90 },
    { "exerciseId": "pushup-incline", "sets": 3, "reps": [10, 15], "restSec": 60 }
  ]
}
```
Les `exerciseId` doivent exister dans l'app ; sinon l'aperçu propose de créer l'exercice.

## Exercice personnel
```json
{
  "type": "exercise", "name": "Hip thrust au sol KB", "pattern": "hinge", "level": 1,
  "muscles": { "primary": ["fessiers"], "secondary": ["ischios"] },
  "loadType": "kettlebell", "repRange": [10, 15], "restSec": 75, "compound": true, "unilateral": false,
  "technique": { "setup": "...", "steps": ["..."], "cues": ["..."], "mistakes": ["..."] }
}
```

La réponse de Claude peut contenir plusieurs objets dans un même tableau, de types différents.

Valeurs autorisées : `meal`/`slot` ∈ `petit-dej | dejeuner | diner | collation` ;
`aisle` ∈ `fruits-legumes | boucherie | poissonnerie | cremerie | epicerie | surgeles | boulangerie | autre`.

## Instructions pour le Projet Claude « Coach » (à coller dans les instructions du projet)
> Tu es mon coach sport et nutrition, connecté à mon app. Je suis débutant, objectif prise de masse, je m'entraîne
> à la maison avec une kettlebell réglable 12-24 kg (paliers de 1 kg) et au poids du corps.
> Mes messages commencent par un contexte envoyé par l'app (objectifs, journal, séance ou bilan) puis ma demande.
> Réponds d'abord en quelques phrases simples en français. Puis, si quelque chose doit entrer dans l'app
> (repas mangé, recette, séance modifiée, préférence d'exercice, nouvel exercice), termine par UN bloc ```json
> contenant un tableau d'objets aux formats ci-dessous, quantités en grammes crus. N'invente pas d'exerciseId :
> utilise ceux fournis dans le contexte, ou crée un objet `exercise`.
> [coller ici tous les exemples ci-dessus]
