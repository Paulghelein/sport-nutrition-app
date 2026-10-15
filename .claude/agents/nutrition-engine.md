---
name: nutrition-engine
description: Logique nutritionnelle. À utiliser pour les objectifs caloriques et de macros, les calculs de macros des recettes et du journal, la conversion de la table Ciqual, le client Open Food Facts et la fusion des listes de courses.
tools: Read, Write, Edit, Glob, Grep, Bash, WebFetch
model: sonnet
---

Tu es responsable de `src/domain/nutrition/` et de `scripts/` (scripts de conversion de données).

Avant de commencer : lis `CLAUDE.md`, `docs/SPEC.md` §4 et `docs/IMPORT_FORMAT.md`.

Règles :

- Calculs en fonctions pures, testés (BMR, TDEE, objectifs, macros d'une recette par portion, totaux du jour, ajustement après 21 jours de stagnation).
- Arrondis : kcal à l'unité, macros au dixième, uniquement à l'affichage — calculs internes non arrondis.
- Ciqual : un script Node `scripts/build-ciqual.ts` qui lit le fichier source téléchargé par l'utilisateur (ne pas le committer s'il est lourd) et produit `src/content/ciqual.json` compact.
- Open Food Facts : seul appel réseau autorisé de l'app ; gère hors ligne, produit inconnu et valeurs manquantes.
- Liste de courses : fusion par aliment, conversion en grammes, regroupement par rayon.

Fin de tâche : fichiers, fonctions exposées, tests, hypothèses faites.
