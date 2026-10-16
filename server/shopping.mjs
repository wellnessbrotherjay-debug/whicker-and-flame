// Turns planned recipes into one shopping list.
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
  const name = match[3].split(',')[0].trim().toLowerCase();
  return {quantity: quantity * unit.factor, unit: unit.base, name};
}

function display(quantity, unit) {
  if (unit === 'g' && quantity >= 1000) return `${round(quantity / 1000)} kg`;
  if (unit === 'ml' && quantity >= 1000) return `${round(quantity / 1000)} l`;
  return unit ? `${round(quantity)} ${unit}` : `${round(quantity)}`;
}

function round(n) {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

// plan: [{recipe, servings}] where recipe is a catalogue recipe.
export function buildShoppingList(plan) {
  const totals = new Map();
  const asWritten = new Map();
  for (const {recipe, servings} of plan) {
    const scale = recipe.servings ? servings / recipe.servings : 1;
    for (const line of recipe.ingredients) {
      const item = parseIngredient(line);
      if (item.line) {
        const key = item.line.toLowerCase();
        if (!asWritten.has(key)) asWritten.set(key, {key: 'note:' + key, label: item.line, recipes: new Set()});
        asWritten.get(key).recipes.add(recipe.title);
        continue;
      }
      const key = item.name + '|' + item.unit;
      if (!totals.has(key)) totals.set(key, {key, name: item.name, unit: item.unit, quantity: 0, recipes: new Set()});
      const total = totals.get(key);
      total.quantity += item.quantity * scale;
      total.recipes.add(recipe.title);
    }
  }
  const items = [...totals.values()]
    .map(t => ({key: t.key, label: `${display(t.quantity, t.unit)} ${t.name}`, recipes: [...t.recipes]}))
    .sort((a, b) => a.key.localeCompare(b.key));
  const notes = [...asWritten.values()].map(n => ({key: n.key, label: n.label, recipes: [...n.recipes]}));
  return [...items, ...notes];
}
