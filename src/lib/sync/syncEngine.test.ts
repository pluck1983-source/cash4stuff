import { describe, expect, it } from 'vitest';
import { decideSync, hashState, mergeStates } from './syncEngine';
import { emptyState } from '../storage';
import type { AppState, Pickup } from '../types';

function pickup(id: string, updatedAt: string, reference = id): Pickup {
  return { id, date: '2026-03-01', reference, weightKg: 1, costOverride: null, notes: '', createdAt: updatedAt, updatedAt };
}

function withPickups(pickups: Pickup[], over: Partial<AppState> = {}): AppState {
  return { ...emptyState(), pickups, ...over };
}

describe('mergeStates', () => {
  it('keeps records added on either device', () => {
    const merged = mergeStates(withPickups([pickup('a', '2026-01-01')]), withPickups([pickup('b', '2026-01-02')]));
    expect(merged.pickups.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('takes the newer edit of the same record', () => {
    const local = withPickups([pickup('a', '2026-01-02', 'local edit')]);
    const remote = withPickups([pickup('a', '2026-01-03', 'remote edit')]);
    expect(mergeStates(local, remote).pickups[0].reference).toBe('remote edit');
    expect(mergeStates(remote, local).pickups[0].reference).toBe('remote edit');
  });

  it("doesn't resurrect a record deleted on the other device", () => {
    const local = withPickups([pickup('a', '2026-01-01')]);
    const remote = withPickups([], { tombstones: { a: '2026-01-05' } });
    const merged = mergeStates(local, remote);
    expect(merged.pickups).toEqual([]);
    expect(merged.tombstones).toEqual({ a: '2026-01-05' });
  });

  it('keeps a record edited after it was deleted elsewhere', () => {
    const local = withPickups([pickup('a', '2026-01-06')]);
    const remote = withPickups([], { tombstones: { a: '2026-01-05' } });
    expect(mergeStates(local, remote).pickups.map((p) => p.id)).toEqual(['a']);
  });

  it('takes the newer settings and unions deleted photos', () => {
    const local = { ...emptyState(), settingsUpdatedAt: '2026-01-01', deletedPhotoIds: ['x'] };
    const remote = { ...emptyState(), settings: { ...emptyState().settings, costPerKg: 1.5 }, settingsUpdatedAt: '2026-01-02', deletedPhotoIds: ['y', 'x'] };
    const merged = mergeStates(local, remote);
    expect(merged.settings.costPerKg).toBe(1.5);
    expect(merged.deletedPhotoIds.sort()).toEqual(['x', 'y']);
  });

  it('is stable - merging the same copies twice changes nothing', () => {
    const a = withPickups([pickup('a', '2026-01-01')]);
    const b = withPickups([pickup('b', '2026-01-02')]);
    const once = mergeStates(a, b);
    expect(hashState(mergeStates(once, b))).toBe(hashState(once));
  });
});

describe('decideSync', () => {
  const base = { localHash: 'h1', remoteVersion: '5', syncedHash: 'h1', syncedRemoteVersion: '5' };
  it('pushes when there is no cloud copy yet', () => {
    expect(decideSync({ ...base, remoteVersion: null })).toBe('push');
  });
  it('merges on first connect of a device, or when the cloud changed', () => {
    expect(decideSync({ ...base, syncedHash: null, syncedRemoteVersion: null })).toBe('merge');
    expect(decideSync({ ...base, remoteVersion: '6' })).toBe('merge');
    expect(decideSync({ ...base, remoteVersion: '6', localHash: 'h2' })).toBe('merge');
  });
  it('pushes local-only changes and otherwise does nothing', () => {
    expect(decideSync({ ...base, localHash: 'h2' })).toBe('push');
    expect(decideSync(base)).toBe('none');
  });
});
