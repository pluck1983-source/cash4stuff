import { describe, expect, it } from 'vitest';
import { contactHref, mapsUrl, splitBookings } from './diary';
import { addFix, newTrip, tripMiles } from './trip';
import type { Booking } from './types';

describe('diary links', () => {
  it('builds Google Maps directions from the address and postcode', () => {
    expect(mapsUrl('12 High Street\nLeeds', 'LS1 4AB')).toBe('https://www.google.com/maps/dir/?api=1&destination=12%20High%20Street%2C%20Leeds%2C%20LS1%204AB&travelmode=driving');
    expect(mapsUrl('', '')).toBeNull();
  });
  it('makes phone numbers and emails tappable', () => {
    expect(contactHref('07700 900123')).toBe('tel:07700900123');
    expect(contactHref('sam@example.com')).toBe('mailto:sam@example.com');
    expect(contactHref('ring after 5')).toBeNull();
  });
});

describe('splitBookings', () => {
  const b = (id: string, date: string, status: Booking['status'] = 'booked', time = ''): Booking => ({
    id, date, time, status, name: id, address: '', postcode: '', contact: '', notes: '', pickupId: null, miles: null, createdAt: '', updatedAt: '',
  });
  it('lists upcoming soonest first, and done, cancelled or missed ones after', () => {
    const { upcoming, past } = splitBookings([b('late', '2026-10-14'), b('done', '2026-10-13', 'done'), b('soon', '2026-10-12', 'booked', '10:00'), b('missed', '2026-10-01')], '2026-10-12');
    expect(upcoming.map((x) => x.id)).toEqual(['soon', 'late']);
    expect(past.map((x) => x.id)).toEqual(['done', 'missed']);
  });
});

describe('trip tracker', () => {
  // ~0.0009 degrees of latitude is ~100 m.
  const at = (lat: number, s: number, accuracy = 10) => ({ lat, lon: -1.55, accuracy, at: s * 1000 });

  it('adds up the distance driven', () => {
    let t = newTrip('b1', 'Sarah');
    for (let i = 0; i <= 20; i++) t = addFix(t, at(53.8 + i * 0.0009, i * 10));
    expect(tripMiles(t)).toBeCloseTo(1.2, 1);
  });
  it('ignores vague readings, jitter and jumps', () => {
    let t = addFix(newTrip('b1', 'Sarah'), at(53.8, 0));
    t = addFix(t, at(53.8001, 5)); // ~11 m of jitter
    t = addFix(t, at(53.81, 10, 200)); // too vague
    t = addFix(t, at(53.9, 11)); // 11 km in a second
    expect(t.metres).toBe(0);
  });
  it('notices coming back to where the trip started', () => {
    let t = addFix(newTrip('b1', 'Sarah'), at(53.8, 0));
    t = addFix(t, at(53.82, 600));
    expect(t.backHome).toBe(false);
    t = addFix(t, at(53.8005, 1200));
    expect(t.backHome).toBe(true);
  });
});
