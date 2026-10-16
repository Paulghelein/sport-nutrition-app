// Catégorie d'aliment (pictogramme de repli, DESIGN.md §6) : fonctions pures. Agent : nutrition-engine.
import type { Food, FoodLogEntry } from '../../types/nutrition'
import type { FoodCategory, FoodVisual } from '../../types/visuals'
import { normalizeFoodSearch } from './search'

type Rule = readonly [FoodCategory, readonly string[]]

/**
 * Teste si l'un des motifs figure dans le nom normalisé. Un motif est une suite de mots entiers (pluriel s/x toléré
 * sur le dernier) : « pomme de terre » ne correspond pas à « pomme » seul, « riz » ne correspond pas à « fabriz ».
 */
function hasAny(normalized: string, patterns: readonly string[]): boolean {
  const padded = ` ${normalized} `
  return patterns.some(
    (p) => padded.includes(` ${p} `) || padded.includes(` ${p}s `) || padded.includes(` ${p}x `),
  )
}

function firstMatch(normalized: string, rules: readonly Rule[]): FoodCategory | undefined {
  for (const [category, patterns] of rules) if (hasAny(normalized, patterns)) return category
  return undefined
}

const EGG = ['oeuf', 'omelette']
const FISH = [
  'poisson',
  'saumon',
  'thon',
  'cabillaud',
  'crevette',
  'sardine',
  'maquereau',
  'truite',
  'merlu',
  'colin',
  'lieu',
  'dorade',
  'hareng',
  'anchois',
  'sole',
  'raie',
  'flétan',
  'fletan',
  'surimi',
  'moule',
  'huitre',
  'crabe',
  'homard',
  'langoustine',
  'calamar',
  'poulpe',
  'seiche',
  'bar',
  'lotte',
  'limande',
  'carpe',
  'perche',
  'morue',
  'églefin',
  'eglefin',
  'coquille saint jacques',
  'noix de saint jacques',
  'fruits de mer',
  'tarama',
  'crustace',
]
const MEAT = [
  'viande',
  'poulet',
  'dinde',
  'boeuf',
  'veau',
  'porc',
  'agneau',
  'mouton',
  'jambon',
  'steak',
  'bacon',
  'lardon',
  'saucisse',
  'saucisson',
  'canard',
  'lapin',
  'cheval',
  'gibier',
  'foie',
  'pate',
  'rillettes',
  'merguez',
  'chorizo',
  'escalope',
  'cotelette',
  'poitrine',
  'blanc de poulet',
  'roti',
  'rosbif',
  'kebab',
  'andouille',
  'boudin',
  'cuisse',
]
const CHEESE = [
  'fromage',
  'emmental',
  'comte',
  'mozzarella',
  'parmesan',
  'camembert',
  'brie',
  'chevre',
  'gouda',
  'edam',
  'cheddar',
  'roquefort',
  'raclette',
  'reblochon',
  'feta',
  'cantal',
  'maroilles',
  'munster',
  'gruyere',
  'mimolette',
  'ricotta',
  'mascarpone',
  'bleu',
  'tomme',
  'pecorino',
  'halloumi',
  'babybel',
  'vache qui rit',
]
// Fromages « frais » : traités comme des produits laitiers (skyr, fromage blanc).
const FRESH_CHEESE = [
  'fromage blanc',
  'fromage frais',
  'faisselle',
  'petit suisse',
  'petits suisses',
  'cottage',
]
const DAIRY = [
  'lait',
  'yaourt',
  'yogourt',
  'yoghourt',
  'skyr',
  'kefir',
  'creme',
  'whey',
  'proteine en poudre',
  'proteines en poudre',
  'caseine',
  'petit suisse',
  'faisselle',
  'fromage blanc',
  'fromage frais',
  'cottage',
  'lactes',
  'laitier',
]
const BREAD = [
  'pain',
  'baguette',
  'brioche',
  'biscotte',
  'tortilla',
  'wrap',
  'croissant',
  'toast',
  'bagel',
  'pita',
  'naan',
  'chapelure',
  'cracotte',
  'galette de ble',
  'pain de mie',
]
const STARCH = [
  'riz',
  'pates',
  'spaghetti',
  'tagliatelle',
  'macaroni',
  'coquillette',
  'penne',
  'fusilli',
  'nouille',
  'vermicelle',
  'semoule',
  'couscous',
  'boulgour',
  'quinoa',
  'ble',
  'avoine',
  'flocon',
  'flocons',
  'muesli',
  'cereale',
  'cereales',
  'farine',
  'polenta',
  'millet',
  'orge',
  'epeautre',
  'sarrasin',
  'seigle',
  'mais',
  'pomme de terre',
  'patate',
  'manioc',
  'igname',
  'lentille',
  'pois chiche',
  'pois casse',
  'feve',
  'flageolet',
  'soja',
  'chataigne',
  'frite',
  'purée',
  'puree',
  'gnocchi',
  'tapioca',
  'plantain',
]
const FRUIT = [
  'fruit',
  'pomme',
  'banane',
  'fraise',
  'orange',
  'raisin',
  'poire',
  'peche',
  'abricot',
  'cerise',
  'kiwi',
  'mangue',
  'ananas',
  'citron',
  'clementine',
  'mandarine',
  'pamplemousse',
  'framboise',
  'myrtille',
  'cassis',
  'melon',
  'pasteque',
  'prune',
  'pruneau',
  'figue',
  'datte',
  'grenade',
  'litchi',
  'mure',
  'groseille',
  'papaye',
  'goyave',
  'nectarine',
  'compote',
  'avocat',
  'baie',
  'canneberge',
  'cranberry',
]
const VEGETABLE = [
  'legume',
  'salade',
  'tomate',
  'carotte',
  'courgette',
  'aubergine',
  'poivron',
  'brocoli',
  'chou',
  'epinard',
  'haricot vert',
  'petit pois',
  'petits pois',
  'concombre',
  'oignon',
  'ail',
  'poireau',
  'champignon',
  'radis',
  'betterave',
  'celeri',
  'asperge',
  'artichaut',
  'endive',
  'laitue',
  'navet',
  'potiron',
  'citrouille',
  'fenouil',
]
// Oléagineux : rangés avec les matières grasses (≈ 50 à 65 g de lipides pour 100 g, usage de « bonne graisse »).
const NUTS = [
  'amande',
  'noix',
  'noisette',
  'cacahuete',
  'pistache',
  'cajou',
  'pecan',
  'macadamia',
  'sesame',
  'tournesol',
  'graine',
  'pignon',
  'coco',
  'tahin',
  'tahini',
  'oleagineux',
  'praline',
]
const FAT = [
  'huile',
  'beurre',
  'margarine',
  'saindoux',
  'matiere grasse',
  'matieres grasses',
  'mayonnaise',
  'vinaigrette',
  'beurre de cacahuete',
  'peanut butter',
  'olive',
]
const DRINK = [
  'eau',
  'jus',
  'boisson',
  'soda',
  'cola',
  'limonade',
  'biere',
  'vin',
  'cafe',
  'the',
  'infusion',
  'tisane',
  'sirop',
  'smoothie',
  'cidre',
  'champagne',
  'whisky',
  'vodka',
  'rhum',
  'gin',
  'pastis',
  'liqueur',
  'aperitif',
  'nectar',
  'boisson energisante',
]
const SWEET = [
  'chocolat',
  'biscuit',
  'gateau',
  'bonbon',
  'confiture',
  'miel',
  'sucre',
  'nutella',
  'pate a tartiner',
  'glace',
  'sorbet',
  'cookie',
  'tarte',
  'creme dessert',
  'dessert',
  'confiserie',
  'caramel',
  'meringue',
  'macaron',
  'beignet',
  'barre',
  'madeleine',
  'sirop d agave',
  'cacao',
  'flan',
  'mousse',
  'viennoiserie',
  'pain d epices',
  'speculoos',
]
const DISH = [
  'pizza',
  'sandwich',
  'burger',
  'hamburger',
  'quiche',
  'lasagne',
  'lasagnes',
  'gratin',
  'soupe',
  'potage',
  'salade composee',
  'ravioli',
  'paella',
  'couscous royal',
  'tacos',
  'hachis',
  'tartiflette',
  'cassoulet',
  'croque',
  'nem',
  'sushi',
  'chili',
  'curry',
  'risotto',
  'bowl',
  'feuillete',
  'taboule',
]

