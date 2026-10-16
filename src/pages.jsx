import React, {useEffect, useMemo, useState} from 'react';
import {ArrowRight, Search, X, CalendarPlus, ChefHat, Play, Pause, RotateCcw, ArrowLeft, Check} from 'lucide-react';
import {Link, navigate} from './router.jsx';
import {useApp, Portrait, RecipeCard, RecipeImage, Meta, SaveButton, Notice} from './ui.jsx';

const recipeById = (recipes, id) => recipes.find(r => r.id === id);

export function Home() {
  const {site, recipes} = useApp();
  return <>
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">{site.brand.eyebrow}</p>
        <h1>Whisker <span className="amp">&amp;</span> <span className="heat">Heat</span></h1>
        <p className="lead">{site.brand.promise}</p>
        <div className="actions">
          <Link className="btn" to="/recipes">Find your next recipe <ArrowRight size={18} aria-hidden="true"/></Link>
          <a className="quiet" href="#film">Watch the introduction <Play size={16} aria-hidden="true"/></a>
        </div>
      </div>
      <img className="hero-image" src={site.cast.image} alt="Luna, Simba, Nico and Milo in their kitchen"/>
    </section>

    <section className="section" id="film">
      <p className="eyebrow">{site.film.eyebrow}</p>
      <h2>{site.film.title}</h2>
      <p className="section-text">{site.film.text}</p>
      <video className="film" controls playsInline preload="metadata" poster={site.film.poster} src={site.film.src}>
        Your browser cannot play this video. <a href={site.film.src}>Download the introduction</a>.
      </video>
    </section>

    <section className="section">
      <p className="eyebrow">{site.cast.eyebrow}</p>
      <h2>Four cats. Endless kitchen trouble.</h2>
      <div className="cast-row">
        {site.characters.map(c => <Link key={c.id} to={'/characters#' + c.id} className="cast-chip">
          <Portrait character={c} image={site.cast.image}/><strong>{c.name}</strong><small>{c.role}</small>
        </Link>)}
      </div>
    </section>

    <section className="section story-teaser">
      <p className="eyebrow">A NEW STORY IS SIMMERING</p>
      <h2>{site.season.title}</h2>
      <p className="section-text">{site.season.teaser}</p>
      <p className="section-text">Season one is in development. Explore the episode outlines and cook a recipe while the story takes shape.</p>
      <div className="actions">
        <Link className="btn" to="/story">Explore season one <ArrowRight size={18} aria-hidden="true"/></Link>
        <Link className="quiet" to={'/recipes/' + site.episodes[0].recipe}>Cook the first recipe</Link>
      </div>
    </section>

    <section className="section">
      <h2>Eight ways into the same kitchen.</h2>
      <div className="collection-grid">
        {site.collections.map(c => <Link key={c.id} className="collection-card" to={'/recipes?collection=' + c.id}>
          <strong>{c.name}</strong><span>{c.text}</span>
        </Link>)}
      </div>
    </section>

    <section className="section">
      <h2>Your next favourite meal</h2>
      <p className="section-text">From creamy tomato pasta to a warm apple crumble. Real ingredients and clear instructions.</p>
      <div className="recipe-grid">{recipes.map(r => <RecipeCard key={r.id} recipe={r}/>)}</div>
    </section>

    <section className="closing">
      <ChefHat size={32} aria-hidden="true"/>
      <h2>Good food brings everyone to the table.</h2>
      <Link className="btn" to="/kitchen">Plan your week <ArrowRight size={18} aria-hidden="true"/></Link>
    </section>
  </>;
}

