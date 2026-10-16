import React, {createContext, useContext} from 'react';
import {Clock, Users, Heart} from 'lucide-react';
import {Link} from './router.jsx';

export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

// The cast sheet is a 2 x 2 grid: Luna, Simba / Nico, Milo.
const PORTRAIT = {luna: '0% 0%', simba: '100% 0%', nico: '0% 100%', milo: '100% 100%'};

export function Portrait({character, image, size = 'md'}) {
  return <span className={'portrait portrait-' + size} role="img" aria-label={`${character.name}, ${character.role}`}
    style={{backgroundImage: `url(${image})`, backgroundPosition: PORTRAIT[character.id]}}/>;
}

export function Logo() {
  return <Link to="/" className="logo" aria-label="Whisker & Heat home">Whisker <span className="amp">&amp;</span> <span className="heat">Heat</span></Link>;
}

export function Meta({recipe}) {
  return <span className="meta">
    <span><Users size={14} aria-hidden="true"/> Serves {recipe.servings}</span>
    <span><Clock size={14} aria-hidden="true"/> {recipe.minutes} min</span>
  </span>;
}

const TINTS = ['#ac3e1b', '#666843', '#7a3b44', '#b77938', '#4f5d4a', '#8a5a3c'];

export function RecipeImage({recipe, className = ''}) {
  if (recipe.image) return <img className={'recipe-photo ' + className} src={recipe.image} alt={recipe.title} loading="lazy"/>;
  const tint = TINTS[[...recipe.id].reduce((n, c) => n + c.charCodeAt(0), 0) % TINTS.length];
  return <div className={'recipe-photo recipe-plate ' + className} style={{'--tint': tint}} aria-hidden="true">
    <span>{recipe.title}</span>
  </div>;
}

export function SaveButton({recipe}) {
  const {me, toggleFavorite} = useApp();
  const saved = me?.favorites?.includes(recipe.id);
  return <button type="button" className={'save' + (saved ? ' is-saved' : '')} aria-pressed={!!saved}
    aria-label={(saved ? 'Remove ' : 'Save ') + recipe.title} onClick={() => toggleFavorite(recipe.id)}>
    <Heart size={18} fill={saved ? 'currentColor' : 'none'} aria-hidden="true"/>
  </button>;
}

export function RecipeCard({recipe}) {
  return <article className="recipe-card">
    <div className="recipe-card-image">
      <Link to={'/recipes/' + recipe.id} tabIndex={-1} aria-hidden="true"><RecipeImage recipe={recipe}/></Link>
      <SaveButton recipe={recipe}/>
    </div>
    <div className="recipe-card-body">
      <Meta recipe={recipe}/>
      <h3><Link to={'/recipes/' + recipe.id}>{recipe.title}</Link></h3>
    </div>
  </article>;
}

export function Notice({children, tone = 'info'}) {
  return <p className={'notice notice-' + tone} role={tone === 'error' ? 'alert' : 'status'}>{children}</p>;
}
