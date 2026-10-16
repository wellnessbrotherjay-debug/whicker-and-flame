import React, {useEffect, useState} from 'react';
import {Trash2, ArrowRight, X} from 'lucide-react';
import {Link, navigate} from './router.jsx';
import {useApp, RecipeCard, RecipeImage, Notice, Empty} from './ui.jsx';
import {api} from './api.js';
import {SLOTS} from '../shared/kitchen.mjs';

const label = slot => slot[0].toUpperCase() + slot.slice(1);

export function SignIn({search}) {
  const {signedIn, kitchen} = useApp();
  const [mode, setMode] = useState(search.get('mode') === 'register' ? 'register' : 'signin');
  const [form, setForm] = useState({name: '', email: '', password: ''});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const wanted = search.get('next') || '/kitchen';
  const next = wanted.startsWith('/') && !wanted.startsWith('//') ? wanted : '/kitchen';
  const set = key => e => setForm(f => ({...f, [key]: e.target.value}));
  const carrying = kitchen.favorites.length + kitchen.plan.length + kitchen.listed.length;

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await api(mode === 'register' ? 'register' : 'signin', {method: 'POST', body: form});
      await signedIn();
      navigate(next);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <section className="section page narrow">
    <p className="eyebrow">MY KITCHEN</p>
    <h1>{mode === 'register' ? 'Create your account' : 'Welcome back'}</h1>
    <p className="section-text">An account keeps your saved recipes, weekly plan and shopping list on every device. You can use My Kitchen without one; it is then kept in this browser only.</p>
    {carrying > 0 && <Notice>What you saved in this browser will move into your account.</Notice>}
    <form className="form" onSubmit={submit}>
      {mode === 'register' && <label>Your name (optional)<input value={form.name} onChange={set('name')} autoComplete="name"/></label>}
      <label>Email<input type="email" required value={form.email} onChange={set('email')} autoComplete="email"/></label>
      <label>Password{mode === 'register' && <small> at least 8 characters</small>}<input type="password" required minLength={8} value={form.password} onChange={set('password')}
        autoComplete={mode === 'register' ? 'new-password' : 'current-password'}/></label>
      {error && <Notice tone="error">{error}</Notice>}
      <button className="btn full" disabled={busy}>{busy ? 'One moment…' : mode === 'register' ? 'Create account' : 'Sign in'}</button>
    </form>
    <button type="button" className="quiet" onClick={() => { setMode(mode === 'register' ? 'signin' : 'register'); setError(''); }}>
      {mode === 'register' ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
  </section>;
}

function days(count) {
  return Array.from({length: count}, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {iso: d.toLocaleDateString('en-CA'), label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, {weekday: 'long', day: 'numeric', month: 'short'})};
  });
}

