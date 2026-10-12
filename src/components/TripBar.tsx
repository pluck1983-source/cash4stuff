import { useEffect, useRef, useState } from 'react';
import type { AppActions } from '../lib/useAppState';
import { addFix, clearNotification, notify, readTrip, tripMiles, useTrip, writeTrip } from '../lib/trip';
import { routeHref } from '../lib/router';

/**
 * Shown on every page while a Diary trip is running: follows the GPS, keeps
 * the screen awake so the phone keeps reporting it, and ends the trip.
 */
export function TripBar({ actions }: { actions: AppActions }) {
  const trip = useTrip();
  const running = trip !== null;
  const [gpsError, setGpsError] = useState<string | null>(null);
  const wasHome = useRef(trip?.backHome ?? false);

  useEffect(() => {
    if (!running) return;
    if (!('geolocation' in navigator)) {
      setGpsError("This phone isn't giving the app its location.");
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsError(null);
        const current = readTrip();
        if (!current) return;
        const next = addFix(current, { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy, at: pos.timestamp });
        if (next !== current) writeTrip(next);
      },
      (err) => setGpsError(err.code === err.PERMISSION_DENIED ? 'Location is off for this app - allow it in Settings to track miles.' : 'Waiting for GPS…'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );

    // Keep the screen on: the phone stops sending positions once it locks.
    let lock: WakeLockSentinel | null = null;
    const keepAwake = async () => {
      try {
        if (document.visibilityState === 'visible' && 'wakeLock' in navigator) lock = await navigator.wakeLock.request('screen');
      } catch {
        // Not supported or refused - tracking still works while the screen is on.
      }
    };
    void keepAwake();
    document.addEventListener('visibilitychange', keepAwake);
    return () => {
      navigator.geolocation.clearWatch(watch);
      document.removeEventListener('visibilitychange', keepAwake);
      void lock?.release();
    };
  }, [running]);

  // Arriving back where the trip started: nudge to end it.
  useEffect(() => {
    if (trip?.backHome && !wasHome.current) void notify('Back home?', `Tap to end the pickup and save ${tripMiles(trip)} miles.`);
    wasHome.current = trip?.backHome ?? false;
  }, [trip]);

  if (!trip) return null;
  const miles = tripMiles(trip);

  function end() {
    if (!trip) return;
    const typed = window.prompt('End pickup and save the miles. Correct them here if the tracker missed some:', String(miles));
    if (typed === null) return;
    const value = Number(typed.replace(/[^\d.]/g, ''));
    actions.setBookingMiles(trip.bookingId, Number.isFinite(value) ? Math.round(value * 10) / 10 : miles);
    writeTrip(null);
    void clearNotification();
  }

  return (
    <div
      role="status"
      className={`flex items-center gap-3 px-4 py-2 text-sm lg:rounded-lg ${
        trip.backHome ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
      }`}
    >
      <a href={routeHref({ name: 'diary' })} className="min-w-0 flex-1">
        <span className="block truncate font-medium">
          {trip.backHome ? 'Back home? ' : 'Trip running: '}
          {trip.label}
        </span>
        <span className="block text-xs opacity-80">{gpsError ?? `${miles} miles so far · keep the app open`}</span>
      </a>
      <button type="button" onClick={end} className="shrink-0 rounded-lg bg-white px-3 py-1.5 font-semibold text-slate-900 dark:bg-slate-900 dark:text-white">
        End pickup
      </button>
    </div>
  );
}
