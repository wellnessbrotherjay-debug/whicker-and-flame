import {checkRecipe, checkServings, checkDate, checkSlot, checkPreferences, SLOTS} from '../shared/kitchen.mjs';
import {transaction} from './db.mjs';

// A signed-in person's own kitchen. Every query is scoped to the user id from their session.
export function createKitchen(pool, recipes) {
  const known = id => recipes.some(r => r.id === id);

  async function read(userId, db = pool) {
    const [favorites, plan, listed, marks, user] = await Promise.all([
      db.query('SELECT recipeid FROM favorites WHERE fkuserid = $1 ORDER BY createddate', [userId]),
      db.query(`SELECT id, to_char(plandate, 'YYYY-MM-DD') AS date, mealslot, recipeid, servings FROM planentries
                 WHERE fkuserid = $1 AND plandate >= current_date - 1 ORDER BY plandate, array_position($2::text[], mealslot), id`, [userId, SLOTS]),
      db.query('SELECT recipeid, servings FROM listrecipes WHERE fkuserid = $1 ORDER BY createddate', [userId]),
      db.query('SELECT itemkey, state FROM shoppingmarks WHERE fkuserid = $1', [userId]),
      db.query('SELECT preferences FROM users WHERE id = $1', [userId]),
    ]);
    return {
      favorites: favorites.rows.map(r => r.recipeid).filter(known),
      plan: plan.rows.filter(r => known(r.recipeid)).map(r => ({id: Number(r.id), date: r.date, slot: r.mealslot, recipeId: r.recipeid, servings: r.servings})),
      listed: listed.rows.filter(r => known(r.recipeid)).map(r => ({recipeId: r.recipeid, servings: r.servings})),
      marks: Object.fromEntries(marks.rows.map(m => [m.itemkey, m.state])),
      preferences: user.rows[0]?.preferences || {},
    };
  }

  async function plan(db, userId, {date, slot, recipeId, servings}) {
    const recipe = checkRecipe(recipes, recipeId);
    await db.query(
      `INSERT INTO planentries(fkuserid, plandate, mealslot, recipeid, servings) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (fkuserid, plandate, mealslot, recipeid) DO UPDATE SET servings = EXCLUDED.servings`,
      [userId, checkDate(date), checkSlot(slot), recipeId, checkServings(servings, recipe)]);
  }

  async function list(db, userId, {recipeId, servings}) {
    const recipe = checkRecipe(recipes, recipeId);
    await db.query(
      `INSERT INTO listrecipes(fkuserid, recipeid, servings) VALUES ($1, $2, $3)
       ON CONFLICT (fkuserid, recipeid) DO UPDATE SET servings = EXCLUDED.servings`, [userId, recipeId, checkServings(servings, recipe)]);
  }

  async function mark(db, userId, key, state) {
    if (typeof key !== 'string' || !key || key.length > 300) throw Error('Unknown shopping item.');
    if (state === 'clear') return db.query('DELETE FROM shoppingmarks WHERE fkuserid = $1 AND itemkey = $2', [userId, key]);
    if (!['checked', 'removed'].includes(state)) throw Error('Unknown shopping action.');
    await db.query(`INSERT INTO shoppingmarks(fkuserid, itemkey, state) VALUES ($1, $2, $3)
                    ON CONFLICT (fkuserid, itemkey) DO UPDATE SET state = EXCLUDED.state`, [userId, key, state]);
  }

  return {
    read,

    async setFavorite(userId, recipeId, saved) {
      checkRecipe(recipes, recipeId);
      if (saved) await pool.query('INSERT INTO favorites(fkuserid, recipeid) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, recipeId]);
      else await pool.query('DELETE FROM favorites WHERE fkuserid = $1 AND recipeid = $2', [userId, recipeId]);
      return read(userId);
    },

    async addToPlan(userId, entry) { await plan(pool, userId, entry); return read(userId); },

    async removeFromPlan(userId, entryId) {
      await pool.query('DELETE FROM planentries WHERE fkuserid = $1 AND id = $2', [userId, Number(entryId)]);
      return read(userId);
    },

    async addToList(userId, entry) { await list(pool, userId, entry); return read(userId); },

    async removeFromList(userId, recipeId) {
      await pool.query('DELETE FROM listrecipes WHERE fkuserid = $1 AND recipeid = $2', [userId, recipeId]);
      return read(userId);
    },

    async markShopping(userId, key, state) { await mark(pool, userId, key, state); return read(userId); },

    // Ticked items are taken off the list.
    async clearChecked(userId) {
      await pool.query(`UPDATE shoppingmarks SET state = 'removed' WHERE fkuserid = $1 AND state = 'checked'`, [userId]);
      return read(userId);
    },

    async resetList(userId) {
      await pool.query('DELETE FROM shoppingmarks WHERE fkuserid = $1', [userId]);
      await pool.query('DELETE FROM listrecipes WHERE fkuserid = $1', [userId]);
      return read(userId);
    },

    async setPreferences(userId, input) {
      await pool.query('UPDATE users SET preferences = $2 WHERE id = $1', [userId, JSON.stringify(checkPreferences(input))]);
      return read(userId);
    },

    // A visitor's browser kitchen joins their account when they sign in; nothing already saved is lost.
    async merge(userId, local = {}) {
      return transaction(pool, async db => {
        for (const id of (local.favorites || []).filter(known)) {
          await db.query('INSERT INTO favorites(fkuserid, recipeid) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, id]);
        }
        for (const entry of (local.plan || []).filter(e => known(e.recipeId))) {
          await db.query(`INSERT INTO planentries(fkuserid, plandate, mealslot, recipeid, servings) VALUES ($1, $2, $3, $4, $5)
                          ON CONFLICT DO NOTHING`, [userId, checkDate(entry.date), checkSlot(entry.slot), entry.recipeId, checkServings(entry.servings, checkRecipe(recipes, entry.recipeId))]);
        }
        for (const entry of (local.listed || []).filter(e => known(e.recipeId))) {
          await db.query('INSERT INTO listrecipes(fkuserid, recipeid, servings) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [userId, entry.recipeId, checkServings(entry.servings, checkRecipe(recipes, entry.recipeId))]);
        }
        for (const [key, state] of Object.entries(local.marks || {}).slice(0, 500)) {
          if (['checked', 'removed'].includes(state) && typeof key === 'string' && key.length <= 300) {
            await db.query('INSERT INTO shoppingmarks(fkuserid, itemkey, state) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [userId, key, state]);
          }
        }
        const prefs = checkPreferences(local.preferences || {});
        if (Object.keys(prefs).length) {
          await db.query(`UPDATE users SET preferences = $2 WHERE id = $1 AND preferences = '{}'::jsonb`, [userId, JSON.stringify(prefs)]);
        }
        return read(userId, db);
      });
    },
  };
}
