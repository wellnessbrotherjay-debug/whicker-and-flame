// The rules for a person's kitchen, shared by the browser (visitors) and the server (accounts).
export const SLOTS = ['breakfast', 'lunch', 'dinner'];
export const PREFERENCES = {
  maxMinutes: [0, 20, 30, 45, 60],
  difficulty: ['', 'Easy', 'Medium'],
  budget: [false, true],
  meatFree: [false, true],
};

export const emptyKitchen = () => ({favorites: [], plan: [], listed: [], marks: {}, preferences: {}});

export function checkRecipe(recipes, id) {
  const recipe = recipes.find(r => r.id === id);
  if (!recipe) throw Error('Choose a recipe from the library.');
  return recipe;
}

export function checkServings(value, recipe) {
  const count = value === undefined || value === null || value === '' ? recipe.servings : Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 20) throw Error('Choose between 1 and 20 servings.');
  return count;
}

export function checkDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(Date.parse(value))) throw Error('Choose a valid date.');
  return value;
}

export function checkSlot(value) {
  const slot = value || 'dinner';
  if (!SLOTS.includes(slot)) throw Error('Choose breakfast, lunch or dinner.');
  return slot;
}

export function checkPreferences(input = {}) {
  const out = {};
  for (const [key, allowed] of Object.entries(PREFERENCES)) {
    if (input[key] === undefined) continue;
    if (!allowed.includes(input[key])) throw Error('Unknown preference.');
    out[key] = input[key];
  }
  return out;
}

// Whether a recipe suits a person's saved preferences.
export function suits(recipe, preferences = {}, collections = []) {
  if (preferences.maxMinutes && recipe.totalMinutes > preferences.maxMinutes) return false;
  if (preferences.difficulty && recipe.difficulty !== preferences.difficulty) return false;
  if (preferences.meatFree && !recipe.meatFree) return false;
  if (preferences.budget && !collections.find(c => c.id === 'budget-cat')?.recipes.includes(recipe.id)) return false;
  return true;
}