function Week({run}) {
  const {kitchen, recipes, addToPlan, removeFromPlan} = useApp();
  const [adding, setAdding] = useState({});
  const recipe = id => recipes.find(r => r.id === id);
  return <ol className="week">
    {days(7).map(day => <li key={day.iso} className="day">
      <h3>{day.label}</h3>
      {SLOTS.map(slot => {
        const meals = kitchen.plan.filter(p => p.date === day.iso && p.slot === slot);
        const key = day.iso + slot;
        return <div key={slot} className="slot">
          <h4>{label(slot)}</h4>
          {meals.map(p => {
            const r = recipe(p.recipeId);
            return <div key={p.id} className="meal">
              <Link to={'/recipes/' + r.id} tabIndex={-1} aria-hidden="true"><RecipeImage recipe={r} className="thumb"/></Link>
              <span><Link to={'/recipes/' + r.id}>{r.title}</Link><small>{p.servings} servings</small></span>
              <button type="button" className="icon" aria-label={`Remove ${r.title} from ${day.label} ${slot}`}
                onClick={() => run(() => removeFromPlan(p.id))}><Trash2 size={18}/></button>
            </div>;
          })}
          <form className="add-meal" onSubmit={e => { e.preventDefault(); if (adding[key]) run(async () => { await addToPlan({date: day.iso, slot, recipeId: adding[key]}); setAdding(a => ({...a, [key]: ''})); }); }}>
            <label><span className="sr-only">Add a recipe for {day.label} {slot}</span>
              <select value={adding[key] || ''} onChange={e => setAdding(a => ({...a, [key]: e.target.value}))}>
                <option value="">Add a recipe…</option>
                {recipes.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select></label>
            <button className="btn ghost small" disabled={!adding[key]}>Add</button>
          </form>
        </div>;
      })}
    </li>)}
  </ol>;
}

function Shopping({run}) {
  const {kitchen, recipes, shopping, markShopping, clearChecked, resetList, removeFromList} = useApp();
  const done = shopping.filter(i => i.checked).length;
  const aisles = [...new Set(shopping.map(i => i.aisle))];
  const listed = kitchen.listed.map(l => ({...l, recipe: recipes.find(r => r.id === l.recipeId)})).filter(l => l.recipe);
  if (!shopping.length && !listed.length) return <Empty title="Your shopping list is empty."
    action={<div className="actions"><Link className="btn" to="/kitchen#week">Plan my week</Link><Link className="quiet" to="/recipes">Find a recipe</Link></div>}>
    Plan a few meals, or open a recipe and choose “Add ingredients to list”. Everything is added up for you.</Empty>;
  return <>
    <p className="section-text">Everything for your planned meals{listed.length ? ' and the recipes below' : ''}, added together. Amounts in different units are kept apart rather than guessed.</p>
    {listed.length > 0 && <div className="listed">
      <span>Also on the list:</span>
      {listed.map(l => <span key={l.recipeId} className="chip">{l.recipe.title} · {l.servings}
        <button type="button" className="icon" aria-label={`Take ${l.recipe.title} off the list`} onClick={() => run(() => removeFromList(l.recipeId))}><X size={14}/></button></span>)}
    </div>}
    {aisles.map(aisle => <section key={aisle} className="aisle">
      <h3>{aisle}</h3>
      <ul className="shopping">
        {shopping.filter(i => i.aisle === aisle).map(item => <li key={item.key} className={item.checked ? 'done' : ''}>
          <label><input type="checkbox" checked={item.checked}
            onChange={() => run(() => markShopping(item.key, item.checked ? 'clear' : 'checked'))}/>
            <span>{item.label}<small>{item.recipes.join(', ')}</small></span></label>
          <button type="button" className="icon" aria-label={'Remove ' + item.label} onClick={() => run(() => markShopping(item.key, 'removed'))}><Trash2 size={18}/></button>
        </li>)}
      </ul>
    </section>)}
    <div className="actions">
      <button type="button" className="btn ghost" disabled={!done} onClick={() => run(() => clearChecked())}>Clear {done || ''} ticked {done === 1 ? 'item' : 'items'}</button>
      <button type="button" className="quiet" onClick={() => { if (confirm('Start a fresh list? Ticks and removed items are reset, and recipes added only to the list are taken off. Your meal plan stays.')) run(() => resetList()); }}>Start a fresh list</button>
    </div>
  </>;
}

function Preferences({run}) {
  const {kitchen, setPreferences} = useApp();
  const [form, setForm] = useState(kitchen.preferences);
  const [saved, setSaved] = useState(false);
  useEffect(() => setForm(kitchen.preferences), [kitchen.preferences]);
  const set = (key, value) => { setSaved(false); setForm(f => { const n = {...f}; if (value === '' || value === false || value === 0) delete n[key]; else n[key] = value; return n; }); };
  return <form className="form prefs" onSubmit={e => { e.preventDefault(); run(async () => { await setPreferences(form); setSaved(true); }); }}>
    <p className="section-text">Tell us how you like to cook and Discover will suggest recipes that fit. Nothing here is shared.</p>
    <label>Cooking time<select value={form.maxMinutes || ''} onChange={e => set('maxMinutes', Number(e.target.value))}>
      <option value="">Any length</option><option value="20">20 minutes or less</option><option value="30">30 minutes or less</option>
      <option value="45">45 minutes or less</option><option value="60">An hour or less</option></select></label>
    <label>Skill level<select value={form.difficulty || ''} onChange={e => set('difficulty', e.target.value)}>
      <option value="">Any</option><option value="Easy">Easy recipes only</option><option value="Medium">I like a bit of a challenge</option></select></label>
    <label className="toggle"><input type="checkbox" checked={!!form.budget} onChange={e => set('budget', e.target.checked)}/> Budget-friendly recipes</label>
    <label className="toggle"><input type="checkbox" checked={!!form.meatFree} onChange={e => set('meatFree', e.target.checked)}/> No meat or fish</label>
    <button className="btn">Save preferences</button>
    {saved && <Notice tone="ok">Saved. <Link to="/">See your picks on Discover</Link></Notice>}
  </form>;
}

const TABS = [['week', 'My week'], ['shopping', 'Shopping list'], ['saved', 'Saved'], ['preferences', 'Preferences']];

export function Kitchen({hash}) {
  const {user, kitchen, recipes, shopping} = useApp();
  const tab = TABS.some(([id]) => id === hash) ? hash : 'week';
  const [error, setError] = useState('');
  const run = async work => { setError(''); try { await work(); } catch (e) { setError(e.message); } };
  const counts = {week: kitchen.plan.length, shopping: shopping.filter(i => !i.checked).length, saved: kitchen.favorites.length};

  return <section className="section page">
    <p className="eyebrow">{user?.name ? user.name.toUpperCase() + '’S KITCHEN' : 'MY KITCHEN'}</p>
    <h1>Cook, plan, shop.</h1>
    {!user && <Notice>Saved in this browser only. <Link to="/signin?mode=register&next=/kitchen">Create a free account</Link> to keep it on every device.</Notice>}
    <nav className="tabs" aria-label="My Kitchen">
      {TABS.map(([id, name]) => <Link key={id} to={'/kitchen#' + id} aria-current={tab === id ? 'page' : undefined}>
        {name}{counts[id] !== undefined && <span className="count-pill">{counts[id]}</span>}</Link>)}
    </nav>
    {error && <Notice tone="error">{error}</Notice>}
    {tab === 'week' && <Week run={run}/>}
    {tab === 'shopping' && <Shopping run={run}/>}
    {tab === 'saved' && (kitchen.favorites.length
      ? <div className="recipe-grid">{kitchen.favorites.map(id => recipes.find(r => r.id === id)).filter(Boolean).map(r => <RecipeCard key={r.id} recipe={r}/>)}</div>
      : <Empty title="No saved recipes yet." action={<Link className="btn" to="/recipes">Browse recipes <ArrowRight size={16} aria-hidden="true"/></Link>}>Tap the heart on any recipe to keep it here.</Empty>)}
    {tab === 'preferences' && <Preferences run={run}/>}
  </section>;
}
