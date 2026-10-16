import {buildShoppingList} from './shopping.mjs';

// A signed-in person's own kitchen: saved recipes, dated meal plan and shopping list.
// Every query is scoped to the user id taken from their session, never from the request.
export function createKitchen(pool, recipes) {
  const byId = new Map(recipes.map(r => [r.id, r]));
  const recipe = id => {
    const r = byId.get(id);
    if (!r) throw Error('Choose a recipe from the library.');
    return r;
  };
  const isoDate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(Date.parse(value))) throw Error('Choose a valid date.');
    return value;
  };

  async function plan(userId) {
    const {rows} = await pool.query(
      `SELECT id, to_char(plandate, 'YYYY-MM-DD') AS date, recipeid, servings
         FROM planentries WHERE fkuserid = $1 AND plandate >= current_date - 1 ORDER BY plandate, id`, [userId]);
    return rows.filter(row => byId.has(row.recipeid)).map(row => ({id: Number(row.id), date: row.date, recipeId: row.recipeid, servings: row.servings}));
  }

  async function shopping(userId) {
    const entries = await plan(userId);
    const marks = await pool.query('SELECT itemkey, state FROM shoppingmarks WHERE fkuserid = $1', [userId]);
    const state = new Map(marks.rows.map(m => [m.itemkey, m.state]));
    return buildShoppingList(entries.map(e => ({recipe: byId.get(e.recipeId), servings: e.servings})))
      .filter(item => state.get(item.key) !== 'removed')
      .map(item => ({...item, checked: state.get(item.key) === 'checked'}));
  }

  return {
    async summary(userId) {
      const favorites = await pool.query('SELECT recipeid FROM favorites WHERE fkuserid = $1 ORDER BY createddate', [userId]);
      return {
        favorites: favorites.rows.map(r => r.recipeid).filter(id => byId.has(id)),
        plan: await plan(userId),
        shopping: await shopping(userId),
      };
    },

    async setFavorite(userId, recipeId, saved) {
      recipe(recipeId);
      if (saved) await pool.query('INSERT INTO favorites(fkuserid, recipeid) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, recipeId]);
      else await pool.query('DELETE FROM favorites WHERE fkuserid = $1 AND recipeid = $2', [userId, recipeId]);
    },

    async addToPlan(userId, {date, recipeId, servings}) {
      const r = recipe(recipeId);
      const count = servings === undefined ? r.servings : Number(servings);
      if (!Number.isInteger(count) || count < 1 || count > 20) throw Error('Choose between 1 and 20 servings.');
      await pool.query(
        `INSERT INTO planentries(fkuserid, plandate, recipeid, servings) VALUES ($1, $2, $3, $4)
         ON CONFLICT (fkuserid, plandate, recipeid) DO UPDATE SET servings = EXCLUDED.servings`,
        [userId, isoDate(date), recipeId, count]);
      // A new plan brings back anything the person had cleared from an earlier list.
      await pool.query(`DELETE FROM shoppingmarks WHERE fkuserid = $1 AND state = 'removed'`, [userId]);
    },

    async removeFromPlan(userId, entryId) {
      await pool.query('DELETE FROM planentries WHERE fkuserid = $1 AND id = $2', [userId, Number(entryId)]);
    },

    async markShopping(userId, itemKey, state) {
      if (typeof itemKey !== 'string' || itemKey.length > 300) throw Error('Unknown shopping item.');
      if (state === 'clear') {
        await pool.query('DELETE FROM shoppingmarks WHERE fkuserid = $1 AND itemkey = $2', [userId, itemKey]);
        return;
      }
      if (!['checked', 'removed'].includes(state)) throw Error('Unknown shopping action.');
      await pool.query(
        `INSERT INTO shoppingmarks(fkuserid, itemkey, state) VALUES ($1, $2, $3)
         ON CONFLICT (fkuserid, itemkey) DO UPDATE SET state = EXCLUDED.state`, [userId, itemKey, state]);
    },
  };
}
