import {readFileSync} from 'node:fs';

// Recipes come from the Agency OS recipe library (the Recipe builder in the dashboard), never from a file here.
// The array is filled before the server starts and refreshed in place, so every module keeps the same reference.
export const recipes = [];
export const site = JSON.parse(readFileSync(new URL('../content/site.json', import.meta.url), 'utf8'));

export async function loadRecipes() {
  const api = process.env.WHOS_API_URL, token = process.env.WHOS_API_TOKEN;
  if (!api || !token) throw Error('WHOS_API_URL and WHOS_API_TOKEN are required to read the recipe library');
  const r = await fetch(api + '/empire/agencyos/AgencyOSService/ListRecipes', {method: 'POST',
    headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'}, body: JSON.stringify({tenant: 'whisker', publishedOnly: true})});
  if (!r.ok) throw Error('recipe library answered ' + r.status + ': ' + (await r.text()).slice(0, 200));
  const list = (await r.json()).map(({status, sortOrder, modified, ...recipe}) => recipe);
  recipes.splice(0, recipes.length, ...list);
  return recipes;
}
