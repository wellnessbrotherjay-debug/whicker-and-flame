import {randomUUID} from 'node:crypto';
import {transaction} from './db.mjs';

// The video job queue the n8n workflow works through: draft -> dispatched -> generating -> review -> published.
export function createStore(pool, recipes) {
  const exists = id => recipes.some(r => r.id === id);
  const shape = row => row && {id: row.id, recipeId: row.recipeid, prompt: row.prompt, status: row.status, videoUrl: row.videourl,
    requestId: row.requestid, error: row.error, createdAt: row.createddate};
  const get = async id => shape((await pool.query('SELECT * FROM jobs WHERE id = $1', [id])).rows[0]);
  const found = async id => {
    const job = await get(id);
    if (!job) throw Error('Job not found.');
    return job;
  };

  return {
    jobs: async () => (await pool.query('SELECT * FROM jobs ORDER BY createddate DESC')).rows.map(shape),
    episodes: async () => (await pool.query(`SELECT * FROM jobs WHERE status = 'published' ORDER BY createddate DESC`)).rows
      .map(shape).map(({id, recipeId, videoUrl, createdAt}) => ({id, recipeId, videoUrl, createdAt})),
    pending: async () => (await pool.query(`SELECT * FROM jobs WHERE status = 'generating'`)).rows.map(shape),

    async createJob({recipeId, prompt}) {
      if (!exists(recipeId)) throw Error('Choose an existing recipe.');
      if (typeof prompt !== 'string' || prompt.trim().length < 10 || prompt.length > 4000) throw Error('Write a scene prompt between 10 and 4,000 characters.');
      const id = randomUUID();
      await pool.query(`INSERT INTO jobs(id, recipeid, prompt, status) VALUES ($1, $2, $3, 'draft')`, [id, recipeId, prompt.trim()]);
      return get(id);
    },

    async claim() {
      return transaction(pool, async client => {
        const {rows} = await client.query(`SELECT id FROM jobs WHERE status = 'draft' ORDER BY createddate LIMIT 1 FOR UPDATE SKIP LOCKED`);
        if (!rows.length) return null;
        await client.query(`UPDATE jobs SET status = 'dispatched' WHERE id = $1`, [rows[0].id]);
        return shape((await client.query('SELECT * FROM jobs WHERE id = $1', [rows[0].id])).rows[0]);
      });
    },

    async register(id, requestId) {
      const job = await found(id);
      if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{5,200}$/.test(requestId)) throw Error('Invalid generation request ID.');
      if (job.requestId === requestId) return job;
      if (job.status !== 'dispatched' || job.requestId) throw Error('Job cannot accept a new generation request.');
      await pool.query(`UPDATE jobs SET requestid = $1, status = 'generating' WHERE id = $2`, [requestId, id]);
      return get(id);
    },

    async fail(id, error) {
      const job = await found(id);
      if (!['dispatched', 'generating'].includes(job.status)) throw Error('Only an active job can fail.');
      await pool.query(`UPDATE jobs SET status = 'failed', error = $1 WHERE id = $2`, [String(error || 'Generation failed').slice(0, 500), id]);
      return get(id);
    },

    async complete(id, {videoUrl}) {
      const job = await found(id);
      let url;
      try { url = new URL(videoUrl); } catch { throw Error('Provide an HTTPS video URL.'); }
      if (url.protocol !== 'https:') throw Error('Provide an HTTPS video URL.');
      if (job.videoUrl) {
        if (job.videoUrl === videoUrl) return job;
        throw Error('A completed result cannot be replaced. Create a new job.');
      }
      if (!['draft', 'dispatched', 'generating'].includes(job.status)) throw Error('Job cannot receive a result in this state.');
      await pool.query(`UPDATE jobs SET videourl = $1, status = 'review' WHERE id = $2`, [videoUrl, id]);
      return get(id);
    },

    async approve(id) {
      const job = await found(id);
      if (job.status === 'published') return job;
      if (job.status !== 'review' || !job.videoUrl) throw Error('A finished video must be reviewed first.');
      await pool.query(`UPDATE jobs SET status = 'published' WHERE id = $1`, [id]);
      return get(id);
    },
  };
}
