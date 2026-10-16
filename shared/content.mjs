// The rules of the Whisker & Heat content engine, shared by the Studio and the server.

export const STATUSES = ['idea', 'script', 'production', 'review', 'approved', 'scheduled', 'published'];
export const STATUS_LABELS = {idea: 'Idea', script: 'Script', production: 'In production', review: 'Ready for review', approved: 'Approved', scheduled: 'Scheduled', published: 'Published'};
export const PLATFORMS = ['instagram', 'tiktok', 'youtube'];
export const PLATFORM_LABELS = {instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube Shorts'};

// Which moves are allowed. Approval is always a person's decision; publishing is recorded only with a real link.
const MOVES = {
  idea: ['script'],
  script: ['idea', 'production', 'review'],
  production: ['script', 'review'],
  review: ['script', 'production', 'approved'],
  approved: ['review', 'scheduled'],
  scheduled: ['approved'],
  published: [],
};
export const canMove = (from, to) => (MOVES[from] || []).includes(to);

export function checkPost(input, {site, recipes, brand}) {
  const post = {};
  const text = (key, max) => {
    if (input[key] === undefined) return;
    if (typeof input[key] !== 'string' || input[key].length > max) throw Error(`${key} is too long.`);
    post[key] = input[key].trim();
  };
  text('title', 160); text('hook', 600); text('script', 8000); text('shotlist', 4000); text('hashtags', 600); text('notes', 2000); text('poll', 300);
  if (input.title !== undefined && !post.title) throw Error('Give the post a working title.');
  if (input.pillar !== undefined) {
    if (!site.collections.some(c => c.id === input.pillar)) throw Error('Choose one of the eight collections.');
    post.pillar = input.pillar;
  }
  if (input.format !== undefined) {
    if (!brand.formats[input.format]) throw Error('Choose a known format.');
    post.format = input.format;
  }
  if (input.platforms !== undefined) {
    if (!Array.isArray(input.platforms) || !input.platforms.length || input.platforms.some(p => !PLATFORMS.includes(p))) throw Error('Choose at least one platform.');
    post.platforms = [...new Set(input.platforms)];
  }
  if (input.characters !== undefined) {
    if (!Array.isArray(input.characters) || input.characters.some(c => !site.characters.some(x => x.id === c))) throw Error('Unknown character.');
    post.characters = [...new Set(input.characters)];
  }
  if (input.recipeId !== undefined) {
    if (input.recipeId && !recipes.some(r => r.id === input.recipeId)) throw Error('Choose a recipe from the library.');
    post.recipeId = input.recipeId || null;
  }
  if (input.episode !== undefined) {
    if (input.episode !== null && !site.episodes.some(e => e.n === input.episode)) throw Error('Unknown episode.');
    post.episode = input.episode;
  }
  if (input.captions !== undefined) {
    if (typeof input.captions !== 'object' || Object.keys(input.captions).some(p => !PLATFORMS.includes(p))) throw Error('Captions must be per platform.');
    for (const value of Object.values(input.captions)) if (typeof value !== 'string' || value.length > 2200) throw Error('A caption is too long.');
    post.captions = input.captions;
  }
  if (input.mediaUrl !== undefined) {
    if (input.mediaUrl) {
      let url;
      try { url = new URL(input.mediaUrl); } catch { throw Error('Media must be an https link.'); }
      if (url.protocol !== 'https:') throw Error('Media must be an https link.');
    }
    post.mediaUrl = input.mediaUrl || null;
  }
  if (input.date !== undefined) {
    if (input.date && !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw Error('Choose a valid date.');
    post.date = input.date || null;
  }
  if (input.time !== undefined) {
    if (input.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw Error('Choose a valid time.');
    post.time = input.time || null;
  }
  return post;
}

const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const mondayOf = iso => { const d = new Date(iso + 'T12:00:00Z'); const back = (d.getUTCDay() + 6) % 7; return addDays(iso, -back); };

function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
}

// Next week's slate, following the growth plan: one story episode that advances the season,
// two recipe videos, a character gag and a challenge with a poll. Every post starts as an idea for a person to shape.
export function planWeek(weekStart, {site, recipes, brand, existing = []}) {
  const monday = mondayOf(weekStart);
  const week = Math.round((Date.parse(monday) - Date.parse('2026-01-05')) / (7 * 86400000));
  const byId = id => recipes.find(r => r.id === id);
  const name = id => site.characters.find(c => c.id === id)?.name;
  const planned = new Set(existing.filter(p => p.episode).map(p => p.episode));
  const episode = site.episodes.find(e => !planned.has(e.n)) || site.episodes[week % site.episodes.length];
  const hook = (i, a, b, dish) => fill(brand.hooks[(week + i) % brand.hooks.length], {a: name(a), b: name(b), dish});
  const collection = id => site.collections.find(c => c.id === id);
  const pick = (id, offset) => { const c = collection(id); return byId(c.recipes[(week + offset) % c.recipes.length]); };
  const pairs = [['nico', 'milo'], ['simba', 'luna'], ['luna', 'milo'], ['simba', 'nico']];
  const pair = pairs[week % pairs.length];
  // Naughty Cat Café is always Nico's shift with Milo, as the collection promises.
  const cafeCast = collection('naughty-cat-cafe').characters?.length ? collection('naughty-cat-cafe').characters : ['nico', 'milo'];
  const rotation = ['healthy-cat-kitchen', 'budget-cat', 'passport-of-flavors', 'weekly-cat-kitchen'];
  const thursdayPillar = week % 2 ? 'purr-and-presence' : rotation[(week / 2) % rotation.length | 0];
  const storyRecipe = byId(episode.recipe);
  // Milo is the one who eats the evidence; when he is in the episode he takes the second part in its hook.
  const lead = episode.characters.find(c => c !== 'milo') || 'milo';
  const sidekick = episode.characters.includes('milo') ? 'milo' : episode.characters.find(c => c !== lead) || lead;
  const cafe = pick('naughty-cat-cafe', 0);
  const thursday = pick(thursdayPillar, 1);
  const challenge = pick('cook-play-share', 2);
  const base = {platforms: [...PLATFORMS], status: 'idea', time: '18:00'};

  return [
    {...base, date: addDays(monday, 0), pillar: 'cat-chef-club', format: 'mystery', episode: episode.n, characters: episode.characters, recipeId: storyRecipe.id,
      title: `Episode ${episode.n}: ${episode.title}`, hook: hook(0, lead, sidekick, storyRecipe.title),
      notes: episode.text + ' End with the episode clue, after a real payoff.'},
    {...base, date: addDays(monday, 1), pillar: collection('cat-chef-club').recipes.includes(storyRecipe.id) ? 'cat-chef-club' : 'weekly-cat-kitchen', format: 'recipe',
      characters: [episode.characters[0]], recipeId: storyRecipe.id, title: `How to cook ${storyRecipe.title}`,
      hook: `The dish from Episode ${episode.n}, for real: ${storyRecipe.title} in ${storyRecipe.totalMinutes} minutes.`,
      notes: 'Food close-ups; every step shown must match the written recipe. Link to the recipe page.'},
    {...base, date: addDays(monday, 2), pillar: 'naughty-cat-cafe', format: 'gag', characters: cafeCast, recipeId: cafe.id,
      title: `${name(cafeCast[0])} and ${name(cafeCast[1])} work the café`, hook: hook(2, cafeCast[0], cafeCast[1], cafe.title)},
    {...base, date: addDays(monday, 3), pillar: thursdayPillar, format: thursdayPillar === 'purr-and-presence' ? 'calm' : 'recipe',
      characters: [pair[1]], recipeId: thursday.id, title: `${collection(thursdayPillar).name}: ${thursday.title}`,
      hook: thursdayPillar === 'purr-and-presence' ? `Slow down with ${name(pair[1])}: ${thursday.title}, one gentle step at a time.` : hook(3, pair[1], pair[0], thursday.title),
      notes: thursdayPillar === 'budget-cat' ? 'Do not state prices unless they are local, dated and real.' : thursdayPillar === 'healthy-cat-kitchen' ? 'No medical or weight-loss claims.' : ''},
    {...base, date: addDays(monday, 4), pillar: 'cook-play-share', format: 'challenge', characters: ['simba', 'luna'], recipeId: challenge.id,
      title: `Challenge: ${challenge.title}`, hook: hook(4, 'simba', 'luna', challenge.title), poll: brand.community[week % brand.community.length]},
  ];
}

// A short, unguessable-enough public slug for a post's link (no personal data in it).
export function linkSlug(id) {
  return id.replace(/-/g, '').slice(0, 8);
}
