import React, {useEffect, useState} from 'react';
import {ArrowRight, ArrowLeft, Search, X, CalendarPlus, ShoppingBasket, ChefHat, Play, Pause, RotateCcw, Check, Minus, Plus, Clapperboard} from 'lucide-react';
import {Link, navigate} from './router.jsx';
import {useApp, Portrait, RecipeCard, RecipeImage, Meta, SaveButton, Notice, Empty} from './ui.jsx';
import {scaleLine} from '../shared/shopping.mjs';
import {SLOTS, suits} from '../shared/kitchen.mjs';
import {track, countForSource} from './track.js';

const byId = (list, id) => list.find(x => x.id === id);
const castOf = (site, ids) => ids.map(id => byId(site.characters, id)).filter(Boolean);
const names = list => list.map(c => c.name).join(list.length > 2 ? ', ' : ' and ').replace(/, ([^,]*)$/, ' and $1');

function CharacterLinks({ids}) {
  const {site} = useApp();
  return <span className="cast-links">{castOf(site, ids).map(c => <Link key={c.id} to={'/characters#' + c.id} className="cast-link">
    <Portrait character={c} image={site.cast.image} size="sm"/>{c.name}</Link>)}</span>;
}

function EpisodeCard({episode, featured = false}) {
  const {site, recipes} = useApp();
  const recipe = byId(recipes, episode.recipe);
  return <article className={'episode-card' + (featured ? ' featured' : '')}>
    <div className="episode-art"><Clapperboard size={28} aria-hidden="true"/><span>Episode {episode.n}</span></div>
    <div className="episode-copy">
      <p className="eyebrow">SEASON ONE · EPISODE {episode.n} · STORY OUTLINE</p>
      <h3><Link to={'/story/' + episode.slug}>{episode.title}</Link></h3>
      <p className="section-text">{episode.text}</p>
      <CharacterLinks ids={episode.characters}/>
      <div className="actions">
        <Link className="btn" to={'/story/' + episode.slug}>Read the episode <ArrowRight size={18} aria-hidden="true"/></Link>
        {recipe && <Link className="quiet" to={'/recipes/' + recipe.id}>Cook {recipe.title}</Link>}
      </div>
      <p className="micro">{site.season.status} The film below is the original kitchen introduction.</p>
    </div>
  </article>;
}

