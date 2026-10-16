import React, {useEffect, useMemo, useState} from 'react';
import {ArrowLeft, ArrowRight, CalendarPlus, Plus, Trash2, Copy, ExternalLink} from 'lucide-react';
import {Link, navigate} from './router.jsx';
import {useApp, Notice, Empty, Portrait} from './ui.jsx';
import {api} from './api.js';
import {STATUSES, STATUS_LABELS, PLATFORMS, PLATFORM_LABELS, canMove, mondayOf} from '../shared/content.mjs';

const TABS = [['calendar', 'Calendar'], ['board', 'Board'], ['results', 'Results'], ['brand', 'Brand kit'], ['videos', 'Video jobs']];
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayLabel = iso => new Date(iso + 'T12:00:00Z').toLocaleDateString(undefined, {weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'});
const total = (post, key) => Object.values(post.metrics || {}).reduce((n, m) => n + (Number(m?.[key]) || 0), 0);

function usePosts(range) {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState('');
  const load = async () => {
    try { setPosts(await api('studio/posts' + (range ? `?from=${range[0]}&to=${range[1]}` : ''))); setError(''); }
    catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, [range?.[0]]);
  return {posts, error, load};
}

function PostChip({post}) {
  const {site, recipes} = useApp();
  const pillar = site.collections.find(c => c.id === post.pillar);
  const recipe = recipes.find(r => r.id === post.recipeId);
  return <Link to={'/studio/post/' + post.id} className={'post-chip status-' + post.status}>
    <span className="post-status">{STATUS_LABELS[post.status]}</span>
    <strong>{post.title}</strong>
    <small>{pillar?.name} · {post.format}{recipe ? ' · ' + recipe.title : ''}</small>
    <small>{post.platforms.map(p => PLATFORM_LABELS[p]).join(', ')}{post.time ? ' · ' + post.time : ''}</small>
  </Link>;
}

function Calendar() {
  const [week, setWeek] = useState(() => mondayOf(new Date().toLocaleDateString('en-CA')));
  const range = [week, addDays(week, 6)];
  const {posts, error, load} = usePosts(range);
  const [message, setMessage] = useState(null);
  async function plan() {
    try {
      const {created} = await api('studio/plan-week', {method: 'POST', body: {weekStart: week}});
      setMessage({tone: 'ok', text: created ? `${created} post ideas added for this week. Open each one to shape the script.` : 'This week already has its planned posts.'});
      load();
    } catch (e) { setMessage({tone: 'error', text: e.message}); }
  }
  return <>
    <div className="studio-bar">
      <button type="button" className="icon" aria-label="Previous week" onClick={() => setWeek(addDays(week, -7))}><ArrowLeft size={18}/></button>
      <strong>Week of {dayLabel(week)}</strong>
      <button type="button" className="icon" aria-label="Next week" onClick={() => setWeek(addDays(week, 7))}><ArrowRight size={18}/></button>
      <span className="spacer"/>
      <button type="button" className="btn ghost small" onClick={plan}><CalendarPlus size={16} aria-hidden="true"/> Plan this week</button>
      <Link className="btn small" to={'/studio/post/new?date=' + week}><Plus size={16} aria-hidden="true"/> New post</Link>
    </div>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {!posts ? <p className="section-text">Loading…</p> : <ol className="studio-week">
      {Array.from({length: 7}, (_, i) => addDays(week, i)).map(day => <li key={day}>
        <h3>{dayLabel(day)}</h3>
        {posts.filter(p => p.date === day).map(p => <PostChip key={p.id} post={p}/>)}
        {!posts.some(p => p.date === day) && <p className="micro">Nothing planned.</p>}
      </li>)}
    </ol>}
  </>;
}

function Board() {
  const {posts, error} = usePosts(null);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!posts) return <p className="section-text">Loading…</p>;
  if (!posts.length) return <Empty title="No posts yet." action={<Link className="btn" to="/studio#calendar">Plan this week</Link>}>Plan a week from the calendar, or add a post.</Empty>;
  return <div className="board">{STATUSES.map(s => <section key={s} className="board-col">
    <h3>{STATUS_LABELS[s]} <span className="count-pill">{posts.filter(p => p.status === s).length}</span></h3>
    {posts.filter(p => p.status === s).map(p => <PostChip key={p.id} post={p}/>)}
  </section>)}</div>;
}

function Results() {
  const {site} = useApp();
  const {posts, error} = usePosts(null);
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!posts) return <p className="section-text">Loading…</p>;
  const published = posts.filter(p => p.status === 'published');
  if (!published.length) return <Empty title="No published posts yet.">Results appear here once posts are published and n8n collects their numbers. Nothing is estimated.</Empty>;
  const pillars = site.collections.map(c => {
    const mine = published.filter(p => p.pillar === c.id);
    return {c, n: mine.length, views: mine.reduce((s, p) => s + total(p, 'views'), 0), saves: mine.reduce((s, p) => s + total(p, 'saves'), 0),
      shares: mine.reduce((s, p) => s + total(p, 'shares'), 0), opens: mine.reduce((s, p) => s + (p.links.open || 0), 0),
      actions: mine.reduce((s, p) => s + (p.links.save || 0) + (p.links.plan || 0) + (p.links.list || 0), 0)};
  }).filter(x => x.n);
  return <>
    <p className="section-text">Judged by what people did, not views alone: saves and shares per 1,000 views, and recipe opens and kitchen actions from each post’s link.</p>
    <div className="table-wrap"><table className="results">
      <thead><tr><th>Collection</th><th>Posts</th><th>Views</th><th>Saves / 1k</th><th>Shares / 1k</th><th>Recipe opens</th><th>Saved, planned or listed</th></tr></thead>
      <tbody>{pillars.map(x => <tr key={x.c.id}><td>{x.c.name}</td><td>{x.n}</td><td>{x.views}</td>
        <td>{x.views ? (x.saves / x.views * 1000).toFixed(1) : '—'}</td><td>{x.views ? (x.shares / x.views * 1000).toFixed(1) : '—'}</td>
        <td>{x.opens}</td><td>{x.actions}</td></tr>)}</tbody>
    </table></div>
    <h3 className="spaced">Posts</h3>
    <ul className="plain">{published.map(p => <li key={p.id}><Link to={'/studio/post/' + p.id}>{p.title}</Link> · {total(p, 'views')} views · {total(p, 'saves')} saves · {p.links.open || 0} recipe opens</li>)}</ul>
  </>;
}

