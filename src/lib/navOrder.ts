import { useSyncExternalStore } from 'react';

/**
 * The order of the bottom tabs, chosen per device (a phone and a laptop may
 * want different tabs up front). Unknown or missing sections fall back to
 * the default order, so new tabs always appear.
 */

const KEY = 'cash4stuff-nav-order';
const EVENT = 'cash4stuff-nav-order';

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function orderSections<T extends string>(defaults: T[], saved: string): T[] {
  const wanted = saved.split(',').filter((s): s is T => (defaults as string[]).includes(s));
  return [...new Set([...wanted, ...defaults])];
}

export function saveNavOrder(order: string[] | null) {
  try {
    if (order) localStorage.setItem(KEY, order.join(','));
    else localStorage.removeItem(KEY);
  } catch {
    // Not remembered - the default order still works.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useNavOrder<T extends string>(defaults: T[]): T[] {
  const saved = useSyncExternalStore(subscribe, read, () => '');
  return orderSections(defaults, saved);
}