export function Discover() {
  const {site, recipes, kitchen} = useApp();
  const featured = site.episodes[0];
  const featuredRecipe = byId(recipes, featured.recipe);
  const picks = recipes.filter(r => suits(r, kitchen.preferences, site.collections));
  const personal = Object.keys(kitchen.preferences).length > 0;
  return <>
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">{site.brand.eyebrow}</p>
        <h1>Whisker <span className="amp">&amp;</span> <span className="heat">Heat</span></h1>
        <p className="lead">Watch four cats get into culinary trouble, discover a real recipe, and make it in your own kitchen.</p>
        <div className="actions">
          <Link className="btn" to={'/story/' + featured.slug}>Start the story <ArrowRight size={18} aria-hidden="true"/></Link>
          <Link className="btn ghost" to="/recipes">Find a recipe</Link>
        </div>
      </div>
      <img className="hero-image" src={site.cast.image} alt="Luna, Simba, Nico and Milo in their kitchen"/>
    </section>

    <section className="section">
      <p className="eyebrow">FEATURED STORY</p>
      <h2>{site.season.title}</h2>
      <EpisodeCard episode={featured} featured/>
    </section>

    <section className="section featured-recipe">
      <RecipeImage recipe={featuredRecipe} className="large"/>
      <div>
        <p className="eyebrow">FEATURED RECIPE · FROM EPISODE {featured.n}</p>
        <h2><Link to={'/recipes/' + featuredRecipe.id}>{featuredRecipe.title}</Link></h2>
        <p className="section-text">{featuredRecipe.description}</p>
        <Meta recipe={featuredRecipe}/>
        <div className="actions"><Link className="btn" to={'/recipes/' + featuredRecipe.id}><ChefHat size={18} aria-hidden="true"/> Cook this</Link><SaveButton recipe={featuredRecipe} label/></div>
      </div>
    </section>

    <section className="section">
      <p className="eyebrow">{site.cast.eyebrow}</p>
      <h2>{site.cast.title}</h2>
      <div className="cast-row">
        {site.characters.map(c => <Link key={c.id} to={'/characters#' + c.id} className="cast-chip">
          <Portrait character={c} image={site.cast.image}/><strong>{c.name}</strong><small>{c.role}</small></Link>)}
      </div>
    </section>

    <section className="section" id="film">
      <p className="eyebrow">{site.film.eyebrow}</p>
      <h2>{site.film.title}</h2>
      <p className="section-text">{site.film.text}</p>
      <video className="film" controls playsInline preload="metadata" poster={site.film.poster} src={site.film.src}>
        <a href={site.film.src}>Download the introduction film</a>
      </video>
    </section>

    <section className="section">
      <p className="eyebrow">EIGHT WAYS INTO ONE KITCHEN</p>
      <h2>Collections</h2>
      <div className="collection-grid">
        {site.collections.map(c => <Link key={c.id} className="collection-card" to={'/recipes?collection=' + c.id}>
          <strong>{c.name}</strong><span>{c.text}</span><small>{c.recipes.length} recipes</small>
        </Link>)}
      </div>
    </section>

    <section className="section">
      <h2>{personal ? 'Picked for your kitchen' : 'Your next favourite meal'}</h2>
      <p className="section-text">{personal ? 'Matching the cooking preferences in My Kitchen.' : 'Real ingredients and clear instructions. Set your cooking preferences in My Kitchen to narrow these down.'}</p>
      {picks.length ? <div className="recipe-grid">{picks.slice(0, 6).map(r => <RecipeCard key={r.id} recipe={r}/>)}</div>
        : <Empty title="Nothing matches your preferences yet." action={<Link className="btn ghost" to="/kitchen#preferences">Change preferences</Link>}>Try a longer cooking time or a different difficulty.</Empty>}
      <div className="actions"><Link className="quiet" to="/recipes">All {recipes.length} recipes <ArrowRight size={16} aria-hidden="true"/></Link></div>
    </section>
  </>;
}

const TIMES = [['', 'Any time'], ['20', '20 min or less'], ['30', '30 min or less'], ['45', '45 min or less'], ['60', '1 hour or less']];

