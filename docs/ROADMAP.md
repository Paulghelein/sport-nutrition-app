# Feuille de route

On ne passe au jalon suivant qu'après validation par l'utilisateur sur son iPhone.
Fin de chaque jalon : typecheck + lint + tests verts, relecture `reviewer`, commit, push, déploiement, `PROGRESS.md` à jour.

| Jalon | Contenu | Critère de validation |
|---|---|---|
| J0 Socle | Vite + React + TS strict, Tailwind, vite-plugin-pwa (manifest, icônes, service worker), React Router avec les 4 onglets vides, Vitest, Playwright, ESLint, GitHub Actions → GitHub Pages | L'app vide s'installe sur l'écran d'accueil de l'iPhone et s'ouvre en mode avion |
| J1 Données et profil | Types partagés, Dexie (toutes les tables), onboarding, pesées + courbe, réglages matériel, export / import JSON | Profil saisi, pesée ajoutée, sauvegarde exportée puis réimportée sans perte |
| J2 Exercices | Bibliothèque complète (tous les niveaux de SPEC §3.1), fiches techniques, illustrations SVG, écran bibliothèque | Chaque exercice a une fiche lisible sur iPhone |
| J3 Moteur | Volume hebdo, génération par durée, progression, deload — fonctions pures + tests sur semaines simulées | Tests verts ; séances cohérentes à 20, 30, 45, 60 min ; un groupe travaillé la veille est mis en retrait |
| J4 Séance guidée | Mode guidé, minuteur, Wake Lock, ressenti, remplacement d'exercice, récapitulatif, historique, reprise | Une vraie séance faite de bout en bout avec l'app |
| J5 Journal alimentaire | Script Ciqual → JSON, objectifs, journal du jour, recherche, saisie libre, favoris, copie d'un repas | Une journée complète loguée, totaux vérifiés à la main |
| J6 Recettes | Recettes de départ, fiche recette, mode cuisine, frigo, liste de courses, import JSON (Zod) | Une session de meal prep faite avec l'app ; recettes importées depuis Claude |
| J7 Scan | @zxing/browser, Open Food Facts, cache, création d'aliment si inconnu | 5 produits du placard scannés et logués |
| J8 Page Progrès | `src/domain/progress/` + écran : poids et tendance, régularité, force, volume, nutrition, bilan hebdo, mensurations ; rappel de sauvegarde ; mode sombre | Chaque bloc juste sur 2 semaines de données réelles |
| J9 Bouton Claude | `src/domain/claude/` (messages de contexte, extraction + validation des réponses), boutons sur journal / séance / recette / progrès, « Coller la réponse », « Faire évoluer l'app », parcours Playwright complets | Un repas ajouté et une séance modifiée via Claude, de bout en bout ; aucune erreur console |

Note : la personnalisation (SPEC §3.5 et §9) est livrée au fil des jalons : édition d'exercices en J2,
préférences dans le moteur en J3, édition de séance et modèles en J4, édition de recettes et aliments en J5-J7.
