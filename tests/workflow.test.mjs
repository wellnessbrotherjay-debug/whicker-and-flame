import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/db.mjs';
import {createStore} from '../server/store.mjs';
import {recipes} from '../server/catalog.mjs';

const pool = await openDatabase(process.env.TEST_DATABASE_URL || 'postgres://localhost/whisker_test');
test.after(() => pool.end());
const store = createStore(pool, recipes);
const prompt = 'Milo sneaks a taste while Nico plates the pasta.';

test('a workflow claims a job only once and records its generation ID', async () => {
  await pool.query('TRUNCATE jobs');
  const job = await store.createJob({recipeId: 'creamy-tomato-dreams', prompt});
  assert.equal((await store.claim()).id, job.id);
  assert.equal(await store.claim(), null);
  await assert.rejects(store.register(job.id, 'https://not-a-request'));
  await store.register(job.id, 'request-test-123');
  await store.register(job.id, 'request-test-123');
  assert.equal((await store.pending()).length, 1);
  await assert.rejects(store.register(job.id, 'different-request'));
  await store.complete(job.id, {videoUrl: 'https://example.com/finished.mp4'});
  assert.equal((await store.pending()).length, 0);
  assert.equal((await store.episodes()).length, 0);
});

test('a failed generation stays visible and is not silently resubmitted', async () => {
  await pool.query('TRUNCATE jobs');
  const job = await store.createJob({recipeId: 'creamy-tomato-dreams', prompt});
  await store.claim();
  await store.fail(job.id, 'Provider declined the request');
  assert.equal((await store.jobs())[0].status, 'failed');
  assert.equal(await store.claim(), null);
  await assert.rejects(store.approve(job.id));
});
