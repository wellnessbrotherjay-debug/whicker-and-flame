import {api} from './api.js';
import {emptyKitchen, checkRecipe, checkServings, checkDate, checkSlot, checkPreferences} from '../shared/kitchen.mjs';

// Visitors keep their kitchen in this browser; an account keeps it on the server.
// Both answer every change with the whole kitchen, so the screens never need to know which.
const KEY = 'wh-kitchen-v1';

export function readLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return saved ? {...emptyKitchen(), ...saved} : emptyKitchen();
  } catch { return emptyKitchen(); }
}

function writeLocal(kitchen) {
  try { localStorage.setItem(KEY, JSON.stringify(kitchen)); } catch {
    throw Error('This browser is not letting us save. Sign in to keep your kitchen on any device.');
  }
  return kitchen;
}

export function clearLocal() {
  try { localStorage.removeItem(KEY); } catch {}
}

export const hasLocalData = k => k.favorites.length || k.plan.length || k.listed.length || Object.keys(k.marks).length || Object.keys(k.preferences).length;

function localStore(recipes) {
  const change = fn => { const k = structuredClone(readLocal()); fn(k); return writeLocal(k); };
  return {
    toggleFavorite: id => change(k => {
      checkRecipe(recipes, id);
      k.favorites = k.favorites.includes(id) ? k.favorites.filter(x => x !== id) : [...k.favorites, id];
    }),
    addToPlan: ({date, slot, recipeId, servings}) => change(k => {
      const recipe = checkRecipe(recipes, recipeId);
      const entry = {date: checkDate(date), slot: checkSlot(slot), recipeId, servings: checkServings(servings, recipe)};
      const same = k.plan.find(p => p.date === entry.date && p.slot === entry.slot && p.recipeId === recipeId);
      if (same) same.servings = entry.servings;
      else k.plan.push({id: Date.now() + Math.random(), ...entry});
    }),
    removeFromPlan: id => change(k => { k.plan = k.plan.filter(p => p.id !== id); }),
    addToList: ({recipeId, servings}) => change(k => {
      const recipe = checkRecipe(recipes, recipeId);
      k.listed = [...k.listed.filter(l => l.recipeId !== recipeId), {recipeId, servings: checkServings(servings, recipe)}];
    }),
    removeFromList: recipeId => change(k => { k.listed = k.listed.filter(l => l.recipeId !== recipeId); }),
    markShopping: (key, state) => change(k => {
      if (state === 'clear') delete k.marks[key];
      else k.marks[key] = state;
    }),
    clearChecked: () => change(k => { for (const key of Object.keys(k.marks)) if (k.marks[key] === 'checked') k.marks[key] = 'removed'; }),
    resetList: () => change(k => { k.marks = {}; k.listed = []; }),
    setPreferences: prefs => change(k => { k.preferences = checkPreferences(prefs); }),
  };
}

function remoteStore() {
  const post = async (path, body = {}) => (await api(path, {method: 'POST', body})).kitchen;
  return {
    toggleFavorite: (id, saved) => post('favorites', {recipeId: id, saved}),
    addToPlan: entry => post('plan', entry),
    removeFromPlan: async id => (await api('plan/' + id, {method: 'DELETE'})).kitchen,
    addToList: entry => post('list', entry),
    removeFromList: recipeId => post('list/remove', {recipeId}),
    markShopping: (key, state) => post('shopping', {key, state}),
    clearChecked: () => post('shopping/clear-checked'),
    resetList: () => post('shopping/reset'),
    setPreferences: prefs => post('preferences', prefs),
  };
}

export const storeFor = (signedIn, recipes) => signedIn ? remoteStore() : localStore(recipes);

// Called right after sign-in: anything saved as a visitor joins the account, then leaves this browser.
export async function mergeLocalIntoAccount() {
  const local = readLocal();
  if (!hasLocalData(local)) return null;
  const {kitchen} = await api('kitchen/merge', {method: 'POST', body: local});
  clearLocal();
  return kitchen;
}