export function Cook({search}) {
  const {site, recipes} = useApp();
  const [filters, setFilters] = useState(() => ({
    q: search.get('q') || '', collection: search.get('collection') || '', category: search.get('category') || '',
    time: search.get('time') || '', difficulty: search.get('difficulty') || '', budget: search.get('budget') === '1', meatFree: search.get('meatFree') === '1',
  }));
  const set = (key, value) => setFilters(f => ({...f, [key]: value}));
  useEffect(() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v === true ? '1' : v);
    const next = '/recipes' + (p.toString() ? '?' + p : '');
    if (next !== location.pathname + location.search) history.replaceState(null, '', next);
  }, [filters]);

  const categories = [...new Set(recipes.flatMap(r => r.categories))].sort();
  const collection = byId(site.collections, filters.collection);
  const budget = byId(site.collections, 'budget-cat');
  const words = filters.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = recipes.filter(r => {
    const text = (r.title + ' ' + r.description + ' ' + r.ingredients.join(' ')).toLowerCase();
    return words.every(w => text.includes(w))
      && (!collection || collection.recipes.includes(r.id))
      && (!filters.category || r.categories.includes(filters.category))
      && (!filters.time || r.totalMinutes <= Number(filters.time))
      && (!filters.difficulty || r.difficulty === filters.difficulty)
      && (!filters.budget || budget.recipes.includes(r.id))
      && (!filters.meatFree || r.meatFree);
  });
  const active = Object.values(filters).some(Boolean);
  const reset = () => setFilters({q: '', collection: '', category: '', time: '', difficulty: '', budget: false, meatFree: false});

  return <section className="section page">
    <p className="eyebrow">COOK</p>
    <h1>{collection ? collection.name : 'What are we cooking?'}</h1>
    <p className="section-text">{collection ? collection.text : 'Search by recipe or ingredient, then narrow it down.'}</p>
    <form className="filters" role="search" onSubmit={e => e.preventDefault()}>
      <label className="search">
        <Search size={18} aria-hidden="true"/>
        <span className="sr-only">Search recipes or ingredients</span>
        <input type="search" value={filters.q} onChange={e => set('q', e.target.value)} placeholder="Try basil, pasta or soup"/>
        {filters.q && <button type="button" className="icon" aria-label="Clear search" onClick={() => set('q', '')}><X size={16}/></button>}
      </label>
      <div className="filter-row">
        <label><span className="sr-only">Collection</span><select value={filters.collection} onChange={e => set('collection', e.target.value)}>
          <option value="">All collections</option>{site.collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label><span className="sr-only">Category</span><select value={filters.category} onChange={e => set('category', e.target.value)}>
          <option value="">All categories</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></label>
        <label><span className="sr-only">Total time</span><select value={filters.time} onChange={e => set('time', e.target.value)}>
          {TIMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label><span className="sr-only">Difficulty</span><select value={filters.difficulty} onChange={e => set('difficulty', e.target.value)}>
          <option value="">Any difficulty</option><option>Easy</option><option>Medium</option></select></label>
        <label className="toggle"><input type="checkbox" checked={filters.budget} onChange={e => set('budget', e.target.checked)}/> Budget-friendly</label>
        <label className="toggle"><input type="checkbox" checked={filters.meatFree} onChange={e => set('meatFree', e.target.checked)}/> No meat or fish</label>
      </div>
    </form>
    <div className="results-bar">
      <p className="count" aria-live="polite">{shown.length} {shown.length === 1 ? 'recipe' : 'recipes'}</p>
      {active && <button type="button" className="quiet" onClick={reset}>Reset filters</button>}
    </div>
    {shown.length ? <div className="recipe-grid">{shown.map(r => <RecipeCard key={r.id} recipe={r}/>)}</div>
      : <Empty title="No recipes match all of those." action={<button type="button" className="btn ghost" onClick={reset}>Reset filters</button>}>Try fewer filters or a different ingredient.</Empty>}
    <p className="micro">“No meat or fish” is read from each ingredient list. Stock, cheese and other packaged ingredients can contain animal products, so check labels if that matters to you.</p>
  </section>;
}

const today = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString('en-CA'); };

function Servings({value, onChange}) {
  return <span className="stepper" role="group" aria-label="Servings">
    <button type="button" className="icon" aria-label="Fewer servings" disabled={value <= 1} onClick={() => onChange(value - 1)}><Minus size={16}/></button>
    <output aria-live="polite">{value} {value === 1 ? 'serving' : 'servings'}</output>
    <button type="button" className="icon" aria-label="More servings" disabled={value >= 20} onClick={() => onChange(value + 1)}><Plus size={16}/></button>
  </span>;
}

function PlanForm({recipe, servings, close, done}) {
  const {addToPlan} = useApp();
  const [date, setDate] = useState(today());
  const [slot, setSlot] = useState('dinner');
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    try { await addToPlan({date, slot, recipeId: recipe.id, servings}); done(`Planned for ${slot} on ${new Date(date + 'T12:00').toLocaleDateString(undefined, {weekday: 'long', day: 'numeric', month: 'short'})}.`); }
    catch (e) { setError(e.message); }
  }
  return <form className="plan-form" onSubmit={submit}>
    <label>Day<input type="date" value={date} min={today()} onChange={e => setDate(e.target.value)} required/></label>
    <label>Meal<select value={slot} onChange={e => setSlot(e.target.value)}>{SLOTS.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}</select></label>
    <button className="btn">Add {servings} servings</button>
    <button type="button" className="quiet" onClick={close}>Cancel</button>
    {error && <Notice tone="error">{error}</Notice>}
  </form>;
}