const GROUP_FRUITS = 'fruits legumes legumineuses et oleagineux'
const GROUP_CEREALS = 'produits cerealiers'
const GROUP_MEAT = 'viandes oeufs poissons'
const GROUP_DAIRY = 'produits laitiers'
const GROUP_DRINKS = 'eaux et autres boissons'
const GROUP_SWEET = 'produits sucres'
const GROUP_ICE = 'glaces et sorbets'
const GROUP_FAT = 'matieres grasses'
const GROUP_DISHES = 'entrees et plats composes'

/** Sans groupe (aliment perso, Open Food Facts, saisie libre) ou groupe fourre-tout : mots-clés sur le nom seul. */
function categoryFromName(name: string): FoodCategory {
  // Les plats et les produits sucrés/boissons passent avant les ingrédients (« pizza au thon », « jus d'orange »).
  const found = firstMatch(name, [
    ['dish', DISH],
    ['drink', DRINK],
    ['dairy', DAIRY.filter((w) => w === 'whey' || w.startsWith('proteine'))],
    ['sweet', SWEET],
    ['fat', ['beurre de cacahuete', 'beurre', 'huile', 'margarine', 'mayonnaise', 'vinaigrette', ...NUTS]],
    ['egg', EGG],
    ['fish', FISH],
    ['starch', ['pomme de terre', 'patate', 'riz', 'pates', 'flocon', 'flocons']],
    ['meat', MEAT],
    ['cheese', hasAny(name, FRESH_CHEESE) ? [] : CHEESE],
    ['dairy', DAIRY],
    ['bread', BREAD],
    ['starch', STARCH],
    ['fruit', FRUIT],
    ['vegetable', VEGETABLE],
    ['fat', FAT],
  ])
  return found ?? 'dish'
}

