import {readFileSync} from 'node:fs';

const load = name => JSON.parse(readFileSync(new URL('../content/' + name, import.meta.url), 'utf8'));

export const recipes = load('recipes.json');
export const site = load('site.json');