function BrandKit() {
  const {site} = useApp();
  const [brand, setBrand] = useState(null);
  const [text, setText] = useState('');
  const [message, setMessage] = useState(null);
  useEffect(() => { api('studio/brand').then(b => { setBrand(b); setText(JSON.stringify(b, null, 1)); }, e => setMessage({tone: 'error', text: e.message})); }, []);
  if (!brand) return message ? <Notice tone={message.tone}>{message.text}</Notice> : <p className="section-text">Loading…</p>;
  async function save() {
    let parsed;
    try { parsed = JSON.parse(text); } catch { return setMessage({tone: 'error', text: 'That is not valid — check commas and quotes.'}); }
    try { const b = await api('studio/brand', {method: 'POST', body: parsed}); setBrand(b); setMessage({tone: 'ok', text: 'Brand kit saved.'}); }
    catch (e) { setMessage({tone: 'error', text: e.message}); }
  }
  return <>
    <div className="brand-cast">{site.characters.map(c => <article key={c.id} className="brand-card">
      <Portrait character={c} image={site.cast.image} size="lg"/>
      <h3>{c.name} · {c.role}</h3>
      <p><strong>Look:</strong> {brand.characters[c.id]?.look}</p>
      <p><strong>Voice:</strong> {brand.characters[c.id]?.voice}</p>
      <p><strong>Catchphrase:</strong> “{brand.characters[c.id]?.catchphrase}”</p>
      <p><strong>Never:</strong> {brand.characters[c.id]?.never}</p>
    </article>)}</div>
    <h3 className="spaced">Style</h3>
    <p className="section-text">{brand.style.look}</p>
    <ul className="plain rules">{brand.style.rules.map(r => <li key={r}>{r}</li>)}</ul>
    <h3 className="spaced">Hooks</h3>
    <ul className="plain">{brand.hooks.map(h => <li key={h}>{h}</li>)}</ul>
    <h3 className="spaced">Community prompts</h3>
    <ul className="plain">{brand.community.map(h => <li key={h}>{h}</li>)}</ul>
    <details className="spaced"><summary>Edit the whole brand kit</summary>
      <textarea className="code" rows={24} value={text} onChange={e => setText(e.target.value)} spellCheck={false} aria-label="Brand kit"/>
      <button type="button" className="btn" onClick={save}>Save brand kit</button>
    </details>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
  </>;
}

