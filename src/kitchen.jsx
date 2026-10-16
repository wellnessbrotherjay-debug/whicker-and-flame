import React, {useEffect, useState} from 'react';
import {Trash2, ArrowRight} from 'lucide-react';
import {Link, navigate} from './router.jsx';
import {useApp, RecipeCard, RecipeImage, Notice} from './ui.jsx';
import {api} from './api.js';

export function SignIn({search}) {
  const {refreshMe} = useApp();
  const [mode, setMode] = useState(search.get('mode') === 'register' ? 'register' : 'signin');
  const [form, setForm] = useState({name: '', email: '', password: ''});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const next = (search.get('next') || '/kitchen').startsWith('/') ? search.get('next') || '/kitchen' : '/kitchen';
  const set = key => e => setForm(f => ({...f, [key]: e.target.value}));

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      await api(mode === 'register' ? 'register' : 'signin', {method: 'POST', body: form});
      await refreshMe();
      navigate(next);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <section className="section page narrow">
    <p className="eyebrow">YOUR KITCHEN</p>
    <h1>{mode === 'register' ? 'Create your account' : 'Welcome back'}</h1>
    <p className="section-text">Save recipes, plan your week and build one shopping list on any device.</p>
    <form className="form" onSubmit={submit}>
      {mode === 'register' && <label>Your name<input value={form.name} onChange={set('name')} autoComplete="name"/></label>}
      <label>Email<input type="email" required value={form.email} onChange={set('email')} autoComplete="email"/></label>
      <label>Password<input type="password" required minLength={8} value={form.password} onChange={set('password')}
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
    return {iso: d.toISOString().slice(0, 10), label: d.toLocaleDateString(undefined, {weekday: 'long', day: 'numeric', month: 'short'})};
  });
}

