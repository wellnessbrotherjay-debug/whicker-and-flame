import {api} from './api.js';

// A single place for product events (recipe opened, saved, planned...). Nothing about a person is collected:
// events are announced inside the page for a future, consented analytics tool, and visits that arrived
// through a post's short link add one to that post's anonymous counts.
export function track(name, details = {}) {
  window.dispatchEvent(new CustomEvent('wh:event', {detail: {name, ...details}}));
}

const KEY = 'wh-from';
const COUNTED = {favorite_toggled: 'save', meal_planned: 'plan', list_added: 'list', recipe_cooked: 'cooked'};

export function rememberSource() {
  const from = new URLSearchParams(location.search).get('from');
  if (from && /^[0-9a-f]{8}$/.test(from)) {
    try { sessionStorage.setItem(KEY, from); } catch {}
    const url = new URL(location.href);
    url.searchParams.delete('from');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
}

export function countForSource(event) {
  let slug = null;
  try { slug = sessionStorage.getItem(KEY); } catch {}
  if (slug && COUNTED[event]) api('track', {method: 'POST', body: {slug, event: COUNTED[event]}}).catch(() => {});
}
