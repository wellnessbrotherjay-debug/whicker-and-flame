import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Menu, X, ChefHat} from 'lucide-react';
import './styles.css';
import {api} from './api.js';
import {Link, navigate, useLocation} from './router.jsx';
import {AppContext, Logo, Notice} from './ui.jsx';
import {Home, Recipes, RecipePage, Characters, Story, NotFound} from './pages.jsx';
import {SignIn, Kitchen, Studio} from './kitchen.jsx';

const NAV = [['/recipes', 'Recipes'], ['/characters', 'Characters & collections'], ['/story', 'The story'], ['/kitchen', 'My kitchen']];

function App() {
  const location = useLocation();
  const [catalog, setCatalog] = useState(null);
  const [me, setMe] = useState(null);
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);

  async function load() {
    try {
      const [c, m] = await Promise.all([api('catalog'), api('me')]);
      setCatalog(c); setMe(m.user ? m : null); setError('');
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => { setMenu(false); }, [location.path]);
  useEffect(() => {
    const titles = {'/recipes': 'Recipes', '/characters': 'Characters & collections', '/story': 'The Lost Recipe Book', '/kitchen': 'My kitchen', '/signin': 'Sign in'};
    const recipe = catalog?.recipes.find(r => '/recipes/' + r.id === location.path);
    const name = recipe?.title || titles[location.path];
    document.title = name ? `${name} · Whisker & Heat` : 'Whisker & Heat — Real cats. Wild recipes.';
  }, [location.path, catalog]);

  if (!catalog) return <div className="loading"><ChefHat size={40} aria-hidden="true"/>
    {error ? <><Notice tone="error">{error}</Notice><button className="btn" onClick={load}>Try again</button></> : <p>Opening the kitchen…</p>}</div>;

  const refreshMe = async () => { const m = await api('me'); setMe(m.user ? m : null); };
  const update = summary => setMe(m => ({...m, ...summary}));
  const needUser = () => { if (!me) { navigate('/signin?next=' + encodeURIComponent(location.path)); return false; } return true; };
  const context = {
    ...catalog, me, refreshMe,
    toggleFavorite: async recipeId => {
      if (!needUser()) return;
      update(await api('favorites', {method: 'POST', body: {recipeId, saved: !me.favorites.includes(recipeId)}}));
    },
    addToPlan: async entry => update(await api('plan', {method: 'POST', body: entry})),
    removeFromPlan: async id => update(await api('plan/' + id, {method: 'DELETE'})),
    markShopping: async (key, state) => update(await api('shopping', {method: 'POST', body: {key, state}})),
  };
  async function signOut() {
    await api('signout', {method: 'POST', body: {}});
    setMe(null);
    navigate('/');
  }

  const {path, search, hash} = location;
  let page;
  if (path === '/') page = <Home/>;
  else if (path === '/recipes') page = <Recipes key={search.toString()} search={search}/>;
  else if (path.startsWith('/recipes/')) page = <RecipePage id={path.slice(9)} hash={hash}/>;
  else if (path === '/characters') page = <Characters hash={hash}/>;
  else if (path === '/story') page = <Story hash={hash}/>;
  else if (path === '/kitchen') page = <Kitchen hash={hash}/>;
  else if (path === '/signin') page = <SignIn search={search}/>;
  else if (path === '/studio') page = <Studio/>;
  else page = <NotFound/>;

  return <AppContext.Provider value={context}>
    <a className="skip" href="#main">Skip to content</a>
    <header className="site-header">
      <Logo/>
      <nav id="site-nav" className={menu ? 'open' : ''} aria-label="Main">
        {NAV.map(([to, label]) => <Link key={to} to={to} aria-current={path === to || path.startsWith(to + '/') ? 'page' : undefined}>{label}</Link>)}
        {me ? <>{me.user.isAdmin && <Link to="/studio">Studio</Link>}<button type="button" className="quiet" onClick={signOut}>Sign out</button></>
          : <Link to="/signin" className="btn small">Sign in</Link>}
      </nav>
      <button type="button" className="icon menu-toggle" aria-label={menu ? 'Close menu' : 'Open menu'} aria-expanded={menu} aria-controls="site-nav"
        onClick={() => setMenu(!menu)}>{menu ? <X/> : <Menu/>}</button>
    </header>
    <main id="main">{page}</main>
    <footer className="site-footer">
      <Logo/>
      <p>{catalog.site.brand.tagline}</p>
      <p className="micro">Luna, Simba, Nico and Milo are fictional characters. The recipes are for real kitchens; always check ingredient labels for allergens.</p>
      <p className="micro">{catalog.site.brand.footer}</p>
    </footer>
  </AppContext.Provider>;
}

createRoot(document.getElementById('root')).render(<App/>);
