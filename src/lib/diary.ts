import type { Booking } from './types';

/** Opens Google Maps (the app on a phone, if installed) with directions to the address */
export function mapsUrl(address: string, postcode: string): string | null {
  const where = [address.replace(/\s*\n\s*/g, ', ').trim(), postcode.trim()].filter(Boolean).join(', ');
  return where ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(where)}&travelmode=driving` : null;
}

/** tel: or mailto: for a contact, so it can be tapped; null when it's neither */
export function contactHref(contact: string): string | null {
  const c = contact.trim();
  if (/^\S+@\S+\.\S+$/.test(c)) return `mailto:${c}`;
  const digits = c.replace(/[\s()-]/g, '');
  if (/^\+?\d{7,15}$/.test(digits)) return `tel:${digits}`;
  return null;
}

/** Upcoming bookings soonest first (today included), then everything else newest first */
export function splitBookings(bookings: Booking[], today: string): { upcoming: Booking[]; past: Booking[] } {
  const key = (b: Booking) => b.date + (b.time || '99:99');
  const upcoming = bookings.filter((b) => b.status === 'booked' && b.date >= today).sort((a, b) => key(a).localeCompare(key(b)));
  const past = bookings.filter((b) => !upcoming.includes(b)).sort((a, b) => key(b).localeCompare(key(a)));
  return { upcoming, past };
}
