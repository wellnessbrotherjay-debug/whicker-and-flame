import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/db.mjs';
import {createStore} from '../server/store.mjs';
import {createAuth} from '../server/auth.mjs';
import {createKitchen} from '../server/kitchen.mjs';
import {recipes} from '../server/catalog.mjs';

// Runs against a throwaway database: TEST_DATABASE_URL, e.g. postgres://localhost/whisker_test
const pool = await openDatabase(process.env.TEST_DATABASE_URL || 'postgres://localhost/whisker_test');
await pool.query('TRUNCATE jobs, users CASCADE');
test.after(() => pool.end());

const store = createStore(pool, recipes);
const auth = createAuth(pool);
const kitchen = createKitchen(pool, recipes);
const prompt = 'Simba stirs the sauce while Milo checks the basil.';

test('jobs validate recipe and stay out of the public catalogue until approved', async () => {
  await assert.rejects(store.createJob({recipeId: 'unknown', prompt}));
  const job = await store.createJob({recipeId: 'creamy-tomato-dreams', prompt});
  assert.equal(job.status, 'draft');
  await assert.rejects(store.approve(job.id));
  await store.complete(job.id, {videoUrl: 'https://example.com/episode.mp4'});
  await store.complete(job.id, {videoUrl: 'https://example.com/episode.mp4'});
  assert.equal((await store.episodes()).length, 0);
  await store.approve(job.id);
  assert.equal((await store.episodes()).length, 1);
  await assert.rejects(store.complete(job.id, {videoUrl: 'https://example.com/other.mp4'}));
  await assert.rejects(store.complete(job.id, {videoUrl: 'javascript:alert(1)'}));
});

test('accounts: duplicate email, wrong password and session lookup', async () => {
  const {user, token} = await auth.register({email: 'Cook@Example.com', password: 'longenough', name: 'Cook'});
  assert.equal(user.email, 'cook@example.com');
  await assert.rejects(auth.register({email: 'cook@example.com', password: 'longenough'}));
  await assert.rejects(auth.signIn({email: 'cook@example.com', password: 'wrong-password'}));
  assert.equal((await auth.userFor(token)).id, user.id);
  await auth.signOut(token);
  assert.equal(await auth.userFor(token), null);
});

test('kitchen data belongs to one person only', async () => {
  const a = (await auth.register({email: 'a@example.com', password: 'longenough'})).user;
  const b = (await auth.register({email: 'b@example.com', password: 'longenough'})).user;
  await kitchen.setFavorite(a.id, 'lemon-pea-risotto', true);
  await kitchen.addToPlan(a.id, {date: '2099-01-02', slot: 'dinner', recipeId: 'roasted-tomato-soup', servings: 4});
  const mine = await kitchen.addToPlan(a.id, {date: '2099-01-02', slot: 'lunch', recipeId: 'creamy-tomato-dreams', servings: 4});
  assert.deepEqual(mine.favorites, ['lemon-pea-risotto']);
  assert.deepEqual(mine.plan.map(p => p.slot), ['lunch', 'dinner'], 'slots are ordered through the day');
  const theirs = await kitchen.read(b.id);
  assert.deepEqual(theirs, {favorites: [], plan: [], listed: [], marks: {}, preferences: {}});
  await kitchen.removeFromPlan(b.id, mine.plan[0].id);
  assert.equal((await kitchen.read(a.id)).plan.length, 2, 'another person cannot remove my plan');
  await assert.rejects(kitchen.addToPlan(a.id, {date: '2099-01-02', slot: 'brunch', recipeId: 'creamy-tomato-dreams'}));
});

test('list recipes, ticks, clear completed and validation', async () => {
  const c = (await auth.register({email: 'c@example.com', password: 'longenough'})).user;
  let k = await kitchen.addToList(c.id, {recipeId: 'garden-pesto-twirls', servings: 4});
  assert.deepEqual(k.listed, [{recipeId: 'garden-pesto-twirls', servings: 4}]);
  k = await kitchen.markShopping(c.id, 'fusilli|g', 'checked');
  assert.equal(k.marks['fusilli|g'], 'checked');
  k = await kitchen.clearChecked(c.id);
  assert.equal(k.marks['fusilli|g'], 'removed');
  k = await kitchen.resetList(c.id);
  assert.deepEqual(k.listed, []);
  assert.deepEqual(k.marks, {});
  await assert.rejects(kitchen.addToPlan(c.id, {date: 'not-a-date', recipeId: 'garden-pesto-twirls'}));
  await assert.rejects(kitchen.addToList(c.id, {recipeId: 'garden-pesto-twirls', servings: 99}));
  await assert.rejects(kitchen.setPreferences(c.id, {maxMinutes: 7}));
  assert.deepEqual((await kitchen.setPreferences(c.id, {maxMinutes: 30, meatFree: true})).preferences, {maxMinutes: 30, meatFree: true});
});

test('a visitor kitchen merges into an account without losing anything', async () => {
  const d = (await auth.register({email: 'd@example.com', password: 'longenough'})).user;
  await kitchen.setFavorite(d.id, 'apple-oat-crumble', true);
  const k = await kitchen.merge(d.id, {
    favorites: ['apple-oat-crumble', 'mushroom-bruschetta', 'not-a-recipe'],
    plan: [{date: '2099-03-01', slot: 'breakfast', recipeId: 'slow-sunday-pancakes', servings: 2}],
    listed: [{recipeId: 'roasted-tomato-soup', servings: 4}],
    marks: {'note:pinch of salt': 'checked'},
    preferences: {difficulty: 'Easy'},
  });
  assert.deepEqual(k.favorites.sort(), ['apple-oat-crumble', 'mushroom-bruschetta']);
  assert.equal(k.plan.length, 1);
  assert.equal(k.listed.length, 1);
  assert.equal(k.marks['note:pinch of salt'], 'checked');
  assert.deepEqual(k.preferences, {difficulty: 'Easy'});
});