export function RecipePage({id, hash}) {
  const {recipes, site, episodes, kitchen, addToList} = useApp();
  const recipe = byId(recipes, id);
  const [servings, setServings] = useState(recipe?.servings || 2);
  const [checked, setChecked] = useState([]);
  const [planning, setPlanning] = useState(false);
  const [message, setMessage] = useState(null);
  if (!recipe) return <NotFound/>;
  if (hash === 'cook') return <CookMode recipe={recipe}/>;
  const scale = servings / recipe.servings;
  const episode = site.episodes.find(e => e.recipe === recipe.id);
  const video = episodes.find(e => e.recipeId === recipe.id);
  const collections = site.collections.filter(c => c.recipes.includes(recipe.id));
  const listed = kitchen.listed.find(l => l.recipeId === recipe.id);
  const toggle = i => setChecked(v => v.includes(i) ? v.filter(x => x !== i) : [...v, i]);
  const say = (text, tone = 'ok') => setMessage({text, tone});

  return <article className="section page recipe-page">
    <Link className="quiet back" to="/recipes"><ArrowLeft size={16} aria-hidden="true"/> All recipes</Link>
    <div className="recipe-head">
      <RecipeImage recipe={recipe} className="large"/>
      <div>
        <p className="eyebrow">{recipe.categories.join(' · ').toUpperCase()}</p>
        <h1>{recipe.title}</h1>
        <p className="lead">{recipe.description}</p>
        <Meta recipe={recipe}/>
        <p className="badge">{site.notes.sample}</p>
        <div className="actions">
          <Link className="btn" to={'/recipes/' + recipe.id + '#cook'}><ChefHat size={18} aria-hidden="true"/> Start cooking</Link>
          <SaveButton recipe={recipe} label/>
        </div>
      </div>
    </div>

    <section className="recipe-tools" aria-label="Plan and shop">
      <Servings value={servings} onChange={setServings}/>
      <div className="actions">
        <button type="button" className="btn ghost" onClick={() => { setPlanning(true); setMessage(null); }}><CalendarPlus size={18} aria-hidden="true"/> Add to my week</button>
        <button type="button" className="btn ghost" onClick={() => addToList({recipeId: recipe.id, servings}).then(
          () => say(`Ingredients for ${servings} servings are on your shopping list.`), e => say(e.message, 'error'))}>
          <ShoppingBasket size={18} aria-hidden="true"/> {listed ? 'Update shopping list' : 'Add ingredients to list'}</button>
      </div>
      {planning && <PlanForm recipe={recipe} servings={servings} close={() => setPlanning(false)} done={text => { setPlanning(false); say(text + ' Its ingredients are on your shopping list.'); }}/>}
      {message && <Notice tone={message.tone}>{message.text} {message.tone === 'ok' && <Link to="/kitchen#shopping">See the list</Link>}</Notice>}
    </section>

    {video && <video className="film" controls playsInline preload="metadata" src={video.videoUrl}/>}

    <div className="recipe-columns">
      <section>
        <h2>Ingredients</h2>
        {scale !== 1 && <p className="micro">Quantities shown for {servings} servings (the recipe makes {recipe.servings}). Amounts “to taste” stay as written.</p>}
        <ul className="checklist">
          {recipe.ingredients.map((line, i) => <li key={i}>
            <label><input type="checkbox" checked={checked.includes(i)} onChange={() => toggle(i)}/><span>{scaleLine(line, scale)}</span></label>
          </li>)}
        </ul>
        <p className="allergens"><strong>Allergens:</strong> {recipe.allergens}</p>
        <p className="micro">{site.notes.allergy}</p>
      </section>
      <section>
        <h2>Method</h2>
        {scale !== 1 && <p className="micro">The method is written for {recipe.servings} servings. Larger batches may need a bigger pan and a little longer.</p>}
        <ol className="method">{recipe.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
      </section>
    </div>

    {(episode || collections.length > 0) && <section className="related">
      {episode && <div>
        <h2>From the story</h2>
        <p><Link to={'/story/' + episode.slug}><strong>Episode {episode.n}: {episode.title}</strong></Link></p>
        <CharacterLinks ids={episode.characters}/>
      </div>}
      {collections.length > 0 && <div>
        <h2>In these collections</h2>
        <ul className="plain">{collections.map(c => <li key={c.id}><Link to={'/recipes?collection=' + c.id}>{c.name}</Link></li>)}</ul>
      </div>}
    </section>}
    <p className="micro">{site.notes.cats}</p>
  </article>;
}

const timerFor = step => {
  const match = step.match(/(\d+)(?:\s*[–-]\s*(\d+))?\s*minutes?/i);
  return match ? Number(match[1]) * 60 : 0;
};

function CookMode({recipe}) {
  const [step, setStep] = useState(0);
  const [left, setLeft] = useState(null);
  const [running, setRunning] = useState(false);
  const seconds = timerFor(recipe.steps[step] || '');
  useEffect(() => { setLeft(seconds || null); setRunning(false); }, [step, seconds]);
  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => setLeft(v => {
      if (v <= 1) { setRunning(false); return 0; }
      return v - 1;
    }), 1000);
    return () => clearInterval(tick);
  }, [running]);
  const done = step >= recipe.steps.length;
  useEffect(() => { if (done) { track('recipe_cooked', {recipeId: recipe.id}); countForSource('recipe_cooked'); } }, [done]);
  const clock = left === null ? '' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;

  return <section className="cook">
    <div className="cook-top">
      <Link className="quiet" to={'/recipes/' + recipe.id}><X size={18} aria-hidden="true"/> Exit cooking mode</Link>
      <span aria-live="polite">{done ? 'Finished' : `Step ${step + 1} of ${recipe.steps.length}`}</span>
    </div>
    <div className="progress" aria-hidden="true"><span style={{width: `${Math.min(step, recipe.steps.length) / recipe.steps.length * 100}%`}}/></div>
    {done ? <div className="cook-step">
      <Check size={48} aria-hidden="true"/>
      <h1>Dinner is served.</h1>
      <p className="section-text">Pull up a chair. You’ve earned the first bite.</p>
      <div className="actions"><button type="button" className="btn" onClick={() => setStep(0)}>Cook it again</button>
        <Link className="quiet" to={'/recipes/' + recipe.id}>Back to the recipe</Link></div>
    </div> : <div className="cook-step">
      <h1 className="cook-title">{recipe.title}</h1>
      <p className="cook-text">{recipe.steps[step]}</p>
      {left !== null && <div className="timer">
        <span className={left === 0 ? 'timer-done' : ''} role="timer">{left === 0 ? 'Time’s up' : clock}</span>
        <button type="button" className="btn ghost" onClick={() => setRunning(r => !r)} disabled={left === 0}>
          {running ? <><Pause size={16} aria-hidden="true"/> Pause</> : <><Play size={16} aria-hidden="true"/> Start {Math.round(seconds / 60)}-minute timer</>}</button>
        <button type="button" className="icon" aria-label="Reset timer" onClick={() => { setRunning(false); setLeft(seconds); }}><RotateCcw size={18}/></button>
      </div>}
      <div className="cook-nav">
        <button type="button" className="btn ghost" disabled={step === 0} onClick={() => setStep(s => s - 1)}>Back</button>
        <button type="button" className="btn" onClick={() => setStep(s => s + 1)}>{step === recipe.steps.length - 1 ? 'Finish' : 'Next step'}</button>
      </div>
    </div>}
  </section>;
}