export function Recipes({search}) {
  const {site, recipes} = useApp();
  const [query, setQuery] = useState(search.get('q') || '');
  const collectionId = search.get('collection') || '';
  const collection = site.collections.find(c => c.id === collectionId);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = recipes.filter(r => {
    if (collection && !collection.recipes.includes(r.id)) return false;
    const haystack = (r.title + ' ' + r.ingredients.join(' ')).toLowerCase();
    return words.every(w => haystack.includes(w));
  });
  const setCollection = id => navigate('/recipes' + (id ? '?collection=' + id : ''));

  return <section className="section page">
    <p className="eyebrow">THE RECIPE LIBRARY</p>
    <h1>{collection ? collection.name : 'What are we cooking?'}</h1>
    {collection && <p className="section-text">{collection.text}</p>}
    <div className="filters">
      <label className="search">
        <Search size={18} aria-hidden="true"/>
        <span className="sr-only">Search by recipe or ingredient</span>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="A recipe or an ingredient, like basil"/>
        {query && <button type="button" className="icon" aria-label="Clear search" onClick={() => setQuery('')}><X size={16}/></button>}
      </label>
      <label className="select">
        <span className="sr-only">Collection</span>
        <select value={collectionId} onChange={e => setCollection(e.target.value)}>
          <option value="">All collections</option>
          {site.collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
    </div>
    <p className="count" aria-live="polite">{shown.length} {shown.length === 1 ? 'recipe' : 'recipes'}</p>
    {shown.length ? <div className="recipe-grid">{shown.map(r => <RecipeCard key={r.id} recipe={r}/>)}</div>
      : <div className="empty"><p>No recipes match that yet.</p>
          <button type="button" className="btn ghost" onClick={() => { setQuery(''); setCollection(''); }}>Show all recipes</button></div>}
  </section>;
}

function today(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function AddToPlan({recipe}) {
  const {me, addToPlan} = useApp();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today());
  const [servings, setServings] = useState(recipe.servings);
  const [message, setMessage] = useState(null);
  if (!me) return <Link className="btn ghost" to={'/signin?next=/recipes/' + recipe.id}><CalendarPlus size={18} aria-hidden="true"/> Add to my week</Link>;
  if (!open) return <>
    <button type="button" className="btn ghost" onClick={() => { setOpen(true); setMessage(null); }}><CalendarPlus size={18} aria-hidden="true"/> Add to my week</button>
    {message && <Notice tone={message.tone}>{message.text} <Link to="/kitchen#shopping">See the shopping list</Link></Notice>}
  </>;
  async function submit(event) {
    event.preventDefault();
    try {
      await addToPlan({date, recipeId: recipe.id, servings: Number(servings)});
      setMessage({tone: 'ok', text: 'Added to your week. The shopping list is updated.'});
      setOpen(false);
    } catch (error) { setMessage({tone: 'error', text: error.message}); }
  }
  return <form className="plan-form" onSubmit={submit}>
    <label>Day<input type="date" value={date} min={today()} onChange={e => setDate(e.target.value)} required/></label>
    <label>Servings<input type="number" min="1" max="20" value={servings} onChange={e => setServings(e.target.value)} required/></label>
    <button className="btn">Add</button>
    <button type="button" className="quiet" onClick={() => setOpen(false)}>Cancel</button>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
  </form>;
}

export function RecipePage({id, hash}) {
  const {recipes, site, episodes} = useApp();
  const recipe = recipeById(recipes, id);
  const [checked, setChecked] = useState([]);
  useEffect(() => setChecked([]), [id]);
  if (!recipe) return <NotFound/>;
  if (hash === 'cook') return <Cook recipe={recipe}/>;
  const episode = site.episodes.find(e => e.recipe === recipe.id);
  const video = episodes.find(e => e.recipeId === recipe.id);
  const toggle = i => setChecked(v => v.includes(i) ? v.filter(x => x !== i) : [...v, i]);

  return <article className="section page recipe-page">
    <Link className="quiet back" to="/recipes"><ArrowLeft size={16} aria-hidden="true"/> All recipes</Link>
    <div className="recipe-head">
      <RecipeImage recipe={recipe} className="large"/>
      <div>
        {episode && <p className="eyebrow">FROM EPISODE {episode.n} · {episode.title.toUpperCase()}</p>}
        <h1>{recipe.title}</h1>
        <Meta recipe={recipe}/>
        {recipe.description && <p className="section-text">{recipe.description}</p>}
        <div className="actions">
          <Link className="btn" to={'/recipes/' + recipe.id + '#cook'}><ChefHat size={18} aria-hidden="true"/> Start cooking</Link>
          <AddToPlan recipe={recipe}/>
          <SaveButton recipe={recipe}/>
        </div>
      </div>
    </div>
    {video && <video className="film" controls playsInline preload="metadata" src={video.videoUrl}/>}
    <div className="recipe-columns">
      <section>
        <h2>Ingredients</h2>
        <ul className="checklist">
          {recipe.ingredients.map((line, i) => <li key={i}>
            <label><input type="checkbox" checked={checked.includes(i)} onChange={() => toggle(i)}/><span>{line}</span></label>
          </li>)}
        </ul>
        {recipe.allergens && <p className="allergens"><strong>Allergens:</strong> {recipe.allergens}</p>}
      </section>
      <section>
        <h2>Method</h2>
        <ol className="method">{recipe.steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
      </section>
    </div>
  </article>;
}

const timerFor = step => {
  const match = step.match(/(\d+)(?:\s*[–-]\s*(\d+))?\s*minutes?/i);
  return match ? Number(match[2] || match[1]) * 60 : 0;
};

function Cook({recipe}) {
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
  const clock = left === null ? '' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;

  return <section className="cook" aria-live="polite">
    <div className="cook-top">
      <Link className="quiet" to={'/recipes/' + recipe.id}><X size={18} aria-hidden="true"/> Exit cooking mode</Link>
      <span>{done ? 'Finished' : `Step ${step + 1} of ${recipe.steps.length}`}</span>
    </div>
    {done ? <div className="cook-step">
      <Check size={48} aria-hidden="true"/>
      <h1>Dinner is served.</h1>
      <p className="section-text">Pull up a chair. You’ve earned the first bite.</p>
      <div className="actions"><button className="btn" onClick={() => setStep(0)}>Cook it again</button>
        <Link className="quiet" to={'/recipes/' + recipe.id}>Back to the recipe</Link></div>
    </div> : <div className="cook-step">
      <h1 className="cook-title">{recipe.title}</h1>
      <p className="cook-text">{recipe.steps[step]}</p>
      {left !== null && <div className="timer">
        <span className={left === 0 ? 'timer-done' : ''}>{left === 0 ? 'Time’s up' : clock}</span>
        <button type="button" className="btn ghost" onClick={() => setRunning(r => !r)} disabled={left === 0}>
          {running ? <><Pause size={16}/> Pause</> : <><Play size={16}/> Start timer</>}</button>
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
  const {site, recipes} = useApp();
  useEffect(() => { if (hash) document.getElementById(hash)?.scrollIntoView(); }, [hash]);
  return <section className="section page">
    <p className="eyebrow">{site.cast.eyebrow}</p>
    <h1>{site.cast.title}</h1>
    <p className="section-text">{site.cast.text}</p>
    <div className="character-list">
      {site.characters.map(c => <article key={c.id} id={c.id} className="character">
        <Portrait character={c} image={site.cast.image} size="lg"/>
        <div>
          <p className="eyebrow">{c.role.toUpperCase()}</p>
          <h2>{c.name}</h2>
          <p className="section-text">{c.bio}</p>
          <blockquote>“{c.quote}”</blockquote>
          <p className="section-text">{c.relationship}</p>
          <Link className="quiet" to="/story">Follow the story <ArrowRight size={16} aria-hidden="true"/></Link>
        </div>
      </article>)}
    </div>
    <h2 className="spaced">Eight ways into the same kitchen.</h2>
    {site.collections.map(c => <section key={c.id} id={c.id} className="collection-row">
      <div><h3>{c.name}</h3><p className="section-text">{c.text}</p>
        <Link className="quiet" to={'/recipes?collection=' + c.id}>Explore this collection <ArrowRight size={16} aria-hidden="true"/></Link></div>
      <div className="recipe-grid compact">{c.recipes.map(id => recipeById(recipes, id)).filter(Boolean).map(r => <RecipeCard key={r.id} recipe={r}/>)}</div>
    </section>)}
  </section>;
}

export function Story({hash}) {
  const {site, recipes} = useApp();
  useEffect(() => { if (hash) document.getElementById(hash)?.scrollIntoView(); }, [hash]);
  return <section className="section page">
    <p className="eyebrow">{site.season.eyebrow}</p>
    <h1>{site.season.title}</h1>
    <p className="section-text">{site.season.text}</p>
    <ol className="episodes">
      {site.episodes.map(e => {
        const r = recipeById(recipes, e.recipe);
        return <li key={e.n} id={'episode-' + e.n} className="episode">
          <p className="eyebrow">EPISODE {e.n} · OUTLINE</p>
          <h2>{e.title}</h2>
          <p className="section-text">{e.text}</p>
          <p className="micro">With Luna, Simba, Nico and Milo. {site.season.status}</p>
          {r && <Link className="episode-recipe" to={'/recipes/' + r.id}>
            <RecipeImage recipe={r}/><span><small>From our kitchen</small><strong>{r.title}</strong><Meta recipe={r}/></span>
          </Link>}
        </li>;
      })}
    </ol>
  </section>;
}

export function NotFound() {
  return <section className="section page empty">
    <h1>This page wandered off.</h1>
    <p className="section-text">Milo may have eaten it. Try the recipe library instead.</p>
    <Link className="btn" to="/recipes">Browse recipes</Link>
  </section>;
}
