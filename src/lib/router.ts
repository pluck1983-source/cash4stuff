import { useEffect, useState } from 'react';

/**
 * Minimal hash router (#/stock, #/pickups/<id>...) so the phone's back
 * button and browser history work, with no server-side routing needed on
 * GitHub Pages.
 */
export type Route =
  | { name: 'dashboard' }
  | { name: 'pickups' }
  | { name: 'pickup'; id: string }
  | { name: 'add-item'; pickupId: string | null }
  | { name: 'stock' }
  | { name: 'item'; id: string }
  | { name: 'money' }
  | { name: 'settings' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  switch (parts[0]) {
    case 'pickups':
      return parts[1] ? { name: 'pickup', id: parts[1] } : { name: 'pickups' };
    case 'add':
      return { name: 'add-item', pickupId: parts[1] ?? null };
    case 'stock':
      return parts[1] ? { name: 'item', id: parts[1] } : { name: 'stock' };
    case 'money':
      return { name: 'money' };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'dashboard' };
  }
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case 'dashboard':
      return '#/';
    case 'pickups':
      return '#/pickups';
    case 'pickup':
      return `#/pickups/${encodeURIComponent(route.id)}`;
    case 'add-item':
      return route.pickupId ? `#/add/${encodeURIComponent(route.pickupId)}` : '#/add';
    case 'stock':
      return '#/stock';
    case 'item':
      return `#/stock/${encodeURIComponent(route.id)}`;
    case 'money':
      return '#/money';
    case 'settings':
      return '#/settings';
  }
}

export function navigate(route: Route, replace = false) {
  const href = routeHref(route);
  if (replace) {
    window.history.replaceState(null, '', href);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = href;
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

export function useIsDesktop(): boolean {
  const query = '(min-width: 1024px)';
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return matches;
}
