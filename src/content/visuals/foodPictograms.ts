// Pictogrammes d'aliments (DESIGN.md §6) : viewBox 0 0 24 24, au trait (stroke 1.75, extrémités et jointures
// arrondies, pas de remplissage). Chaque chaîne est un attribut `d` ; les points isolés (`h.01`) sont des points
// dessinés par le trait arrondi. Couleur et épaisseur sont appliquées par le composant.
import type { FoodCategory } from '../../types/visuals'

export const foodPictograms: Record<FoodCategory, string[]> = {
  // Pilon : chair + os à deux nœuds.
  meat: [
    'M15 4.5c3.3 0 5.5 2.4 5.5 5.2 0 2.7-2 4.3-4.2 4.8l-1 .2-4.5-4.5.2-1c.5-2.2 2.1-4.7 4-4.7z',
    'M12.4 12.4 6.6 18.2',
    'M6.6 18.2a1.7 1.7 0 1 0-2.4 2.4 1.7 1.7 0 0 0 2.4-2.4z',
  ],
  // Poisson de profil avec queue et œil.
  fish: [
    'M2.5 12c3-4.5 8.5-5.8 12-3.8 1.4.8 2.6 2 3.5 3.8-.9 1.8-2.1 3-3.5 3.8-3.5 2-9 .7-12-3.8z',
    'M18 12l3.5-3.5v7z',
    'M6.5 11.5h.01',
  ],
  // Œuf entier avec reflet.
  egg: ['M12 3c3.5 0 6.5 5 6.5 9.5a6.5 6.5 0 0 1-13 0C5.5 8 8.5 3 12 3z', 'M9 13.5a3 3 0 0 0 3 3'],
  // Brique de lait : toit pointu, étiquette.
  dairy: ['M8 3h8l2 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7z', 'M6 7h12', 'M9.5 12.5h5v4h-5z'],
  // Part de fromage à trous.
  cheese: [
    'M3 12.5 21 7.5v10H3z',
    'M8 14.5a1 1 0 1 0 2 0 1 1 0 1 0-2 0',
    'M15 13.5a1.2 1.2 0 1 0 2.4 0 1.2 1.2 0 1 0-2.4 0',
  ],
  // Bol de riz avec monticule.
  starch: ['M3 12h18c0 4.4-3.8 8-9 8s-9-3.6-9-8z', 'M9 21h6', 'M6 12c0-3 2.7-5 6-5s6 2 6 5'],
  // Baguette en diagonale avec entailles.
  bread: [
    'M5 19c-1.3-1.3-1.1-3.3.2-4.6l9.2-9.2c1.3-1.3 3.4-1.5 4.7-.2s1.1 3.4-.2 4.7l-9.2 9.2C8.4 20.1 6.3 20.3 5 19z',
    'M8.5 12.5l3 3',
    'M12 9l3 3',
  ],
  // Carotte avec fanes.
  vegetable: [
    'M4 20 13 6.5a3.5 3.5 0 0 1 4.5 4.5L4 20z',
    'M15.5 5.5 15 2.5',
    'M17.5 7.5l3.5-1.5',
    'M9 13l2 2',
    'M12 10.5l1.5 1.5',
  ],
  // Pomme avec tige et feuille.
  fruit: [
    'M12 7.5c-1.5-1.3-5-2-6.5 1.5-1.5 3.5.5 9 3 11 1.2 1 2.5.5 3.5.5s2.3.5 3.5-.5c2.5-2 4.5-7.5 3-11C17 5.5 13.5 6.2 12 7.5z',
    'M12 7.5c0-2 .5-3.5 2-4.5',
    'M14 3c1.5 0 2.5.8 3 2-1.5.2-2.8-.3-3-2z',
  ],
  // Bouteille d'huile avec étiquette.
  fat: ['M10 2.5h4V6l2 2.5v11.5a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V8.5L10 6z', 'M8 12.5h8', 'M8 17.5h8'],
  // Verre avec niveau et paille.
  drink: ['M6 3h12l-1.3 17.2a1 1 0 0 1-1 .8H8.3a1 1 0 0 1-1-.8z', 'M6.7 10h10.6', 'M13.5 10 15.5 3'],
  // Cloche de service sur son plateau.
  dish: ['M3 17a9 9 0 0 1 18 0z', 'M2 20.5h20', 'M12 8V6.5', 'M10.5 6h3'],
  // Cookie aux pépites.
  sweet: [
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    'M8.5 9.5h.01',
    'M14.5 8.5h.01',
    'M15 14.5h.01',
    'M9.5 15h.01',
    'M12 12h.01',
  ],
}
