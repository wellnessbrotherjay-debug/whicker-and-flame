import http from 'node:http';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {resolve, extname} from 'node:path';
import {recipes, site} from './catalog.mjs';
import {openDatabase} from './db.mjs';
import {createStore} from './store.mjs';
import {createAuth, COOKIE} from './auth.mjs';
import {createKitchen} from './kitchen.mjs';
import {createStudio} from './studio.mjs';

try { process.loadEnvFile('.env'); } catch {}

const production = process.argv.includes('--production');
const port = Number(process.env.PORT || 4317);
const origin = process.env.PUBLIC_ORIGIN || `http://localhost:${port}`;
const secureCookies = origin.startsWith('https://');
const admins = new Set(String(process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean));

const pool = await openDatabase(process.env.DATABASE_URL);
const store = createStore(pool, recipes);
const auth = createAuth(pool);
const kitchen = createKitchen(pool, recipes);
const studio = createStudio(pool, {site, recipes, timezone: process.env.CONTENT_TIMEZONE || 'Asia/Makassar'});
const vite = production ? null : await (await import('vite')).createServer({server: {middlewareMode: true}, appType: 'spa'});

const DIST = resolve('dist');
const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon'};
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; media-src 'self' https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

class HttpError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const json = (res, code, data, headers = {}) => {
  res.writeHead(code, {'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...SECURITY, ...headers});
  res.end(JSON.stringify(data));
};

async function body(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 20000) throw new HttpError(413, 'Request too large.');
  }
  try { return text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, 'Request was not valid JSON.'); }
}

function cookieToken(req) {
  const match = (req.headers.cookie || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  return match ? match[1] : null;
}

function sessionCookie(token, maxAge) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;
}

// Sign-in attempts per address, per 15 minutes.
const attempts = new Map();
function limit(req) {
  const key = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const now = Date.now();
  const recent = (attempts.get(key) || []).filter(t => now - t < 15 * 60 * 1000);
  if (recent.length >= 20) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
  recent.push(now);
  attempts.set(key, recent);
}

