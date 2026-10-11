import { useEffect, useRef, useState, type ReactNode } from 'react';
import { routeHref } from '../lib/router';

export type Section = 'dashboard' | 'pickups' | 'add' | 'stock' | 'money' | 'finance' | 'admin' | 'settings';

export const NAV: { section: Section; label: string; href: string; icon: ReactNode }[] = [
  { section: 'dashboard', label: 'Home', href: routeHref({ name: 'dashboard' }), icon: <path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z" /> },
  { section: 'pickups', label: 'Pickups', href: routeHref({ name: 'pickups' }), icon: <path d="M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01" /> },
  { section: 'add', label: 'Add', href: routeHref({ name: 'add-item', pickupId: null }), icon: <path d="M12 5v14M5 12h14" /> },
  { section: 'stock', label: 'Stock', href: routeHref({ name: 'stock' }), icon: <path d="M4 7h16M4 12h16M4 17h16M8 4v16" /> },
  { section: 'money', label: 'Costs', href: routeHref({ name: 'money' }), icon: <path d="M17 6.5A5 5 0 0 0 8 9v8M6 13h7M6 17h11" /> },
  { section: 'finance', label: 'Finance', href: routeHref({ name: 'finance' }), icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> },
  { section: 'admin', label: 'Admin', href: routeHref({ name: 'admin' }), icon: <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M8 10v4M16 16v4" /> },
  { section: 'settings', label: 'Settings', href: routeHref({ name: 'settings' }), icon: <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM19 12l2-1-1-3-2 .3-1.4-1.4L17 5l-3-1-1 2h-2L10 4 7 5l.4 2-1.5 1.4L4 8l-1 3 2 1v0l-2 1 1 3 2-.3 1.4 1.4L7 19l3 1 1-2h2l1 2 3-1-.4-2 1.5-1.4 1.9.4 1-3-2-1Z" /> },
];

export function NavIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

/** Tabs that can go in the bottom bar - Settings stays on the gear in the header */
export const TAB_SECTIONS: Section[] = NAV.map((n) => n.section).filter((s) => s !== 'settings');

type Tab = (typeof NAV)[number];

/**
 * Phone tab bar. Five tabs fit; the rest are a swipe away, with a fade and
 * arrow on the side that has more so they're never hidden by surprise.
 * The order is set in Settings.
 */
export function BottomTabs({ tabs, section }: { tabs: Tab[]; section: Section }) {
  const bar = useRef<HTMLElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ left: false, right: false });

  function measure() {
    const el = strip.current;
    if (el) setMore({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  }

  useEffect(() => {
    // Keep the open tab in view, e.g. after following a link to a tab that's off to the side.
    strip.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    measure();
  }, [section, tabs.length]);

  // Publish the bar's real height (home-indicator inset included) so pinned
  // buttons and the page's bottom padding sit above it, not behind it.
  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const root = document.documentElement.style;
    const publish = () => root.setProperty('--tabs-h', `${el.offsetHeight}px`);
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.removeProperty('--tabs-h');
    };
  }, []);

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const scrollBy = (dir: 1 | -1) => strip.current?.scrollBy({ left: dir * (strip.current.clientWidth * 0.6), behavior: 'smooth' });

  return (
    <nav ref={bar} className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" aria-label="Tabs">
      <div ref={strip} onScroll={measure} className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto">
        {tabs.map((n) => {
          const active = section === n.section;
          return (
            <a
              key={n.section}
              href={n.href}
              aria-current={active ? 'page' : undefined}
              className={`flex w-1/5 shrink-0 snap-start flex-col items-center gap-0.5 py-2 text-[11px] ${
                active || n.section === 'add' ? 'text-brand-700 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {n.section === 'add' ? (
                <span className="flex h-6 w-10 items-center justify-center rounded-full bg-brand-600 text-white shadow">
                  <NavIcon>{n.icon}</NavIcon>
                </span>
              ) : (
                <NavIcon>{n.icon}</NavIcon>
              )}
              <span className={active ? 'font-semibold' : ''}>{n.label}</span>
            </a>
          );
        })}
      </div>
      {more.left && (
        <button
          type="button"
          aria-label="More tabs to the left"
          onClick={() => scrollBy(-1)}
          className="absolute inset-y-0 left-0 flex w-7 items-center justify-start bg-gradient-to-r from-white via-white/80 to-transparent pl-0.5 text-lg text-brand-600 dark:from-slate-900 dark:via-slate-900/80"
        >
          ‹
        </button>
      )}
      {more.right && (
        <button
          type="button"
          aria-label="More tabs to the right"
          onClick={() => scrollBy(1)}
          className="absolute inset-y-0 right-0 flex w-7 items-center justify-end bg-gradient-to-l from-white via-white/80 to-transparent pr-0.5 text-lg text-brand-600 dark:from-slate-900 dark:via-slate-900/80"
        >
          ›
        </button>
      )}
    </nav>
  );
}