export function Characters({hash}) {
  const {site} = useApp();
  useEffect(() => { if (hash) document.getElementById(hash)?.scrollIntoView(); }, [hash]);
  return <section className="section page">
    <p className="eyebrow">CHARACTERS</p>
    <h1>{site.cast.title}</h1>
    <p className="section-text">{site.cast.text}</p>
    <div className="character-list">
      {site.characters.map(c => {
        const episodes = site.episodes.filter(e => e.characters.includes(c.id));
        return <article key={c.id} id={c.id} className="character">
          <Portrait character={c} image={site.cast.image} size="lg"/>
          <div>
            <p className="eyebrow">{c.role.toUpperCase()}</p>
            <h2>{c.name}</h2>
            <p className="section-text">{c.bio}</p>
            <blockquote>“{c.quote}”</blockquote>
            <dl className="facts">
              <div><dt>Personality</dt><dd>{c.traits.join(', ')}</dd></div>
              <div><dt>Flaw</dt><dd>{c.flaw}</dd></div>
              <div><dt>The running joke</dt><dd>{c.comedy}</dd></div>
              <div><dt>With the others</dt><dd>{c.relationship}</dd></div>
            </dl>
            <h3>Episodes</h3>
            <ul className="plain episode-links">{episodes.map(e => <li key={e.n}><Link to={'/story/' + e.slug}>Episode {e.n}: {e.title}</Link></li>)}</ul>
          </div>
        </article>;
      })}
    </div>
  </section>;
}