/**
 * Catégorie (donc pictogramme) d'un aliment. Le groupe Ciqual de tête (12 groupes) donne la catégorie de base,
 * affinée par les mots du nom ; sans groupe, ou pour les groupes fourre-tout, seuls les mots du nom comptent.
 * Défaut : `dish`.
 */
export function foodCategory(input: { name: string; ciqualGroup?: string }): FoodCategory {
  const name = normalizeFoodSearch(input.name)
  const group = input.ciqualGroup === undefined ? '' : normalizeFoodSearch(input.ciqualGroup)

  switch (group) {
    case GROUP_MEAT:
      return (
        firstMatch(name, [
          ['egg', EGG],
          ['fish', FISH],
        ]) ?? 'meat'
      )
    case GROUP_FRUITS:
      // Haricots verts = légume ; légumineuses et tubercules (starch) avant « pomme » et avant les oléagineux
      // (« pomme de terre noisette », « haricot coco ») ; puis oléagineux (fat).
      if (hasAny(name, ['haricot vert', 'haricots verts', 'petit pois', 'petits pois'])) return 'vegetable'
      if (hasAny(name, STARCH) || hasAny(name, ['haricot'])) return 'starch'
      if (hasAny(name, NUTS)) return 'fat'
      return hasAny(name, FRUIT) ? 'fruit' : 'vegetable'
    case GROUP_CEREALS:
      if (hasAny(name, ['biscuit', 'gateau', 'cookie', 'madeleine', 'chocolat', 'viennoiserie', 'barre']))
        return 'sweet'
      if (hasAny(name, ['pizza', 'quiche', 'sandwich'])) return 'dish'
      return hasAny(name, BREAD) ? 'bread' : 'starch'
    case GROUP_DAIRY:
      if (hasAny(name, FRESH_CHEESE) || hasAny(name, ['lait', 'yaourt', 'creme'])) return 'dairy'
      return hasAny(name, CHEESE) ? 'cheese' : 'dairy'
    case GROUP_DRINKS:
      return 'drink'
    case GROUP_SWEET:
    case GROUP_ICE:
      return 'sweet'
    case GROUP_FAT:
      return 'fat'
    case GROUP_DISHES:
      return 'dish'
    default:
      // « Autres », « Aides culinaires… », « Aliments infantiles », groupe inconnu ou absent.
      return categoryFromName(name)
  }
}

/** Produit scanné (code-barres ou Open Food Facts) : son visuel peut être une photo, avec le badge code-barres. */
export function isScannedFood(food: Pick<Food, 'ean' | 'source'>): boolean {
  return food.ean !== undefined || food.source === 'off'
}

/**
 * Visuel d'une ligne du journal. `ctx.food` est l'aliment référencé (origine `food`) s'il existe encore ; le groupe
 * Ciqual est fourni par l'appelant (l'aliment ne le porte pas).
 */
export function entryVisual(entry: FoodLogEntry, ctx: { food?: Food; ciqualGroup?: string }): FoodVisual {
  const origin = entry.origin
  if (origin.kind === 'recipe') {
    return { category: 'dish', scanned: false, fromFridge: origin.fridgeItemId !== undefined }
  }
  if (origin.kind === 'food') {
    const food = ctx.food
    const scanned = food !== undefined && isScannedFood(food)
    const visual: FoodVisual = {
      category: foodCategory({ name: food?.name ?? entry.name, ciqualGroup: ctx.ciqualGroup }),
      scanned,
      fromFridge: false,
    }
    if (scanned && food) visual.photoFoodId = food.id
    return visual
  }
  return { category: foodCategory({ name: entry.name }), scanned: false, fromFridge: false }
}
