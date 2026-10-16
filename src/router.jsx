import React, {useEffect, useState} from 'react';

const listeners = new Set();

export function navigate(to) {
  if (to === location.pathname + location.search + location.hash) return;
  history.pushState(null, '', to);
  listeners.forEach(fn => fn());
  if (!to.includes('#')) window.scrollTo(0, 0);
}

export function useLocation() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const update = () => setTick(t => t + 1);
    listeners.add(update);
    window.addEventListener('popstate', update);
    window.addEventListener('hashchange', update);
    return () => { listeners.delete(update); window.removeEventListener('popstate', update); window.removeEventListener('hashchange', update); };
  }, []);
  return {path: location.pathname.replace(/\/+$/, '') || '/', search: new URLSearchParams(location.search), hash: location.hash.slice(1)};
}

export function Link({to, children, onClick, ...props}) {
  return <a href={to} {...props} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(to);
  }}>{children}</a>;
}
