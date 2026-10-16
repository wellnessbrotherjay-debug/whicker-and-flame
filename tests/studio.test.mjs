import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/db.mjs';
import {createStudio} from '../server/studio.mjs';
import {site} from '../server/catalog.mjs';
import recipes from './fixtures/recipes.json' with {type: 'json'};
import {planWeek, canMove} from '../shared/content.mjs';
import brand from '../content/brandkit.json' with {type: 'json'};

const pool = await openDatabase(process.env.TEST_DATABASE_URL || 'postgres://localhost/whisker_test');
await pool.query('TRUNCATE posts, linkcounts, brandkit CASCADE');
test.after(() => pool.end());
const studio = createStudio(pool, {site, recipes, timezone: 'Asia/Makassar'});

test('the weekly plan follows the cadence and advances the season', () => {
  const week = planWeek('2026-10-21', {site, recipes, brand});
  assert.equal(week.length, 5);
  assert.deepEqual(week.map(p => p.date), ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'], 'any day plans its Monday-to-Friday week');
  assert.equal(week[0].episode, 1, 'the first unplanned episode comes first');
  assert.equal(week.filter(p => p.format === 'recipe').length >= 1, true);
  assert.ok(week[4].poll, 'the challenge carries a community poll');
  assert.ok(week.every(p => recipes.some(r => r.id === p.recipeId)), 'every post links to a real recipe');
  const next = planWeek('2026-10-28', {site, recipes, brand, existing: week});
  assert.equal(next[0].episode, 2, 'the following week moves to the next episode');
});

test('planning the same week twice does not duplicate posts', async () => {
  assert.equal(await studio.planWeek('2026-10-19'), 5);
  assert.equal(await studio.planWeek('2026-10-19'), 0);
  assert.equal((await studio.list({from: '2026-10-19', to: '2026-10-25'})).length, 5);
});

test('posts move through the stages and cannot skip review or approval', async () => {
  const post = await studio.create({title: 'Test gag', pillar: 'naughty-cat-cafe', format: 'gag', platforms: ['instagram', 'tiktok'], characters: ['nico', 'milo'], recipeId: 'slow-sunday-pancakes'});
  assert.equal(post.status, 'idea');
  assert.equal(canMove('idea', 'approved'), false);
  await assert.rejects(studio.move(post.id, 'approved'));
  await studio.move(post.id, 'script');
  await assert.rejects(studio.move(post.id, 'review'), /script/);
  await studio.update(post.id, {script: 'NICO: We can resolve this with dignity.\nMILO: I was just checking…'});
  await studio.move(post.id, 'review');
  await studio.move(post.id, 'approved', 'Lovely.');
  await assert.rejects(studio.move(post.id, 'scheduled'), /date/);
  await studio.update(post.id, {date: '2026-10-22', time: '18:00'});
  await assert.rejects(studio.move(post.id, 'scheduled'), /video or image/);
  await studio.update(post.id, {mediaUrl: 'https://example.com/gag.mp4', captions: {instagram: 'Nico has a shift to run.'}});
  await assert.rejects(studio.move(post.id, 'scheduled'), /tiktok/);
  await studio.update(post.id, {captions: {instagram: 'Nico has a shift to run.', tiktok: 'Milo is just checking.'}});
  const scheduled = await studio.move(post.id, 'scheduled');
  assert.equal(new Date(scheduled.scheduledFor).toISOString(), '2026-10-22T10:00:00.000Z', '18:00 in Bali is 10:00 UTC');
});

test('publishing needs a real link per platform; results and link counts are recorded', async () => {
  const [post] = (await studio.list()).filter(p => p.status === 'scheduled');
  await assert.rejects(studio.markPublished(post.id, {platform: 'instagram', url: 'not a link'}));
  let p = await studio.markPublished(post.id, {platform: 'instagram', url: 'https://www.instagram.com/reel/abc/', postId: '123'});
  assert.equal(p.status, 'scheduled', 'still waiting for TikTok');
  p = await studio.markPublished(post.id, {platform: 'tiktok', url: 'https://www.tiktok.com/@whisker/video/1', postId: '1'});
  assert.equal(p.status, 'published');
  await assert.rejects(studio.update(post.id, {title: 'Changed'}));
  p = await studio.recordMetrics(post.id, {platform: 'instagram', metrics: {views: 1200, saves: 40, shares: 12}});
  assert.equal(p.metrics.instagram.saves, 40);
  assert.equal(await studio.follow(p.slug), '/recipes/slow-sunday-pancakes?from=' + p.slug);
  await studio.count(p.slug, 'save');
  assert.deepEqual((await studio.get(p.id)).links, {open: 1, save: 1});
  assert.equal(await studio.follow('00000000'), null);
});

test('the AI writer may only draft an idea', async () => {
  const [idea] = (await studio.needingScript());
  const drafted = await studio.draft(idea.id, {hook: 'A new hook', script: 'LUNA: Interesting…', captions: {instagram: 'Draft caption'}});
  assert.equal(drafted.status, 'script');
  await assert.rejects(studio.draft(idea.id, {script: 'again'}));
});