function Videos() {
  const {recipes} = useApp();
  const [jobs, setJobs] = useState(null);
  const [message, setMessage] = useState(null);
  const refresh = () => api('jobs').then(setJobs, e => setMessage({tone: 'error', text: e.message}));
  useEffect(() => { refresh(); }, []);
  async function approve(job) {
    try { await api(`jobs/${job.id}/approve`, {method: 'POST', body: {}}); refresh(); } catch (e) { setMessage({tone: 'error', text: e.message}); }
  }
  return <>
    <p className="section-text">Video jobs are created from a post’s scene prompt and picked up by the n8n video workflow once the video provider is connected.</p>
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    {!jobs ? <p className="section-text">Loading…</p> : !jobs.length ? <p className="section-text">No video jobs yet.</p> : <ul className="jobs">{jobs.map(j => <li key={j.id}>
      <strong>{recipes.find(r => r.id === j.recipeId)?.title}</strong> <span className={'status status-' + j.status}>{j.status}</span>
      <p className="micro">{j.prompt}</p>
      {j.error && <Notice tone="error">{j.error}</Notice>}
      {j.videoUrl && <video controls playsInline preload="metadata" src={j.videoUrl}/>}
      {j.status === 'review' && <button type="button" className="btn small" onClick={() => approve(j)}>Approve video</button>}
    </li>)}</ul>}
  </>;
}

export function Studio({hash}) {
  const {user} = useApp();
  if (!user?.isAdmin) return <section className="section page narrow"><h1>Kitchen team only</h1>
    <p className="section-text">The Studio is where the Whisker &amp; Heat team plans and publishes content. <Link to="/signin?next=/studio">Sign in</Link> with a team account.</p></section>;
  const tab = TABS.some(([id]) => id === hash) ? hash : 'calendar';
  return <section className="section page studio">
    <p className="eyebrow">AGENCY OS · STUDIO</p>
    <h1>Plan, make, publish.</h1>
    <nav className="tabs" aria-label="Studio">{TABS.map(([id, name]) => <Link key={id} to={'/studio#' + id} aria-current={tab === id ? 'page' : undefined}>{name}</Link>)}</nav>
    {tab === 'calendar' && <Calendar/>}
    {tab === 'board' && <Board/>}
    {tab === 'results' && <Results/>}
    {tab === 'brand' && <BrandKit/>}
    {tab === 'videos' && <Videos/>}
  </section>;
}

const FORWARD = {script: 'Start the script', production: 'Into production', review: 'Send for review', approved: 'Approve', scheduled: 'Schedule'};
const moveLabel = (from, to) => STATUSES.indexOf(to) > STATUSES.indexOf(from) ? FORWARD[to] : 'Back to ' + STATUS_LABELS[to].toLowerCase();

