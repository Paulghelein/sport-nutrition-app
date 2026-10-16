Forge est une app personnelle de musculation à la maison (kettlebell et poids du corps) et de nutrition pour une prise de masse. On l'utilise sur iPhone, souvent d'une main, parfois essoufflé à un mètre de l'écran. Chaque règle ci-dessous sert ces deux moments : consulter vite, agir sans réfléchir.

## Principes

- **Un écran, une question.** « Qu'est-ce que je fais aujourd'hui ? », « Où en sont mes calories ? », « Est-ce que je progresse ? ». Ce qui ne répond pas à la question de l'écran va ailleurs.
- **Le chiffre d'abord.** Une carte s'ouvre sur son chiffre clé en `number-l` ou `display-xl`, le texte vient dessous.
- **Visuel avant texte.** Chaque exercice a sa miniature (carte musculaire), chaque produit scanné sa photo Open Food Facts, chaque aliment générique son pictogramme. Une ligne sans visuel est l'exception.
- **Toute saisie passe par le bouton +.** Il ouvre la feuille « Ajouter » : scanner, chercher un aliment, recette, décrire à Claude, pesée, démarrer une séance. On ne cherche jamais où saisir.
- **Le mode séance est sombre.** Tout le reste est clair. Le passage sur `inverse` signale « tu es en train de t'entraîner ».

## Ton et contenu

- Tutoiement, phrases courtes, verbes d'action : « Démarrer », « Ajouter au journal », « Valider la série ».
- Casse de phrase partout (« Séance du jour », pas « Séance Du Jour »). Les capitales sont réservées au style `label`.
- Toujours l'unité, collée au chiffre par une espace insécable : `16 kg`, `2 840 kcal`, `32 g`, `90 s`. Séparateur de milliers : espace fine. Décimales à la virgule : `72,4 kg`.
- Séries et répétitions : `3 × 10`, fourchette `8–12`, durée `30 s`, à l'échec `max`.
- Pas d'emoji dans l'interface. Les félicitations restent sobres : « Record battu : 20 kg × 12 ».
- Les erreurs disent quoi faire : « Caméra refusée. Autorise-la dans Réglages → Safari → Caméra. »

## Couleurs

- Fond de page `canvas`, cartes en `surface`, feuilles et barre d'onglets en `surface-raised`. Le blanc pur n'apparaît jamais.
- Texte en `ink`, secondaire en `ink-muted`. `ink-faint` ne porte jamais de texte à lire.
- `ember` est la couleur de Forge et reste rare : un seul élément ember par écran au repos (le bouton principal ou le bouton +), plus l'anneau de calories. Le texte posé sur `ember` est en `ink`, jamais en blanc. Pour un texte ou un lien ember, utilise `ember-ink`.
- Sélection (jour choisi, filtre actif) : fond `ember-soft`, texte `ink`.
- Macros : `protein`, `carbs`, `fat`, toujours dans cet ordre et toujours avec leur mot ou leur lettre (P, G, L). La couleur seule ne suffit jamais.
- Calendrier : `heat-0` à `heat-4` du jour vide au record battu. Un point `ink` au centre d'une case signale que les calories et les protéines étaient dans la cible ce jour-là ; sinon, pas de point.
- États : `good`, `warning`, `critical`, toujours avec un mot ou une icône.
- Mode séance : fond `inverse`, texte `on-inverse` et `on-inverse-muted`, accent `ember`.

## Typographie

- Deux familles Google Fonts : **Archivo** (`font-display`) pour les titres et tous les chiffres, **Figtree** (`font-sans`) pour le texte. Charge-les avec `https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,500..900&family=Figtree:wght@400..700&display=swap`.
- Les chiffres sont toujours en Archivo, avec `font-variant-numeric: tabular-nums` pour qu'ils ne sautent pas pendant un minuteur.
- Une seule `display-l` par écran, le titre. `display-xl` est réservé au mode séance.
- Noms d'exercices et d'aliments en `headline`, détails dessous en `caption` couleur `ink-muted`.

## Espacement et formes

- Marge latérale des écrans `space-4`, écart entre cartes `space-6`, padding de carte `space-4` (grandes cartes `space-5`).
- Cibles tactiles d'au moins `space-12` (48 px) de haut. En mode séance, les boutons font 64 px et sont collés en bas, à portée de pouce.
- Cartes `radius-lg` sans bordure, avec `shadow-card`. À l'intérieur, les lignes sont séparées par `line`, jamais par d'autres cartes.
- Boutons et pastilles en `radius-pill`. Feuilles du bas et barre d'onglets en `radius-xl` avec `shadow-float`.
- Focus clavier : anneau `focus` plein de 2 px, décalé de 2 px.

## Navigation

- Barre d'onglets flottante : **Aujourd'hui · Entraînement · + · Nutrition · Progrès**. Les réglages sont derrière l'icône en haut à droite d'« Aujourd'hui ».
- Le bouton + est le seul rond ember de la barre. Il ouvre la feuille « Ajouter » (composant `LogSheet`).
- Un écran de détail glisse depuis la droite et se ferme par le bouton retour en haut à gauche. Une action courte (quantité, pesée) s'ouvre en feuille du bas.
- En mode séance, la barre d'onglets disparaît.

## Iconographie

- Icônes au trait de 1,75 px, coins arrondis, 24 px, couleur héritée (`ink`, `ink-faint` si inactive). Pas de bibliothèque imposée pour l'instant : à choisir au moment du code (Lucide est un bon candidat).
- Miniature d'exercice : silhouette de face, muscles ciblés en `ember`, le reste en `surface-sunken`, sur fond `surface`, dans un carré `radius-sm`.
- Aliments génériques : pictogramme par catégorie (viande, poisson, œuf, laitage, féculent, légume, fruit, matière grasse, boisson). Produits scannés : photo Open Food Facts.
- Pas de logo dessiné pour l'instant : le nom « Forge » est composé en Archivo 800.

## Mouvement

- Transitions de 200 ms, courbe `ease-out`. Les feuilles montent du bas, les détails glissent de la droite.
- Le minuteur de repos se vide en continu, sans tic visible. À la fin : bip sonore et l'écran passe à la série suivante.
- Avec `prefers-reduced-motion`, toutes les transitions deviennent des fondus de 100 ms.
