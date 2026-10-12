import { useSyncExternalStore } from 'react';

/**
 * Mileage for a booked pickup, from the phone's GPS. The phone only reports
 * its position while the app is open on screen, so the screen is kept awake
 * during a trip. If the app is put away the trip carries on from the next
 * position it gets, counting the gap as a straight line - so miles can come
 * out low, never high. Kept on this device only until the trip is ended.
 */

export interface Fix {
  lat: number;
  lon: number;
  /** metres */
  accuracy: number;
  /** ms since epoch */
  at: number;
}

export interface Trip {
  bookingId: string;
  /** Who it's for, shown while it runs */
  label: string;
  startedAt: string;
  metres: number;
  start: Fix | null;
  last: Fix | null;
  /** Furthest it has been from the start, in metres */
  furthest: number;
  /** Has gone out and come back near where it started */
  backHome: boolean;
}

const KEY = 'cash4stuff-trip';
const EVENT = 'cash4stuff-trip-change';
const WORST_ACCURACY = 50;
const MIN_STEP = 20;
/** ~135 mph: anything faster is a GPS jump, not driving */
const MAX_SPEED = 60;
const AWAY = 1000;
const HOME_RADIUS = 250;

export function metresBetween(a: Pick<Fix, 'lat' | 'lon'>, b: Pick<Fix, 'lat' | 'lon'>): number {
  const r = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

export function tripMiles(trip: Pick<Trip, 'metres'>): number {
  return Math.round((trip.metres / 1609.344) * 10) / 10;
}

/** Adds one GPS reading to the trip, ignoring vague readings, jitter and jumps */
export function addFix(trip: Trip, fix: Fix): Trip {
  if (fix.accuracy > WORST_ACCURACY) return trip;
  if (!trip.start || !trip.last) return { ...trip, start: trip.start ?? fix, last: fix };
  const step = metresBetween(trip.last, fix);
  if (step < Math.max(MIN_STEP, fix.accuracy)) return trip;
  const seconds = (fix.at - trip.last.at) / 1000;
  if (seconds > 0 && step / seconds > MAX_SPEED) return trip;
  const fromStart = metresBetween(trip.start, fix);
  const furthest = Math.max(trip.furthest, fromStart);
  return { ...trip, metres: trip.metres + step, last: fix, furthest, backHome: trip.backHome || (furthest > AWAY && fromStart < HOME_RADIUS) };
}

export function newTrip(bookingId: string, label: string, now = new Date()): Trip {
  return { bookingId, label, startedAt: now.toISOString(), metres: 0, start: null, last: null, furthest: 0, backHome: false };
}

let cachedRaw: string | null = null;
let cachedTrip: Trip | null = null;

export function readTrip(): Trip | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      cachedTrip = raw ? (JSON.parse(raw) as Trip) : null;
    } catch {
      cachedTrip = null;
    }
  }
  return cachedTrip;
}

export function writeTrip(trip: Trip | null) {
  try {
    if (trip) localStorage.setItem(KEY, JSON.stringify(trip));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage full or blocked - the trip still runs for this session.
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

export function useTrip(): Trip | null {
  return useSyncExternalStore(subscribe, readTrip, () => null);
}

/** A notification that opens the app at the Diary when tapped (needs permission; home-screen app on iPhone) */
export async function notify(title: string, body: string) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    const options = { body, tag: 'cash4stuff-trip', data: { url: `${location.pathname}#/diary` }, icon: 'icons/icon-192.png' };
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
  } catch {
    // Notifications are a nicety; the in-app bar always shows.
  }
}

export async function clearNotification() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const list = (await reg?.getNotifications({ tag: 'cash4stuff-trip' })) ?? [];
    list.forEach((n) => n.close());
  } catch {
    // Nothing to clear.
  }
}

export async function askNotificationPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  } catch {
    // Older browsers: no notifications, the in-app bar still works.
  }
}
