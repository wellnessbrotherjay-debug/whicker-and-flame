import test from 'node:test';
import assert from 'node:assert/strict';
import {parseIngredient, buildShoppingList, scaleLine} from '../shared/shopping.mjs';

const soup = {title: 'Soup', servings: 4, ingredients: ['400 g canned chopped tomatoes', '15 ml olive oil', '2 garlic cloves, finely chopped', 'Black pepper to taste']};
const pasta = {title: 'Pasta', servings: 2, ingredients: ['400 g canned chopped tomatoes', '1/2 tsp fine salt', '2 garlic cloves, finely chopped', 'Black pepper to taste']};

test('reads amounts, fractions and units', () => {
  assert.deepEqual(parseIngredient('1/2 tsp fine salt, plus salt for pasta water'), {quantity: 0.5, unit: 'tsp', name: 'fine salt'});
  assert.deepEqual(parseIngredient('1.5 kg potatoes'), {quantity: 1500, unit: 'g', name: 'potatoes'});
  assert.deepEqual(parseIngredient('2 garlic cloves, finely chopped'), {quantity: 2, unit: '', name: 'garlic cloves'});
  assert.deepEqual(parseIngredient('Pinch of salt'), {line: 'Pinch of salt'});
});

test('adds the same item in the same unit and scales by servings', () => {
  const list = buildShoppingList([{recipe: soup, servings: 4}, {recipe: pasta, servings: 4}]);
  const labels = list.map(i => i.label);
  assert.ok(labels.includes('1.2 kg canned chopped tomatoes'), labels.join(' / '));
  assert.ok(labels.includes('6 garlic cloves'));
  assert.ok(labels.includes('1 tsp fine salt'));
  assert.equal(scaleLine('1/4 tsp fine salt', 3), '¾ tsp fine salt');
  assert.equal(labels.filter(l => l === 'Black pepper to taste').length, 1);
});

test('merges purpose words, skips water and groups by aisle', async () => {
  const r = {title: 'Crumble', servings: 4, ingredients: ['30 g light brown sugar for the fruit', '40 g light brown sugar for topping', '30 ml water', '60 g cold butter, diced', '15 g butter']};
  const list = buildShoppingList([{recipe: r, servings: 4}]);
  assert.deepEqual(list.map(i => i.label).sort(), ['70 g light brown sugar', '75 g butter'].sort());
  assert.equal(list.find(i => i.label.includes('butter')).aisle, 'Dairy & eggs');
});

test('never adds different kinds of unit together', () => {
  const r = {title: 'X', servings: 1, ingredients: ['10 g sugar', '1 tbsp sugar']};
  const labels = buildShoppingList([{recipe: r, servings: 1}]).map(i => i.label);
  assert.deepEqual(labels.sort(), ['1 tbsp sugar', '10 g sugar']);
});
