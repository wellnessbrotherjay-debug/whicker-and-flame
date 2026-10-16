import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {checkPost, canMove, planWeek, linkSlug, PLATFORMS, STATUSES} from '../shared/content.mjs';
import {transaction} from './db.mjs';

const SEED_BRAND = JSON.parse(readFileSync(new URL('../content/brandkit.json', import.meta.url), 'utf8'));
const METRICS = ['views', 'reach', 'likes', 'comments', 'shares', 'saves', 'follows', 'linkClicks', 'watchSeconds', 'completionRate'];

// The Agency OS: posts from idea to published, the brand kit, and what each post led to.
export function createStudio(pool, {site, recipes, timezone}) {
  const shape = row => row && {
    id: row.id, title: row.title, status: row.status, pillar: row.pillar, format: row.format, platforms: row.platforms,
    characters: row.characters, recipeId: row.recipeid, episode: row.episode, hook: row.hook, script: row.script, shotlist: row.shotlist,
    captions: row.captions, hashtags: row.hashtags, poll: row.poll, notes: row.notes, reviewNote: row.reviewnote, mediaUrl: row.mediaurl,
    date: row.plandate, time: row.plantime, scheduledFor: row.scheduledfor, slug: row.slug, published: row.published, metrics: row.metrics,
    links: row.links || {}, modified: row.modifieddate,
  };
  const SELECT = `SELECT p.*, to_char(p.plandate, 'YYYY-MM-DD') AS plandate,
    (SELECT coalesce(jsonb_object_agg(event, total), '{}') FROM (SELECT event, sum(count) AS total FROM linkcounts l WHERE l.slug = p.slug GROUP BY event) t) AS links
    FROM posts p`;

  async function brand() {
    const {rows} = await pool.query('SELECT content FROM brandkit WHERE id = 1');
    return rows[0]?.content || SEED_BRAND;
  }
  async function get(id, db = pool) {
    const post = shape((await db.query(SELECT + ' WHERE p.id = $1', [id])).rows[0]);
    if (!post) throw Error('Post not found.');
    return post;
  }

  async function save(db, id, fields) {
    const columns = {title: 'title', pillar: 'pillar', format: 'format', platforms: 'platforms', characters: 'characters', recipeId: 'recipeid',
      episode: 'episode', hook: 'hook', script: 'script', shotlist: 'shotlist', captions: 'captions', hashtags: 'hashtags', poll: 'poll',
      notes: 'notes', mediaUrl: 'mediaurl', date: 'plandate', time: 'plantime'};
    const sets = [], values = [id];
    for (const [key, column] of Object.entries(columns)) {
      if (fields[key] === undefined) continue;
      values.push(key === 'captions' ? JSON.stringify(fields[key]) : fields[key]);
      sets.push(`${column} = $${values.length}`);
    }
    if (!sets.length) return;
    await db.query(`UPDATE posts SET ${sets.join(', ')}, modifieddate = now() WHERE id = $1`, values);
  }

  async function insert(db, post) {
    const id = randomUUID();
    await db.query(
      `INSERT INTO posts(id, title, status, pillar, format, platforms, characters, recipeid, episode, hook, notes, poll, plandate, plantime, slug)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [id, post.title, post.status || 'idea', post.pillar, post.format, post.platforms, post.characters || [], post.recipeId || null, post.episode || null,
        post.hook || '', post.notes || '', post.poll || '', post.date || null, post.time || null, linkSlug(id)]);
    return id;
  }

  return {
    brand,

    async setBrand(content) {
      if (!content || typeof content !== 'object' || !content.characters || !content.formats || !Array.isArray(content.hooks)) throw Error('The brand kit is missing characters, formats or hooks.');
      if (JSON.stringify(content).length > 100000) throw Error('The brand kit is too large.');
      await pool.query(`INSERT INTO brandkit(id, content) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, modifieddate = now()`, [JSON.stringify(content)]);
      return brand();
    },

    async list({from, to} = {}) {
      const {rows} = await pool.query(SELECT + ` WHERE ($1::date IS NULL OR p.plandate >= $1::date) AND ($2::date IS NULL OR p.plandate <= $2::date)
        ORDER BY p.plandate NULLS LAST, p.plantime, p.createddate`, [from || null, to || null]);
      return rows.map(shape);
    },

    get,

    async create(input) {
      const fields = checkPost(input, {site, recipes, brand: await brand()});
      for (const key of ['title', 'pillar', 'format', 'platforms']) if (fields[key] === undefined) throw Error('A new post needs a title, collection, format and platform.');
      return get(await insert(pool, fields));
    },

    async update(id, input) {
      const current = await get(id);
      if (current.status === 'published') throw Error('A published post cannot be changed.');
      await save(pool, id, checkPost(input, {site, recipes, brand: await brand()}));
      return get(id);
    },

    // People move posts through the stages. Scheduling needs a date, time, media and a caption for every platform.
    async move(id, status, note = '') {
      const post = await get(id);
      if (!STATUSES.includes(status) || !canMove(post.status, status)) throw Error(`A post cannot go from ${post.status} to ${status}.`);
      if (status === 'review' && !post.script.trim()) throw Error('Write the script before sending it for review.');
      if (status === 'scheduled') {
        if (!post.date || !post.time) throw Error('Give the post a date and time first.');
        if (!post.mediaUrl) throw Error('Attach the finished video or image first.');
        const missing = post.platforms.filter(p => !(post.captions[p] || '').trim());
        if (missing.length) throw Error('Write a caption for ' + missing.join(', ') + ' first.');
      }
      await pool.query(
        `UPDATE posts SET status = $2, reviewnote = $3, modifieddate = now(),
           scheduledfor = CASE WHEN $2 = 'scheduled' THEN (plandate + plantime::time) AT TIME ZONE $4 ELSE NULL END
         WHERE id = $1`, [id, status, String(note || '').slice(0, 1000), timezone]);
      return get(id);
    },

    async remove(id) {
      const post = await get(id);
      if (post.status === 'published') throw Error('A published post stays on record.');
      await pool.query('DELETE FROM posts WHERE id = $1', [id]);
    },

    async planWeek(weekStart) {
      if (typeof weekStart !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) throw Error('Choose the week to plan.');
      const existing = await this.list();
      const slate = planWeek(weekStart, {site, recipes, brand: await brand(), existing});
      const taken = new Set(existing.map(p => p.date + '|' + p.pillar + '|' + p.format));
      return transaction(pool, async db => {
        const made = [];
        for (const post of slate) if (!taken.has(post.date + '|' + post.pillar + '|' + post.format)) made.push(await insert(db, post));
        return made.length;
      });
    },

    // n8n: posts whose time has come. Each platform is published once; a post is done when every platform has a link.
    async due() {
      const {rows} = await pool.query(SELECT + ` WHERE p.status = 'scheduled' AND p.scheduledfor <= now() ORDER BY p.scheduledfor`);
      return rows.map(shape).map(p => ({...p, pending: p.platforms.filter(x => !p.published[x])}));
    },

    async needingScript() {
      const {rows} = await pool.query(SELECT + ` WHERE p.status = 'idea' ORDER BY p.plandate NULLS LAST LIMIT 10`);
      return rows.map(shape);
    },

    // The AI writer fills the draft; a person still reviews and approves it.
    async draft(id, {hook, script, shotlist, captions, hashtags}) {
      const post = await get(id);
      if (post.status !== 'idea') throw Error('Only an idea can receive a draft.');
      const fields = checkPost({hook, script, shotlist, captions, hashtags}, {site, recipes, brand: await brand()});
      await save(pool, id, fields);
      await pool.query(`UPDATE posts SET status = 'script', modifieddate = now() WHERE id = $1`, [id]);
      return get(id);
    },

    async markPublished(id, {platform, url, postId}) {
      if (!PLATFORMS.includes(platform)) throw Error('Unknown platform.');
      let link;
      try { link = new URL(url); } catch { throw Error('A published post needs its real https link.'); }
      if (link.protocol !== 'https:') throw Error('A published post needs its real https link.');
      return transaction(pool, async db => {
        const post = await get(id, db);
        if (post.status !== 'scheduled' && post.status !== 'published') throw Error('Only a scheduled post can be published.');
        if (post.published[platform]) return post;
        const published = {...post.published, [platform]: {url, postId: String(postId || ''), at: new Date().toISOString()}};
        const done = post.platforms.every(p => published[p]);
        await db.query(`UPDATE posts SET published = $2, status = $3, modifieddate = now() WHERE id = $1`,
          [id, JSON.stringify(published), done ? 'published' : 'scheduled']);
        return get(id, db);
      });
    },

    async recordMetrics(id, {platform, metrics}) {
      if (!PLATFORMS.includes(platform)) throw Error('Unknown platform.');
      const clean = {};
      for (const key of METRICS) if (metrics?.[key] !== undefined) {
        const n = Number(metrics[key]);
        if (!Number.isFinite(n) || n < 0) throw Error(`${key} must be a positive number.`);
        clean[key] = n;
      }
      await pool.query(`UPDATE posts SET metrics = jsonb_set(metrics, ARRAY[$2], $3::jsonb, true) WHERE id = $1 AND status = 'published'`,
        [id, platform, JSON.stringify({...clean, at: new Date().toISOString()})]);
      return get(id);
    },

    // Public: a post's short link. Only counts are kept.
    async follow(slug) {
      const {rows} = await pool.query('SELECT recipeid, episode FROM posts WHERE slug = $1', [slug]);
      if (!rows.length) return null;
      await pool.query(`INSERT INTO linkcounts(slug, event, count) VALUES ($1, 'open', 1) ON CONFLICT (slug, event, day) DO UPDATE SET count = linkcounts.count + 1`, [slug]);
      const {recipeid, episode} = rows[0];
      const target = recipeid ? '/recipes/' + recipeid : episode ? '/story/' + site.episodes.find(e => e.n === episode).slug : '/';
      return target + '?from=' + slug;
    },

    async count(slug, event) {
      if (!['save', 'plan', 'list', 'cooked'].includes(event)) throw Error('Unknown event.');
      await pool.query(`INSERT INTO linkcounts(slug, event, count)
        SELECT slug, $2, 1 FROM posts WHERE slug = $1
        ON CONFLICT (slug, event, day) DO UPDATE SET count = linkcounts.count + 1`, [slug, event]);
    },
  };
}
