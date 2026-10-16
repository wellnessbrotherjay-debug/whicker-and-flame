import {scrypt, randomBytes, timingSafeEqual, createHash} from 'node:crypto';
import {promisify} from 'node:util';

const hashPassword = promisify(scrypt);
const SESSION_DAYS = 60;
export const COOKIE = 'wh_session';

const tokenHash = token => createHash('sha256').update(token).digest('hex');

async function makeHash(password) {
  const salt = randomBytes(16);
  const key = await hashPassword(password, salt, 64);
  return salt.toString('hex') + ':' + key.toString('hex');
}

async function matches(password, stored) {
  const [salt, key] = stored.split(':');
  const actual = await hashPassword(password, Buffer.from(salt, 'hex'), 64);
  return timingSafeEqual(actual, Buffer.from(key, 'hex'));
}

function cleanEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 200) throw Error('Enter a valid email address.');
  return value;
}

function checkPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) throw Error('Use a password of at least 8 characters.');
}

export function createAuth(pool) {
  async function startSession(userId) {
    const token = randomBytes(32).toString('base64url');
    await pool.query(
      `INSERT INTO sessions(tokenhash, fkuserid, expiresdate) VALUES ($1, $2, now() + interval '${SESSION_DAYS} days')`,
      [tokenHash(token), userId]);
    return token;
  }

  return {
    maxAge: SESSION_DAYS * 86400,

    async register({email, password, name}) {
      const address = cleanEmail(email);
      checkPassword(password);
      const displayName = String(name || '').trim().slice(0, 80);
      const existing = await pool.query('SELECT 1 FROM users WHERE email = $1', [address]);
      if (existing.rowCount) throw Error('An account with this email already exists. Sign in instead.');
      const {rows} = await pool.query(
        'INSERT INTO users(email, name, passwordhash) VALUES ($1, $2, $3) RETURNING id, email, name',
        [address, displayName, await makeHash(password)]);
      return {user: rows[0], token: await startSession(rows[0].id)};
    },

    async signIn({email, password}) {
      const address = cleanEmail(email);
      const {rows} = await pool.query('SELECT id, email, name, passwordhash FROM users WHERE email = $1', [address]);
      if (!rows.length || typeof password !== 'string' || !(await matches(password, rows[0].passwordhash))) {
        throw Error('That email and password do not match.');
      }
      const {passwordhash, ...user} = rows[0];
      return {user, token: await startSession(user.id)};
    },

    async userFor(token) {
      if (!token) return null;
      const {rows} = await pool.query(
        `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.fkuserid
          WHERE s.tokenhash = $1 AND s.expiresdate > now()`, [tokenHash(token)]);
      return rows[0] || null;
    },

    async signOut(token) {
      if (token) await pool.query('DELETE FROM sessions WHERE tokenhash = $1', [tokenHash(token)]);
    },
  };
}
