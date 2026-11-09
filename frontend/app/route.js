import { useEffect, useState } from 'react';
// Hash routes: #overview, #alerts/A-123, #inventory/D-1. The global house
// context lives in the query string (?house=H001) so links are shareable.
const parse = () => {
  const [view, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { view: view || 'overview', arg: rest.length ? decodeURIComponent(rest.join('/')) : '' };
};
export function useRoute() {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (view, arg = '') => { location.hash = arg ? `${view}/${encodeURIComponent(arg)}` : view; };
  return [route, go];
}
export function useHouseParam() {
  const [house, set] = useState(() => new URLSearchParams(location.search).get('house') || '');
  const setHouse = id => {
    set(id);
    const q = new URLSearchParams(location.search);
    id ? q.set('house', id) : q.delete('house');
    history.replaceState(null, '', `${location.pathname}${q.size ? '?' + q : ''}${location.hash}`);
  };
  return [house, setHouse];
}
