import type { AppState } from '../types';

/**
 * Pure sync logic, kept free of browser/provider code so it can be tested on
 * its own.
 *
 * Unlike a single-document app, several devices here add records at the same
 * time (a phone logging stock in the garage while the desktop is open), so
 * instead of asking which whole copy wins, the two copies are merged record
 * by record: every record carries an updatedAt, the newer edit of a record
 * wins, and deletions leave a tombstone so they aren't undone by a device
 * that still has the old record.
 */

interface Versioned {
  id: string;
  updatedAt: string;
}

function mergeList<T extends Versioned>(a: T[], b: T[], tombstones: Record<string, string>): T[] {
  const byId = new Map<string, T>();
  for (const record of [...a, ...b]) {
    const existing = byId.get(record.id);
    if (!existing || record.updatedAt > existing.updatedAt) byId.set(record.id, record);
  }
  // A record edited after it was deleted elsewhere survives (the later action wins).
  const merged = [...byId.values()].filter((r) => !tombstones[r.id] || r.updatedAt > tombstones[r.id]);
  // Keep a stable order: local order first, then anything new from the other copy.
  const order = new Map<string, number>();
  [...a, ...b].forEach((r, i) => {
    if (!order.has(r.id)) order.set(r.id, i);
  });
  return merged.sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));
}

export function mergeStates(local: AppState, remote: AppState): AppState {
  const tombstones: Record<string, string> = { ...remote.tombstones };
  for (const [id, at] of Object.entries(local.tombstones)) {
    if (!tombstones[id] || at > tombstones[id]) tombstones[id] = at;
  }
  const remoteSettingsNewer = remote.settingsUpdatedAt > local.settingsUpdatedAt;
  return {
    version: 1,
    settings: remoteSettingsNewer ? remote.settings : local.settings,
    settingsUpdatedAt: remoteSettingsNewer ? remote.settingsUpdatedAt : local.settingsUpdatedAt,
    pickups: mergeList(local.pickups, remote.pickups, tombstones),
    items: mergeList(local.items, remote.items, tombstones),
    expenses: mergeList(local.expenses, remote.expenses, tombstones),
    otherIncome: mergeList(local.otherIncome, remote.otherIncome, tombstones),
    tombstones,
    deletedPhotoIds: [...new Set([...local.deletedPhotoIds, ...remote.deletedPhotoIds])],
  };
}

/** Fingerprint used to tell whether data changed. Not for security. */
export function hashState(state: AppState): string {
  const text = JSON.stringify(state);
  // 53-bit string hash (cyrb53).
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${text.length}:${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}

export type SyncAction = 'none' | 'push' | 'merge';

export interface SyncDecisionInput {
  localHash: string;
  remoteVersion: string | null;
  /** Null when this device has never synced with the current cloud file */
  syncedHash: string | null;
  syncedRemoteVersion: string | null;
}

/**
 * push: only this device changed (or there's no cloud copy yet) - upload.
 * merge: the cloud copy changed since this device last saw it - download,
 *   merge, and upload the result if it differs from the cloud copy.
 */
export function decideSync(input: SyncDecisionInput): SyncAction {
  if (input.remoteVersion === null) return 'push';
  if (input.syncedRemoteVersion === null || input.remoteVersion !== input.syncedRemoteVersion) return 'merge';
  if (input.localHash !== input.syncedHash) return 'push';
  return 'none';
}
