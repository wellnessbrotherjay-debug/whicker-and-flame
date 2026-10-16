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
  await kitchen.addToPlan(a.id, {date: '2099-01-02', recipeId: 'roasted-tomato-soup', servings: 4});
  await kitchen.addToPlan(a.id, {date: '2099-01-03', recipeId: 'creamy-tomato-dreams', servings: 4});
  const mine = await kitchen.summary(a.id);
  assert.deepEqual(mine.favorites, ['lemon-pea-risotto']);
  assert.equal(mine.plan.length, 2);
  assert.ok(mine.shopping.some(i => i.label === '800 g canned chopped tomatoes'), mine.shopping.map(i => i.label).join(' / '));
  const theirs = await kitchen.summary(b.id);
  assert.deepEqual(theirs, {favorites: [], plan: [], shopping: []});
  await kitchen.removeFromPlan(b.id, mine.plan[0].id);
  assert.equal((await kitchen.summary(a.id)).plan.length, 2, 'another person cannot remove my plan');
});

test('shopping list ticks and removals', async () => {
  const c = (await auth.register({email: 'c@example.com', password: 'longenough'})).user;
  await kitchen.addToPlan(c.id, {date: '2099-02-01', recipeId: 'garden-pesto-twirls'});
  const [first] = (await kitchen.summary(c.id)).shopping;
  await kitchen.markShopping(c.id, first.key, 'checked');
  assert.equal((await kitchen.summary(c.id)).shopping.find(i => i.key === first.key).checked, true);
  await kitchen.markShopping(c.id, first.key, 'removed');
  assert.ok(!(await kitchen.summary(c.id)).shopping.some(i => i.key === first.key));
  await assert.rejects(kitchen.addToPlan(c.id, {date: 'not-a-date', recipeId: 'garden-pesto-twirls'}));
  await assert.rejects(kitchen.addToPlan(c.id, {date: '2099-02-01', recipeId: 'garden-pesto-twirls', servings: 99}));
});