async function api(req, res, path, query) {
  const workflow = path.startsWith('/api/workflow/');
  if (workflow) {
    if (!process.env.WF_WORKFLOW_TOKEN || req.headers.authorization !== `Bearer ${process.env.WF_WORKFLOW_TOKEN}`) throw new HttpError(401, 'Workflow token required.');
  } else if (req.method !== 'GET' && req.headers.origin !== origin) {
    throw new HttpError(403, 'Request came from another site.');
  }

  const token = cookieToken(req);
  const user = await auth.userFor(token);
  const signedIn = () => { if (!user) throw new HttpError(401, 'Please sign in first.'); return user; };
  const admin = () => { if (!signedIn() || !admins.has(user.email)) throw new HttpError(403, 'Only the kitchen team can do this.'); return user; };
  const route = `${req.method} ${path}`;

  if (route === 'GET /api/catalog') return json(res, 200, {recipes, site, episodes: await store.episodes()});
  if (route === 'GET /api/me') {
    if (!user) return json(res, 200, {user: null});
    return json(res, 200, {user: {...user, isAdmin: admins.has(user.email)}, kitchen: await kitchen.read(user.id)});
  }
  if (route === 'POST /api/register' || route === 'POST /api/signin') {
    limit(req);
    const result = route === 'POST /api/register' ? await auth.register(await body(req)) : await auth.signIn(await body(req));
    return json(res, 200, {ok: true}, {'Set-Cookie': sessionCookie(result.token, auth.maxAge)});
  }
  if (route === 'POST /api/signout') {
    await auth.signOut(token);
    return json(res, 200, {ok: true}, {'Set-Cookie': sessionCookie('', 0)});
  }

  // Each change answers with the whole kitchen as it now stands.
  const kitchenRoutes = {
    'POST /api/kitchen/merge': b => kitchen.merge(user.id, b),
    'POST /api/favorites': b => kitchen.setFavorite(user.id, b.recipeId, b.saved === true),
    'POST /api/plan': b => kitchen.addToPlan(user.id, b),
    'POST /api/list': b => kitchen.addToList(user.id, b),
    'POST /api/list/remove': b => kitchen.removeFromList(user.id, b.recipeId),
    'POST /api/shopping': b => kitchen.markShopping(user.id, b.key, b.state),
    'POST /api/shopping/clear-checked': () => kitchen.clearChecked(user.id),
    'POST /api/shopping/reset': () => kitchen.resetList(user.id),
    'POST /api/preferences': b => kitchen.setPreferences(user.id, b),
  };
  if (kitchenRoutes[route]) {
    signedIn();
    return json(res, 200, {kitchen: await kitchenRoutes[route](await body(req))});
  }
  if (req.method === 'DELETE' && /^\/api\/plan\/\d+$/.test(path)) {
    signedIn();
    return json(res, 200, {kitchen: await kitchen.removeFromPlan(user.id, path.split('/')[3])});
  }

  // Agency OS (Studio): the kitchen team only.
  const id = path.match(/^\/api\/studio\/posts\/([0-9a-f-]{36})(?:\/(move|delete))?$/);
  if (path.startsWith('/api/studio/')) {
    admin();
    if (route === 'GET /api/studio/posts') return json(res, 200, await studio.list({from: query.get('from'), to: query.get('to')}));
    if (route === 'POST /api/studio/posts') return json(res, 201, await studio.create(await body(req)));
    if (route === 'POST /api/studio/plan-week') return json(res, 200, {created: await studio.planWeek((await body(req)).weekStart)});
    if (route === 'GET /api/studio/brand') return json(res, 200, await studio.brand());
    if (route === 'POST /api/studio/brand') return json(res, 200, await studio.setBrand(await body(req)));
    if (id && req.method === 'POST' && !id[2]) return json(res, 200, await studio.update(id[1], await body(req)));
    if (id && req.method === 'POST' && id[2] === 'move') { const b = await body(req); return json(res, 200, await studio.move(id[1], b.status, b.note)); }
    if (id && req.method === 'POST' && id[2] === 'delete') { await studio.remove(id[1]); return json(res, 200, {ok: true}); }
    throw new HttpError(404, 'Endpoint not found.');
  }
  if (route === 'POST /api/track') {
    const b = await body(req);
    if (typeof b.slug === 'string' && /^[0-9a-f]{8}$/.test(b.slug)) await studio.count(b.slug, b.event);
    return json(res, 200, {ok: true});
  }

  if (route === 'GET /api/status') return json(res, 200, {workflowConfigured: !!process.env.WF_WORKFLOW_TOKEN, videoGeneration: 'not_connected', instagram: 'not_connected'});
  if (route === 'GET /api/jobs') { admin(); return json(res, 200, await store.jobs()); }
  if (route === 'POST /api/jobs') { admin(); return json(res, 201, await store.createJob(await body(req))); }
  if (req.method === 'POST' && /^\/api\/jobs\/[^/]+\/approve$/.test(path)) { admin(); return json(res, 200, await store.approve(path.split('/')[3])); }

  const flow = path.match(/^\/api\/workflow\/posts\/([0-9a-f-]{36})\/(draft|published|metrics)$/);
  if (route === 'GET /api/workflow/context') return json(res, 200, {site, recipes, brand: await studio.brand()});
  if (route === 'GET /api/workflow/posts/ideas') return json(res, 200, {posts: await studio.needingScript()});
  if (route === 'GET /api/workflow/posts/due') return json(res, 200, {posts: await studio.due()});
  if (route === 'GET /api/workflow/posts/published') return json(res, 200, {posts: (await studio.list()).filter(p => p.status === 'published')});
  if (route === 'POST /api/workflow/plan-week') return json(res, 200, {created: await studio.planWeek((await body(req)).weekStart)});
  if (flow && req.method === 'POST') {
    const b = await body(req);
    if (flow[2] === 'draft') return json(res, 200, await studio.draft(flow[1], b));
    if (flow[2] === 'published') return json(res, 200, await studio.markPublished(flow[1], b));
    return json(res, 200, await studio.recordMetrics(flow[1], b));
  }
  if (route === 'POST /api/workflow/claim') return json(res, 200, {job: await store.claim()});
  if (route === 'GET /api/workflow/pending') return json(res, 200, {jobs: await store.pending()});
  if (route === 'POST /api/workflow/register') { const b = await body(req); return json(res, 200, await store.register(b.jobId, b.requestId)); }
  if (route === 'POST /api/workflow/fail') { const b = await body(req); return json(res, 200, await store.fail(b.jobId, b.error)); }
  if (route === 'POST /api/workflow/complete') { const b = await body(req); return json(res, 200, await store.complete(b.jobId, b)); }

  throw new HttpError(404, 'Endpoint not found.');
}

function serveFile(req, res, path) {
  let file = resolve(DIST, '.' + decodeURIComponent(path));
  const asset = file.startsWith(DIST + '/') && existsSync(file) && statSync(file).isFile();
  // Every page address is the one app page; a missing file with an extension is a real 404.
  if (!asset) {
    if (extname(path)) { res.writeHead(404, SECURITY); return res.end('Not found'); }
    file = resolve(DIST, 'index.html');
  }
  const cache = file.includes('/assets/') && /-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(file) ? 'public, max-age=31536000, immutable'
    : extname(file) === '.html' ? 'no-cache' : 'public, max-age=86400';
  res.writeHead(200, {'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': cache, ...SECURITY});
  res.end(readFileSync(file));
}

const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, origin).pathname;
  try {
    if (path === '/healthz') {
      await pool.query('SELECT 1');
      return json(res, 200, {ok: true});
    }
    if (path.startsWith('/api/')) return await api(req, res, path, new URL(req.url, origin).searchParams);
    const go = path.match(/^\/go\/([0-9a-f]{8})$/);
    if (go) {
      const target = await studio.follow(go[1]);
      res.writeHead(target ? 302 : 404, {Location: target || '/', 'Cache-Control': 'no-store', ...SECURITY});
      return res.end();
    }
    if (vite) return vite.middlewares(req, res);
    return serveFile(req, res, path);
  } catch (error) {
    // A database or programming fault is logged and answered plainly; its detail never reaches the visitor.
    if (error.severity || error instanceof TypeError || error instanceof ReferenceError) {
      console.error(error);
      return json(res, 500, {error: 'Something went wrong on our side. Please try again.'});
    }
    return json(res, error instanceof HttpError ? error.code : 400, {error: error.message || 'Unable to complete request.'});
  }
});

server.listen(port, production ? '0.0.0.0' : '127.0.0.1', () => console.log(`Whisker & Heat: ${origin}`));
