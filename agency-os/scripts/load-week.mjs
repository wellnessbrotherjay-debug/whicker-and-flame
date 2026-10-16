// Loads a week of Whisker & Heat posts into the Agency OS through its API, exactly as the weekly planner does:
// one post a day at the brand's publish time (Bali), Monday first. Each post lands as a draft with its slide renders queued.
// Usage (on the server): WHOS_API_URL=... WHOS_API_TOKEN=... node load-week.mjs week.json 2026-10-19
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const [file, monday] = process.argv.slice(2);
if (!file || !/^\d{4}-\d{2}-\d{2}$/.test(monday || '')) throw Error('usage: load-week.mjs <week.json> <monday YYYY-MM-DD>');
const api = process.env.WHOS_API_URL, token = process.env.WHOS_API_TOKEN;
if (!api || !token) throw Error('WHOS_API_URL and WHOS_API_TOKEN are required');
const call = async (method, body) => {
  const r = await fetch(api + '/empire/agencyos/AgencyOSService/' + method, {method: 'POST', headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  const j = await r.json();
  if (!r.ok) throw Error(method + ': ' + JSON.stringify(j).slice(0, 300));
  return j;
};

const {posts} = JSON.parse(readFileSync(file, 'utf8'));
const context = await call('LoadContext', {tenant: 'whisker'});
const pillars = new Set((context.pillars || []).map(p => p.name));
const hash = 'manual:' + createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 16);
for (const [i, p] of posts.entries()) {
  if (!pillars.has(p.pillar)) throw Error('unknown pillar ' + p.pillar);
  const when = new Date(`${monday}T18:00:00+08:00`);
  when.setUTCDate(when.getUTCDate() + i);
  const post = {tenant: 'whisker', brand_version: context.brand.version, ...p,
    length_bucket: p.format === 'single' ? 'single' : (p.slides.length <= 5 ? 'short' : 'long'),
    scheduled_for: when.toISOString(), prompt_hash: hash};
  const saved = await call('InsertPost', {post: JSON.stringify(post)});
  console.log(i + 1, p.hook, '→', JSON.stringify(saved).slice(0, 120));
}
