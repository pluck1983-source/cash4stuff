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
  | { name: 'add-photos'; pickupId: string | null }
  | { name: 'stock' }
  | { name: 'item'; id: string }
  | { name: 'money' }
  | { name: 'finance' }
  | { name: 'admin' }
  | { name: 'settings' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  switch (parts[0]) {
    case 'pickups':
      return parts[1] ? { name: 'pickup', id: parts[1] } : { name: 'pickups' };
    case 'add':
      return { name: 'add-item', pickupId: parts[1] ?? null };
    case 'add-photos':
      return { name: 'add-photos', pickupId: parts[1] ?? null };
    case 'stock':
      return parts[1] ? { name: 'item', id: parts[1] } : { name: 'stock' };
    case 'money':
      return { name: 'money' };
    case 'finance':
      return { name: 'finance' };
    case 'settings':
      return { name: 'settings' };
    case 'admin':
      return { name: 'admin' };
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
    case 'add-photos':
      return route.pickupId ? `#/add-photos/${encodeURIComponent(route.pickupId)}` : '#/add-photos';
    case 'stock':
      return '#/stock';
    case 'item':
      return `#/stock/${encodeURIComponent(route.id)}`;
    case 'money':
      return '#/money';
    case 'finance':
      return '#/finance';
    case 'settings':
      return '#/settings';
    case 'admin':
      return '#/admin';
  }
}

export function navigate(route: Route, replace = false) {
  const href = routeHref(route);
  if (replace) {
    window.history.replaceState({ depth: Math.max(historyDepth(), 0) }, '', href);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = href;
  }
}

/**
 * How many pages into the app this history entry is (0 = the page it opened
 * on), so Back is only used when it stays inside the app.
 */
function historyDepth(): number {
  const depth = (window.history.state as { depth?: unknown } | null)?.depth;
  return typeof depth === 'number' ? depth : -1;
}
let lastDepth = 0;

/** Back to the page the user came from, or to `fallback` when Back would leave the app */
export function goBack(fallback: Route) {
  if (historyDepth() > 0) window.history.back();
  else navigate(fallback, true);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    if (historyDepth() < 0) window.history.replaceState({ depth: 0 }, '');
    lastDepth = historyDepth();
    const onChange = () => {
      // A new page has no depth yet; going Back returns to an entry that has one.
      if (historyDepth() < 0) window.history.replaceState({ depth: lastDepth + 1 }, '');
      lastDepth = historyDepth();
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
