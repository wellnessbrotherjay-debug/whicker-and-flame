import React, {useEffect, useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Menu, X, ChefHat} from 'lucide-react';
import './styles.css';
import {api} from './api.js';
import {Link, navigate, useLocation} from './router.jsx';
import {AppContext, Logo, Notice} from './ui.jsx';
import {Discover, Cook, RecipePage, Characters, Story, EpisodePage, Community, NotFound} from './pages.jsx';
import {SignIn, Kitchen} from './kitchen.jsx';
import {Studio, PostEditor} from './studio.jsx';
import {storeFor, readLocal, mergeLocalIntoAccount} from './kitchenStore.js';
import {shoppingFor} from '../shared/shopping.mjs';
import {track, rememberSource, countForSource} from './track.js';

const NAV = [['/', 'Discover'], ['/recipes', 'Cook'], ['/kitchen', 'My Kitchen'], ['/characters', 'Characters'], ['/community', 'Community']];

function App() {
  const location = useLocation();
  const [catalog, setCatalog] = useState(null);
  const [user, setUser] = useState(null);
  const [kitchen, setKitchen] = useState(readLocal);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);

  async function load() {
    try {
      const [c, m] = await Promise.all([api('catalog'), api('me')]);
      setCatalog(c);
      setUser(m.user);
      setKitchen(m.user ? m.kitchen : readLocal());
      setError('');
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { rememberSource(); load(); }, []);
  useEffect(() => { setMenu(false); }, [location.path]);
  useEffect(() => {
    if (!catalog) return;
    const recipe = catalog.recipes.find(r => '/recipes/' + r.id === location.path);
    const episode = catalog.site.episodes.find(e => '/story/' + e.slug === location.path);
    const titles = {'/recipes': 'Cook', '/characters': 'Characters', '/story': 'The Lost Recipe Book', '/kitchen': 'My Kitchen', '/community': 'Community', '/signin': 'Sign in'};
    const name = recipe?.title || (episode && `Episode ${episode.n}: ${episode.title}`) || titles[location.path];
    document.title = name ? `${name} · Whisker & Heat` : 'Whisker & Heat — Real cats. Wild recipes.';
    if (recipe) track('recipe_opened', {recipeId: recipe.id});
  }, [location.path, catalog]);

  const store = useMemo(() => catalog && storeFor(!!user, catalog.recipes), [user, catalog]);
  const shopping = useMemo(() => catalog ? shoppingFor(kitchen, catalog.recipes) : [], [kitchen, catalog]);

  if (!catalog) return <div className="loading"><ChefHat size={40} aria-hidden="true"/>
    {error ? <><Notice tone="error">{error}</Notice><button className="btn" onClick={load}>Try again</button></> : <p>Opening the kitchen…</p>}</div>;

  const run = (event, work) => async (...args) => {
    const next = await work(...args);
    setKitchen(next);
    track(event, args[0] && typeof args[0] === 'object' ? {recipeId: args[0].recipeId} : {});
    countForSource(event);
    return next;
  };
  const context = {
    ...catalog, user, kitchen, shopping,
    signedIn: async () => {
      const m = await api('me');
      setUser(m.user);
      setKitchen((await mergeLocalIntoAccount()) || m.kitchen);
    },
    toggleFavorite: run('favorite_toggled', id => store.toggleFavorite(id, !kitchen.favorites.includes(id))),
    addToPlan: run('meal_planned', entry => store.addToPlan(entry)),
    removeFromPlan: run('meal_unplanned', id => store.removeFromPlan(id)),
    addToList: run('list_added', entry => store.addToList(entry)),
    removeFromList: run('list_removed', id => store.removeFromList(id)),
    markShopping: run('shopping_marked', (key, state) => store.markShopping(key, state)),
    clearChecked: run('shopping_cleared', () => store.clearChecked()),
    resetList: run('shopping_reset', () => store.resetList()),
    setPreferences: run('preferences_saved', prefs => store.setPreferences(prefs)),
  };
  async function signOut() {
    await api('signout', {method: 'POST', body: {}});
    setUser(null);
    setKitchen(readLocal());
    navigate('/');
  }

  const {path, search, hash} = location;
  let page;
  if (path === '/') page = <Discover/>;
  else if (path === '/recipes') page = <Cook key={search.toString()} search={search}/>;
  else if (path.startsWith('/recipes/')) page = <RecipePage key={path} id={path.slice(9)} hash={hash}/>;
  else if (path === '/characters') page = <Characters hash={hash}/>;
  else if (path === '/story') page = <Story/>;
  else if (path.startsWith('/story/')) page = <EpisodePage key={path} slug={path.slice(7)}/>;
  else if (path === '/kitchen') page = <Kitchen hash={hash}/>;
  else if (path === '/community') page = <Community/>;
  else if (path === '/signin') page = <SignIn search={search}/>;
  else if (path === '/studio') page = <Studio hash={hash}/>;
  else if (path.startsWith('/studio/post/')) page = <PostEditor key={path} id={path.slice(13)} search={search}/>;
  else page = <NotFound/>;
  const current = to => to === '/' ? path === '/' || path.startsWith('/story') : path === to || path.startsWith(to + '/');

  return <AppContext.Provider value={context}>
    <a className="skip" href="#main">Skip to content</a>
    <header className="site-header">
      <Logo/>
      <nav id="site-nav" className={menu ? 'open' : ''} aria-label="Main">
        {NAV.map(([to, label]) => <Link key={to} to={to} aria-current={current(to) ? 'page' : undefined}>{label}</Link>)}
        {user ? <>{user.isAdmin && <Link to="/studio">Studio</Link>}<button type="button" className="quiet" onClick={signOut}>Sign out</button></>
          : <Link to="/signin" className="btn small">Sign in</Link>}
      </nav>
      <button type="button" className="icon menu-toggle" aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu} aria-controls="site-nav"
        onClick={() => setMenu(!menu)}>{menu ? <X/> : <Menu/>}</button>
    </header>
    <main id="main">{page}</main>
    <footer className="site-footer">
      <Logo/>
      <p>{catalog.site.brand.tagline}</p>
      <p className="micro">{catalog.site.notes.cats}</p>
      <p className="micro">{catalog.site.notes.allergy}</p>
    </footer>
  </AppContext.Provider>;
}

createRoot(document.getElementById('root')).render(<App/>);