export function Kitchen({hash}) {
  const {me, recipes, addToPlan, removeFromPlan, markShopping} = useApp();
  const tab = ['saved', 'week', 'shopping'].includes(hash) ? hash : 'week';
  const [error, setError] = useState('');
  const [adding, setAdding] = useState({});
  if (!me) return <section className="section page narrow">
    <h1>Your kitchen</h1>
    <p className="section-text">Sign in to save recipes, plan your week and build a shopping list.</p>
    <div className="actions"><Link className="btn" to="/signin?next=/kitchen">Sign in</Link>
      <Link className="quiet" to="/signin?mode=register&next=/kitchen">Create an account</Link></div>
  </section>;

  const byId = id => recipes.find(r => r.id === id);
  const run = async work => { setError(''); try { await work(); } catch (e) { setError(e.message); } };
  const week = days(14);
  const open = me.shopping.filter(i => !i.checked).length;

  return <section className="section page">
    <p className="eyebrow">{me.user.name ? me.user.name.toUpperCase() + '’S KITCHEN' : 'YOUR KITCHEN'}</p>
    <h1>Cook, plan, shop.</h1>
    <nav className="tabs" aria-label="Your kitchen">
      <Link to="/kitchen#week" aria-current={tab === 'week' ? 'page' : undefined}>My week ({me.plan.length})</Link>
      <Link to="/kitchen#shopping" aria-current={tab === 'shopping' ? 'page' : undefined}>Shopping list ({open})</Link>
      <Link to="/kitchen#saved" aria-current={tab === 'saved' ? 'page' : undefined}>Saved ({me.favorites.length})</Link>
    </nav>
    {error && <Notice tone="error">{error}</Notice>}

    {tab === 'saved' && (me.favorites.length
      ? <div className="recipe-grid">{me.favorites.map(byId).filter(Boolean).map(r => <RecipeCard key={r.id} recipe={r}/>)}</div>
      : <div className="empty"><p>Tap the heart on any recipe to keep it here.</p><Link className="btn" to="/recipes">Browse recipes</Link></div>)}

    {tab === 'week' && <ol className="week">
      {week.map(day => {
        const meals = me.plan.filter(p => p.date === day.iso);
        const choice = adding[day.iso] || '';
        return <li key={day.iso} className="day">
          <h3>{day.label}</h3>
          {meals.map(p => {
            const r = byId(p.recipeId);
            return <div key={p.id} className="meal">
              <Link to={'/recipes/' + r.id}><RecipeImage recipe={r} className="thumb"/></Link>
              <span><Link to={'/recipes/' + r.id}>{r.title}</Link><small>Serves {p.servings}</small></span>
              <button type="button" className="icon" aria-label={`Remove ${r.title} from ${day.label}`}
                onClick={() => run(() => removeFromPlan(p.id))}><Trash2 size={18}/></button>
            </div>;
          })}
          <form className="add-meal" onSubmit={e => { e.preventDefault(); if (choice) run(async () => { await addToPlan({date: day.iso, recipeId: choice}); setAdding(a => ({...a, [day.iso]: ''})); }); }}>
            <label><span className="sr-only">Add a recipe to {day.label}</span>
              <select value={choice} onChange={e => setAdding(a => ({...a, [day.iso]: e.target.value}))}>
                <option value="">Add a recipe…</option>
                {recipes.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
              </select></label>
            <button className="btn ghost small" disabled={!choice}>Add</button>
          </form>
        </li>;
      })}
    </ol>}

    {tab === 'shopping' && (me.shopping.length ? <>
      <p className="section-text">Everything for your planned meals, added together. Tick things off as you shop.</p>
      <ul className="shopping">
        {me.shopping.map(item => <li key={item.key} className={item.checked ? 'done' : ''}>
          <label><input type="checkbox" checked={item.checked}
            onChange={() => run(() => markShopping(item.key, item.checked ? 'clear' : 'checked'))}/>
            <span>{item.label}<small>{item.recipes.join(', ')}</small></span></label>
          <button type="button" className="icon" aria-label={'Remove ' + item.label}
            onClick={() => run(() => markShopping(item.key, 'removed'))}><Trash2 size={18}/></button>
        </li>)}
      </ul>
    </> : <div className="empty"><p>Plan a few meals and your shopping list appears here.</p>
      <Link className="btn" to="/kitchen#week">Plan my week <ArrowRight size={16}/></Link></div>)}
  </section>;
}

export function Studio() {
  const {me, recipes} = useApp();
  const [jobs, setJobs] = useState([]);
  const [recipeId, setRecipeId] = useState(recipes[0].id);
  const [prompt, setPrompt] = useState('');
  const [message, setMessage] = useState(null);
  const allowed = me?.user?.isAdmin;
  const refresh = async () => { try { setJobs(await api('jobs')); } catch (e) { setMessage({tone: 'error', text: e.message}); } };
  useEffect(() => { if (allowed) refresh(); }, [allowed]);
  if (!allowed) return <section className="section page narrow"><h1>Kitchen team only</h1>
    <p className="section-text">The video studio is for the Whisker &amp; Heat team.</p></section>;

  async function create(event) {
    event.preventDefault();
    try {
      await api('jobs', {method: 'POST', body: {recipeId, prompt}});
      setPrompt('');
      setMessage({tone: 'ok', text: 'Video job saved. It waits for the n8n workflow to pick it up; generation has not started.'});
      refresh();
    } catch (e) { setMessage({tone: 'error', text: e.message}); }
  }
  async function approve(job) {
    try { await api(`jobs/${job.id}/approve`, {method: 'POST', body: {}}); setMessage({tone: 'ok', text: 'Published on the recipe page.'}); refresh(); }
    catch (e) { setMessage({tone: 'error', text: e.message}); }
  }

  return <section className="section page">
    <p className="eyebrow">PRODUCTION STUDIO</p>
    <h1>Video jobs</h1>
    <form className="form" onSubmit={create}>
      <label>Recipe<select value={recipeId} onChange={e => setRecipeId(e.target.value)}>
        {recipes.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}</select></label>
      <label>Scene prompt<textarea rows={4} value={prompt} onChange={e => setPrompt(e.target.value)} required minLength={10} maxLength={4000}/></label>
      <button className="btn">Save video job</button>
    </form>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    <ul className="jobs">{jobs.map(j => <li key={j.id}>
      <strong>{recipes.find(r => r.id === j.recipeId)?.title}</strong> <span className={'status status-' + j.status}>{j.status}</span>
      <p className="micro">{j.prompt}</p>
      {j.error && <Notice tone="error">{j.error}</Notice>}
      {j.videoUrl && <video controls playsInline preload="metadata" src={j.videoUrl}/>}
      {j.status === 'review' && <button className="btn small" onClick={() => approve(j)}>Approve and publish</button>}
    </li>)}</ul>
  </section>;
}
