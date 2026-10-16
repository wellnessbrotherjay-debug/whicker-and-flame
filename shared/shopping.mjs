// Turns recipes into one shopping list. Used by the browser and the server alike.
// Only lines with a real amount are added together, and only when the item and the kind
// of unit match (g with kg, ml with l, tsp, tbsp, or plain counts). Anything else,
// such as "Black pepper to taste", is listed once as it is written.

const UNITS = {
  g: {base: 'g', factor: 1},
  kg: {base: 'g', factor: 1000},
  ml: {base: 'ml', factor: 1},
  l: {base: 'ml', factor: 1000},
  tsp: {base: 'tsp', factor: 1},
  tbsp: {base: 'tbsp', factor: 1},
};

// Words that describe what an ingredient is for, not what to buy.
const PURPOSE = /\s+for\s+(?:the\s+)?(?:fruit|topping|cooking|serving|pasta water)\b.*$/;

const AISLES = [
  ['Herbs & spices', /salt|black pepper|cumin|paprika|oregano|cinnamon|chili flakes/],
  ['Fruit & vegetables', /tomato|onion|garlic|basil|spinach|mushroom|red pepper|lemon|lime|apple|berr|cucumber|sweet potato|parsley|coriander|thyme/],
  ['Dairy & eggs', /butter|cream|milk|parmesan|ricotta|mozzarella|yogurt|egg/],
  ['Cupboard', /pasta|fusilli|penne|rice|flour|sugar|oats|couscous|beans|chickpeas|canned|can |stock|passata|oil|maple|bread|sourdough|pine nuts|baking powder/],
];

export function aisleFor(name) {
  const text = name.toLowerCase();
  if (/frozen/.test(text)) return 'Frozen';
  if (/canned|^can |passata/.test(text)) return 'Cupboard';
  for (const [aisle, pattern] of AISLES) if (pattern.test(text)) return aisle;
  return 'Other';
}

function amount(text) {
  const fraction = text.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  return Number(text);
}

export function parseIngredient(line) {
  const match = line.trim().match(/^(\d+(?:\.\d+)?|\d+\/\d+)\s+(?:(kg|g|ml|l|tsp|tbsp)\s+)?(.+)$/i);
  if (!match) return {line: line.trim()};
  const quantity = amount(match[1]);
  const unit = match[2] ? UNITS[match[2].toLowerCase()] : {base: '', factor: 1};
  const name = match[3].split(',')[0].replace(PURPOSE, '').replace(/^(?:hot|cold|melted|washed)\s+/i, '').trim().toLowerCase();
  return {quantity: quantity * unit.factor, unit: unit.base, name};
}

const FRACTIONS = {25: '¼', 50: '½', 75: '¾'};

function round(n) {
  if (Number.isInteger(n)) return String(n);
  const whole = Math.floor(n), part = Math.round((n - whole) * 100);
  if (FRACTIONS[part]) return (whole ? whole + ' ' : '') + FRACTIONS[part];
  return String(Math.round(n * 100) / 100);
}

// Weights and volumes read best as whole numbers (one decimal place in kg and l);
// spoons read best as quarters; eggs, onions and cloves as whole ones.
export function formatAmount(quantity, unit) {
  if (unit === 'g' || unit === 'ml') {
    if (quantity >= 1000) return `${Math.round(quantity / 100) / 10} ${unit === 'g' ? 'kg' : 'l'}`;
    return `${Math.max(1, Math.round(quantity))} ${unit}`;
  }
  if (!unit) return String(Math.max(1, Math.round(quantity)));
  return `${round(Math.max(0.25, Math.round(quantity * 4) / 4))} ${unit}`;
}

// One ingredient line rescaled for a different number of servings.
export function scaleLine(line, scale) {
  if (scale === 1) return line;
  const match = line.trim().match(/^(\d+(?:\.\d+)?|\d+\/\d+)\s+(?:(kg|g|ml|l|tsp|tbsp)\s+)?(.+)$/i);
  if (!match) return line;
  const unit = match[2] ? UNITS[match[2].toLowerCase()] : {base: '', factor: 1};
  return `${formatAmount(amount(match[1]) * unit.factor * scale, unit.base)} ${match[3]}`;
}

// entries: [{recipe, servings}] where recipe is a catalogue recipe.
export function buildShoppingList(entries) {
  const totals = new Map();
  const asWritten = new Map();
  for (const {recipe, servings} of entries) {
    const scale = recipe.servings ? servings / recipe.servings : 1;
    for (const line of recipe.ingredients) {
      const item = parseIngredient(line);
      if (item.line) {
        const key = 'note:' + item.line.toLowerCase();
        if (!asWritten.has(key)) asWritten.set(key, {key, label: item.line, aisle: aisleFor(item.line), recipes: new Set()});
        asWritten.get(key).recipes.add(recipe.title);
        continue;
      }
      if (/^(?:boiling\s+|hot\s+)?water$/.test(item.name)) continue;
      const key = item.name + '|' + item.unit;
      if (!totals.has(key)) totals.set(key, {key, name: item.name, unit: item.unit, quantity: 0, recipes: new Set()});
      const total = totals.get(key);
      total.quantity += item.quantity * scale;
      total.recipes.add(recipe.title);
    }
  }
  const items = [...totals.values()].map(t => ({key: t.key, label: `${formatAmount(t.quantity, t.unit)} ${t.name}`, aisle: aisleFor(t.name), recipes: [...t.recipes]}));
  const notes = [...asWritten.values()].map(n => ({...n, recipes: [...n.recipes]}));
  return [...items, ...notes].sort((a, b) => a.aisle.localeCompare(b.aisle) || a.key.localeCompare(b.key));
}

// The person's own list: everything for their planned meals and the recipes they added,
// without what they removed, with what they ticked.
export function shoppingFor(kitchen, recipes) {
  const byId = new Map(recipes.map(r => [r.id, r]));
  const entries = [...kitchen.plan, ...kitchen.listed]
    .filter(e => byId.has(e.recipeId))
    .map(e => ({recipe: byId.get(e.recipeId), servings: e.servings}));
  return buildShoppingList(entries)
    .filter(item => kitchen.marks[item.key] !== 'removed')
    .map(item => ({...item, checked: kitchen.marks[item.key] === 'checked'}));
}
