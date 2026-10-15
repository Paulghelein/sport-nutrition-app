// Aliments utilisés par les recettes de départ. Chaque `ciqualCode` existe dans src/content/foods/ciqual.json
// (table Ciqual 2025). Sans code Ciqual adapté (whey, skyr), les valeurs d'étiquette typiques sont fournies.
import type { Aisle, Per100g, RecipeIngredient } from '../../types'

interface FoodDef {
  name: string
  aisle: Aisle
  ciqualCode?: string
  per100g?: Per100g
}

const f = (name: string, aisle: Aisle, ciqualCode: string): FoodDef => ({ name, aisle, ciqualCode })

export const FOODS = {
  // Féculents
  riz: f('Riz basmati cru', 'grocery', '9119'),
  rizBlanc: f('Riz blanc cru', 'grocery', '9100'),
  pates: f('Pâtes sèches', 'grocery', '9810'),
  nouilles: f('Nouilles asiatiques sèches', 'grocery', '9863'),
  semoule: f('Semoule de blé dur crue', 'grocery', '9610'),
  boulgour: f('Boulgour cru', 'grocery', '9690'),
  flocons: f("Flocons d'avoine", 'grocery', '32140'),
  pommeDeTerre: f('Pommes de terre', 'produce', '4008'),
  patateDouce: f('Patate douce', 'produce', '4101'),
  painComplet: f('Pain complet', 'bakery', '7110'),
  painDeMieComplet: f('Pain de mie complet', 'bakery', '7111'),
  tortilla: f('Tortillas de blé (wraps)', 'bakery', '7815'),
  chapelure: f('Chapelure', 'grocery', '7500'),
  farine: f('Farine de blé T65', 'grocery', '9435'),
  levure: f('Levure chimique', 'grocery', '11046'),
  // Légumineuses
  lentillesCorail: f('Lentilles corail sèches', 'grocery', '20535'),
  lentillesVertes: f('Lentilles vertes sèches', 'grocery', '20585'),
  poisChiches: f('Pois chiches en conserve (égouttés)', 'grocery', '20532'),
  haricotsRouges: f('Haricots rouges en conserve (égouttés)', 'grocery', '20524'),
  // Viandes, poissons, oeufs
  poulet: f('Filet de poulet cru', 'butcher', '36017'),
  pouletCuisse: f('Haut de cuisse de poulet cru', 'butcher', '36019'),
  dinde: f('Escalope de dinde crue', 'butcher', '36304'),
  boeuf: f('Steak haché 5 % MG cru', 'butcher', '6250'),
  jambonDinde: f('Jambon de dinde en tranches', 'butcher', '28964'),
  thon: f('Thon au naturel en boîte (égoutté)', 'grocery', '26181'),
  saumon: f('Pavé de saumon cru', 'fish', '26036'),
  crevettes: f('Crevettes surgelées crues', 'frozen', '10038'),
  oeufs: f('Oeufs (60 g pièce)', 'dairy', '22000'),
  // Produits laitiers et alternatives
  fromageBlanc0: f('Fromage blanc nature 0 %', 'dairy', '19644'),
  yaourt: f('Yaourt nature', 'dairy', '19593'),
  fromageFrais: f('Fromage frais allégé à tartiner', 'dairy', '12069'),
  lait: f('Lait demi-écrémé', 'dairy', '19042'),
  cremeLegere: f('Crème légère épaisse', 'dairy', '19431'),
  emmental: f('Emmental râpé', 'dairy', '12118'),
  parmesan: f('Parmesan', 'dairy', '12120'),
  feta: f('Feta', 'dairy', '12066'),
  tofu: f('Tofu nature', 'dairy', '20904'),
  laitCoco: f('Lait de coco', 'grocery', '18041'),
  skyr: {
    name: 'Skyr nature',
    aisle: 'dairy',
    per100g: { kcal: 63, protein: 11, carbs: 4, fat: 0.2 },
  },
  whey: {
    name: 'Whey protéine en poudre (saveur neutre ou vanille)',
    aisle: 'grocery',
    per100g: { kcal: 380, protein: 80, carbs: 7, fat: 6 },
  },
  // Fruits et légumes
  banane: f('Banane', 'produce', '13005'),
  fraise: f('Fraises (fraîches ou surgelées)', 'produce', '13014'),
  myrtilles: f('Myrtilles surgelées', 'frozen', '13132'),
  avocat: f('Avocat', 'produce', '13004'),
  brocoli: f('Brocoli', 'produce', '20057'),
  courgette: f('Courgette', 'produce', '20020'),
  poivron: f('Poivron rouge', 'produce', '20087'),
  oignon: f('Oignon', 'produce', '20034'),
  ail: f('Ail (gousses)', 'produce', '11000'),
  carotte: f('Carottes', 'produce', '20009'),
  champignons: f('Champignons de Paris', 'produce', '20056'),
  concombre: f('Concombre', 'produce', '20019'),
  salade: f('Salade verte', 'produce', '25604'),
  epinards: f('Épinards surgelés', 'frozen', '20083'),
  haricotsVerts: f('Haricots verts surgelés', 'frozen', '20070'),
  petitsPois: f('Petits pois surgelés', 'frozen', '20084'),
  tomatesConcassees: f('Tomates concassées en conserve', 'grocery', '20169'),
  mais: f('Maïs doux en conserve (égoutté)', 'grocery', '20066'),
  // Matières grasses, fruits secs, épicerie
  huileOlive: f("Huile d'olive", 'grocery', '17270'),
  beurre: f('Beurre doux', 'dairy', '16400'),
  beurreCacahuete: f('Beurre de cacahuète', 'grocery', '15202'),
  amandes: f('Amandes', 'grocery', '15000'),
  noix: f('Noix', 'grocery', '15005'),
  sesame: f('Graines de sésame', 'grocery', '15010'),
  tahin: f('Tahin (purée de sésame)', 'grocery', '15203'),
  miel: f('Miel', 'grocery', '31008'),
  cacao: f('Cacao en poudre non sucré', 'grocery', '18100'),
  chocolatNoir: f('Chocolat noir 70 %', 'grocery', '31074'),
  sauceSoja: f('Sauce soja', 'grocery', '11104'),
  moutarde: f('Moutarde', 'grocery', '11013'),
  jusCitron: f('Jus de citron', 'grocery', '2028'),
  curry: f('Curry en poudre', 'grocery', '11005'),
  paprika: f('Paprika en poudre', 'grocery', '11049'),
  cumin: f('Cumin moulu', 'grocery', '11042'),
  cannelle: f('Cannelle en poudre', 'grocery', '11025'),
  gingembre: f('Gingembre frais', 'produce', '11074'),
} as const satisfies Record<string, FoodDef>

/** Construit un ingrédient en grammes crus, relié à Ciqual quand un code est connu. */
export function ing(food: FoodDef, grams: number): RecipeIngredient {
  const base: RecipeIngredient = { name: food.name, grams, aisle: food.aisle }
  if (food.ciqualCode) {
    return { ...base, ciqualCode: food.ciqualCode, foodId: `ciqual-${food.ciqualCode}` }
  }
  return food.per100g ? { ...base, per100g: food.per100g } : base
}