export function PostEditor({id, search}) {
  const {user, site, recipes} = useApp();
  const isNew = id === 'new';
  const [post, setPost] = useState(null);
  const [form, setForm] = useState(null);
  const [brand, setBrand] = useState(null);
  const [message, setMessage] = useState(null);
  const [note, setNote] = useState('');
  useEffect(() => { if (user?.isAdmin) api('studio/brand').then(setBrand); }, [user]);
  useEffect(() => {
    if (!user?.isAdmin) return;
    if (isNew) {
      const blank = {title: '', status: 'idea', pillar: site.collections[0].id, format: 'gag', platforms: [...PLATFORMS], characters: [], recipeId: '', episode: null,
        hook: '', script: '', shotlist: '', captions: {}, hashtags: '', poll: '', notes: '', mediaUrl: '', date: search.get('date') || '', time: '18:00', published: {}, metrics: {}, links: {}};
      setPost(blank); setForm(blank);
    } else api('studio/posts').then(all => { const p = all.find(x => x.id === id); setPost(p || false); setForm(p ? {...p, recipeId: p.recipeId || '', mediaUrl: p.mediaUrl || '', date: p.date || '', time: p.time || ''} : null); });
  }, [id, user]);
  const scenePrompt = useMemo(() => {
    if (!brand || !form) return '';
    const looks = form.characters.map(c => `${site.characters.find(x => x.id === c)?.name}: ${brand.characters[c]?.look}`).join(' ');
    return brand.prompts.scene.replace('{style}', brand.style.look.replace(/\.$/, '')).replace('{characterLooks}', looks || 'none')
      .replace('{scene}', [form.hook, form.notes].filter(Boolean).join(' '));
  }, [brand, form]);
  if (!user?.isAdmin) return <Studio/>;
  if (post === false) return <section className="section page narrow"><h1>Post not found</h1><Link className="btn" to="/studio">Back to the Studio</Link></section>;
  if (!form) return <section className="section page"><p className="section-text">Loading…</p></section>;

  const locked = post.status === 'published';
  const set = (key, value) => setForm(f => ({...f, [key]: value}));
  const toggle = (key, value) => setForm(f => ({...f, [key]: f[key].includes(value) ? f[key].filter(v => v !== value) : [...f[key], value]}));
  const fields = () => {
    const {title, pillar, format, platforms, characters, recipeId, episode, hook, script, shotlist, captions, hashtags, poll, notes, mediaUrl, date, time} = form;
    return {title, pillar, format, platforms, characters, recipeId, episode, hook, script, shotlist, captions, hashtags, poll, notes, mediaUrl, date, time};
  };
  async function save() {
    try {
      const saved = isNew ? await api('studio/posts', {method: 'POST', body: fields()}) : await api('studio/posts/' + post.id, {method: 'POST', body: fields()});
      setMessage({tone: 'ok', text: 'Saved.'});
      if (isNew) navigate('/studio/post/' + saved.id); else { setPost(saved); setForm({...saved, recipeId: saved.recipeId || '', mediaUrl: saved.mediaUrl || '', date: saved.date || '', time: saved.time || ''}); }
      return saved;
    } catch (e) { setMessage({tone: 'error', text: e.message}); return null; }
  }
  async function move(status) {
    const saved = await save();
    if (!saved) return;
    try {
      const moved = await api(`studio/posts/${saved.id}/move`, {method: 'POST', body: {status, note}});
      setPost(moved); setForm({...moved, recipeId: moved.recipeId || '', mediaUrl: moved.mediaUrl || '', date: moved.date || '', time: moved.time || ''}); setNote('');
      setMessage({tone: 'ok', text: `Now: ${STATUS_LABELS[moved.status]}.`});
    } catch (e) { setMessage({tone: 'error', text: e.message}); }
  }
  async function remove() {
    if (!confirm('Delete this post?')) return;
    try { await api(`studio/posts/${post.id}/delete`, {method: 'POST', body: {}}); navigate('/studio#calendar'); } catch (e) { setMessage({tone: 'error', text: e.message}); }
  }
  async function makeVideoJob() {
    try { await api('jobs', {method: 'POST', body: {recipeId: form.recipeId || recipes[0].id, prompt: scenePrompt}}); setMessage({tone: 'ok', text: 'Video job saved; the n8n video workflow will pick it up once the provider is connected.'}); }
    catch (e) { setMessage({tone: 'error', text: e.message}); }
  }
  const link = post.slug ? location.origin + '/go/' + post.slug : '';
  const moves = STATUSES.filter(s => canMove(post.status, s));

  return <section className="section page studio post-editor">
    <Link className="quiet back" to="/studio#calendar"><ArrowLeft size={16} aria-hidden="true"/> Studio</Link>
    <p className="eyebrow">{isNew ? 'NEW POST' : STATUS_LABELS[post.status].toUpperCase()}</p>
    <h1>{form.title || 'Untitled post'}</h1>
    {post.reviewNote && <Notice>Review note: {post.reviewNote}</Notice>}
    <fieldset className="form" disabled={locked}>
      <label>Working title<input value={form.title} onChange={e => set('title', e.target.value)} required/></label>
      <div className="grid-2">
        <label>Collection<select value={form.pillar} onChange={e => set('pillar', e.target.value)}>{site.collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Format<select value={form.format} onChange={e => set('format', e.target.value)}>{brand && Object.entries(brand.formats).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}</select></label>
        <label>Recipe<select value={form.recipeId} onChange={e => set('recipeId', e.target.value)}><option value="">No recipe</option>{recipes.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}</select></label>
        <label>Episode<select value={form.episode || ''} onChange={e => set('episode', e.target.value ? Number(e.target.value) : null)}><option value="">Not an episode</option>{site.episodes.map(e => <option key={e.n} value={e.n}>Episode {e.n}: {e.title}</option>)}</select></label>
        <label>Date<input type="date" value={form.date} onChange={e => set('date', e.target.value)}/></label>
        <label>Time ({'Bali'})<input type="time" value={form.time} onChange={e => set('time', e.target.value)}/></label>
      </div>
      <div className="choice-row"><span>Platforms</span>{PLATFORMS.map(p => <label key={p} className="toggle"><input type="checkbox" checked={form.platforms.includes(p)} onChange={() => toggle('platforms', p)}/> {PLATFORM_LABELS[p]}</label>)}</div>
      <div className="choice-row"><span>Characters</span>{site.characters.map(c => <label key={c.id} className="toggle"><input type="checkbox" checked={form.characters.includes(c.id)} onChange={() => toggle('characters', c.id)}/> {c.name}</label>)}</div>
      <label>Hook (first 1–2 seconds)<textarea rows={2} value={form.hook} onChange={e => set('hook', e.target.value)}/></label>
      <label>Script<textarea rows={8} value={form.script} onChange={e => set('script', e.target.value)} placeholder="SIMBA: That was exactly what I meant to do!"/></label>
      <label>Shot list<textarea rows={4} value={form.shotlist} onChange={e => set('shotlist', e.target.value)}/></label>
      {form.platforms.map(p => <label key={p}>{PLATFORM_LABELS[p]} caption<textarea rows={3} value={form.captions[p] || ''} onChange={e => set('captions', {...form.captions, [p]: e.target.value})}/></label>)}
      <label>Hashtags<input value={form.hashtags} onChange={e => set('hashtags', e.target.value)}/></label>
      <label>Story or poll question<input value={form.poll} onChange={e => set('poll', e.target.value)}/></label>
      <label>Finished video or image (https link)<input type="url" value={form.mediaUrl} onChange={e => set('mediaUrl', e.target.value)}/></label>
      <label>Notes<textarea rows={3} value={form.notes} onChange={e => set('notes', e.target.value)}/></label>
    </fieldset>
    {scenePrompt && <details><summary>Scene prompt for the video provider</summary><p className="code-block">{scenePrompt}</p>
      {!locked && <button type="button" className="btn ghost small" onClick={makeVideoJob}>Create video job from this prompt</button>}</details>}
    {link && <p className="micro">Link for this post’s caption or bio: <code>{link}</code> <button type="button" className="icon" aria-label="Copy link" onClick={() => navigator.clipboard?.writeText(link)}><Copy size={16}/></button>
      {' '}· {post.links.open || 0} opens · {(post.links.save || 0) + (post.links.plan || 0) + (post.links.list || 0)} kitchen actions</p>}
    {Object.entries(post.published || {}).map(([p, v]) => <p key={p} className="micro">Published on {PLATFORM_LABELS[p]}: <a href={v.url} target="_blank" rel="noreferrer">{v.url} <ExternalLink size={12}/></a></p>)}
    {message && <Notice tone={message.tone}>{message.text}</Notice>}
    {!locked && <div className="actions">
      <button type="button" className="btn" onClick={save}>Save</button>
      {!isNew && moves.length > 0 && <label className="sr-only" htmlFor="note">Note</label>}
      {!isNew && moves.length > 0 && <input id="note" className="note-input" placeholder="Note (optional)" value={note} onChange={e => setNote(e.target.value)}/>}
      {!isNew && moves.map(s => <button key={s} type="button" className="btn ghost" onClick={() => move(s)}>{moveLabel(post.status, s)}</button>)}
      {!isNew && <button type="button" className="icon" aria-label="Delete post" onClick={remove}><Trash2 size={18}/></button>}
    </div>}
    {post.status === 'scheduled' && <p className="micro">Scheduled. The n8n publisher posts it at {form.time} on {form.date} once the platform accounts are connected.</p>}
  </section>;
}
