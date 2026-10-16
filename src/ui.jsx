import React, {createContext, useContext, useState} from 'react';
import {Clock, Users, Heart, Gauge} from 'lucide-react';
import {Link} from './router.jsx';

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

// The cast sheet is a 2 x 2 grid: Luna, Simba / Nico, Milo.
const PORTRAIT = {luna: '0% 0%', simba: '100% 0%', nico: '0% 100%', milo: '100% 100%'};

export function Portrait({character, image, size = 'md'}) {
  return <span className={'portrait portrait-' + size} role="img" aria-label={`${character.name}, ${character.role}`}
    style={{backgroundImage: `url(${image})`, backgroundPosition: PORTRAIT[character.id]}}><span>{character.name[0]}</span></span>;
}

export function Logo() {
  return <Link to="/" className="logo" aria-label="Whisker & Heat home">Whisker <span className="amp">&amp;</span> <span className="heat">Heat</span></Link>;
}

export function Meta({recipe, difficulty = true}) {
  return <span className="meta">
    <span><Clock size={14} aria-hidden="true"/> {recipe.totalMinutes} min</span>
    <span><Users size={14} aria-hidden="true"/> Serves {recipe.servings}</span>
    {difficulty && <span><Gauge size={14} aria-hidden="true"/> {recipe.difficulty}</span>}
  </span>;
}

const TINTS = ['#ac3e1b', '#666843', '#7a3b44', '#9a6430', '#4f5d4a', '#8a5a3c'];

// A photo when there is one; a warm titled plate when there is not, or when the photo fails to load.
export function RecipeImage({recipe, className = ''}) {
  const [failed, setFailed] = useState(false);
  if (recipe.image && !failed) return <img className={'recipe-photo ' + className} src={recipe.image} alt={recipe.title} loading="lazy" onError={() => setFailed(true)}/>;
  const tint = TINTS[[...recipe.id].reduce((n, c) => n + c.charCodeAt(0), 0) % TINTS.length];
  return <div className={'recipe-photo recipe-plate ' + className} style={{'--tint': tint}} role="img" aria-label={recipe.title}>
    <span aria-hidden="true">{recipe.title}</span>
  </div>;
}

export function SaveButton({recipe, label = false}) {
  const {kitchen, toggleFavorite} = useApp();
  const [error, setError] = useState('');
  const saved = kitchen.favorites.includes(recipe.id);
  return <>
    <button type="button" className={'save' + (saved ? ' is-saved' : '') + (label ? ' save-label' : '')} aria-pressed={saved}
      aria-label={label ? undefined : (saved ? 'Remove ' : 'Save ') + recipe.title}
      onClick={() => toggleFavorite(recipe.id).then(() => setError(''), e => setError(e.message))}>
      <Heart size={18} fill={saved ? 'currentColor' : 'none'} aria-hidden="true"/>{label && (saved ? ' Saved' : ' Save')}
    </button>
    {error && <Notice tone="error">{error}</Notice>}
  </>;
}

export function RecipeCard({recipe}) {
  return <article className="recipe-card">
    <div className="recipe-card-image">
      <Link to={'/recipes/' + recipe.id} tabIndex={-1} aria-hidden="true"><RecipeImage recipe={recipe}/></Link>
      <SaveButton recipe={recipe}/>
    </div>
    <div className="recipe-card-body">
      <h3><Link to={'/recipes/' + recipe.id}>{recipe.title}</Link></h3>
      <Meta recipe={recipe}/>
      <span className="tags">{recipe.categories.map(c => <span key={c} className="tag">{c}</span>)}</span>
    </div>
  </article>;
}

export function Notice({children, tone = 'info'}) {
  return <p className={'notice notice-' + tone} role={tone === 'error' ? 'alert' : 'status'}>{children}</p>;
}

export function Empty({title, children, action}) {
  return <div className="empty"><h3>{title}</h3><p className="section-text">{children}</p>{action}</div>;
}