export function Story() {
  const {site} = useApp();
  return <section className="section page">
    <p className="eyebrow">{site.season.eyebrow}</p>
    <h1>{site.season.title}</h1>
    <p className="section-text">{site.season.text}</p>
    <ol className="episodes">
      {site.episodes.map(e => <li key={e.n}><EpisodeCard episode={e}/></li>)}
    </ol>
  </section>;
}

export function EpisodePage({slug}) {
  const {site, recipes} = useApp();
  const index = site.episodes.findIndex(e => e.slug === slug);
  if (index < 0) return <NotFound/>;
  const episode = site.episodes[index];
  const prev = site.episodes[index - 1], next = site.episodes[index + 1];
  const recipe = byId(recipes, episode.recipe);
  const cast = castOf(site, episode.characters);
  return <article className="section page narrow-wide">
    <Link className="quiet back" to="/story"><ArrowLeft size={16} aria-hidden="true"/> The whole season</Link>
    <p className="eyebrow">SEASON ONE · EPISODE {episode.n} OF {site.episodes.length}</p>
    <h1>{episode.title}</h1>
    <p className="badge">Story outline · not yet filmed</p>
    <div className="video-placeholder" role="note"><Clapperboard size={32} aria-hidden="true"/><span>This episode has not been filmed yet. Here is the story so far.</span></div>
    <p className="lead">{episode.text}</p>
    <h2>Starring</h2>
    <div className="cast-row compact">{cast.map(c => <Link key={c.id} to={'/characters#' + c.id} className="cast-chip">
      <Portrait character={c} image={site.cast.image}/><strong>{c.name}</strong><small>{c.role}</small></Link>)}</div>
    <p className="section-text">With {names(cast)}.</p>
    {recipe && <section className="episode-recipe-block">
      <h2>From this episode’s kitchen</h2>
      <Link className="episode-recipe" to={'/recipes/' + recipe.id}>
        <RecipeImage recipe={recipe}/><span><strong>{recipe.title}</strong><Meta recipe={recipe}/></span></Link>
    </section>}
    <nav className="pager" aria-label="Episodes">
      {prev ? <Link className="btn ghost" to={'/story/' + prev.slug}><ArrowLeft size={16} aria-hidden="true"/> Episode {prev.n}</Link> : <span/>}
      {next ? <Link className="btn" to={'/story/' + next.slug}>Episode {next.n} <ArrowRight size={16} aria-hidden="true"/></Link>
        : <Link className="btn" to="/story">Back to the season</Link>}
    </nav>
  </article>;
}

export function Community() {
  const {site} = useApp();
  return <section className="section page narrow">
    <p className="eyebrow">COMMUNITY · COMING LATER</p>
    <h1>{site.community.title}</h1>
    <p className="lead">{site.community.text}</p>
    <ul className="plain coming">
      <li>Vote on the next dish the cats cook</li>
      <li>Kitchen challenges built around season one recipes</li>
      <li>Share a photo of what you made</li>
    </ul>
    <p className="section-text">Until then, you can save recipes, plan your week and build a shopping list.</p>
    <div className="actions"><Link className="btn" to="/recipes">Find a recipe</Link><Link className="quiet" to="/kitchen">Open My Kitchen</Link></div>
  </section>;
}

export function NotFound() {
  return <section className="section page narrow">
    <h1>This page wandered off.</h1>
    <p className="section-text">Milo may have eaten it. Try the recipe library instead.</p>
    <Link className="btn" to="/recipes">Browse recipes</Link>
  </section>;
}
