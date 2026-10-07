import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState } from '../types';
import { exportStateAsJson, importStateFromJson } from '../storage';
import { getPhoto, markPhotoSynced, setRemotePhotoFetcher, unsyncedPhotoIds } from '../photos';
import { AuthRequiredError, type CloudProvider, type RemoteFileMeta } from './types';
import { decideSync, hashState, mergeStates } from './syncEngine';
import { googleDriveProvider, takeSignInError } from './googleDrive';

export type SyncStatus =
  | 'unconfigured' // built without a client ID - sign-in and sync hidden, data stays on this device
  | 'off' // not signed in on this device
  | 'syncing'
  | 'synced'
  | 'reconnect' // was signed in, but the sign-in has lapsed and needs a click
  | 'error';

interface SyncMeta {
  providerId: string;
  syncedHash: string | null;
  syncedRemoteVersion: string | null;
  lastSyncedAt: string | null;
  accountEmail: string | null;
  /** Whose Drive the shared data file lives in */
  dataOwner: string | null;
  /** Photo ids whose cloud copy has already been removed */
  purgedPhotoIds: string[];
}

const META_KEY = 'cash4stuff-sync-v1';
const PUSH_DEBOUNCE_MS = 2000;

const provider: CloudProvider = googleDriveProvider;

export function isCloudConfigured(): boolean {
  return provider.isConfigured();
}

function readMeta(): SyncMeta | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    const parsed = raw ? (JSON.parse(raw) as SyncMeta) : null;
    if (parsed?.providerId !== provider.id) return null;
    return { ...parsed, accountEmail: parsed.accountEmail ?? null, dataOwner: parsed.dataOwner ?? null, purgedPhotoIds: parsed.purgedPhotoIds ?? [] };
  } catch {
    return null;
  }
}

function writeMeta(meta: SyncMeta | null) {
  if (meta) localStorage.setItem(META_KEY, JSON.stringify(meta));
  else localStorage.removeItem(META_KEY);
}

function updateMeta(patch: Partial<SyncMeta>) {
  const meta = readMeta();
  if (meta) writeMeta({ ...meta, ...patch });
}

export function useCloudSync(state: AppState, replaceState: (next: AppState) => void) {
  const [status, setStatus] = useState<SyncStatus>(() => {
    if (!provider.isConfigured()) return 'unconfigured';
    return readMeta() ? 'syncing' : 'off';
  });
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => readMeta()?.lastSyncedAt ?? null);
  const [accountEmail, setAccountEmail] = useState<string | null>(() => readMeta()?.accountEmail ?? null);
  const [dataOwner, setDataOwner] = useState<string | null>(() => readMeta()?.dataOwner ?? null);
  const [pendingPhotos, setPendingPhotos] = useState(0);
  const [error, setError] = useState<string | null>(() => takeSignInError());

  const stateRef = useRef(state);
  stateRef.current = state;
  const running = useRef(false);
  const rerun = useRef(false);
  /** Set once a silent sign-in fails, so background syncs stop retrying until the user clicks */
  const authLapsed = useRef(false);

  // Let photo thumbnails pull images taken on other devices straight from the cloud.
  useEffect(() => {
    if (status === 'unconfigured' || status === 'off') {
      setRemotePhotoFetcher(null);
      return;
    }
    setRemotePhotoFetcher((id) => (provider.hasToken() ? provider.downloadPhoto(id) : Promise.resolve(null)));
  }, [status]);

  const recordSynced = useCallback((hash: string, remote: RemoteFileMeta) => {
    const now = new Date().toISOString();
    updateMeta({ syncedHash: hash, syncedRemoteVersion: remote.version, lastSyncedAt: now });
    setLastSyncedAt(now);
  }, []);

  const syncPhotos = useCallback(async () => {
    const current = stateRef.current;
    const inUse = new Set(current.items.map((i) => i.photoId).filter((id): id is string => id !== null));
    const toUpload = (await unsyncedPhotoIds()).filter((id) => inUse.has(id));
    setPendingPhotos(toUpload.length);
    for (const id of toUpload) {
      const blob = await getPhoto(id);
      if (blob) await provider.uploadPhoto(id, blob);
      await markPhotoSynced(id);
      setPendingPhotos((n) => Math.max(0, n - 1));
    }
    const purged = new Set(readMeta()?.purgedPhotoIds ?? []);
    const toPurge = current.deletedPhotoIds.filter((id) => !purged.has(id) && !inUse.has(id));
    for (const id of toPurge) {
      await provider.deletePhoto(id);
      purged.add(id);
      updateMeta({ purgedPhotoIds: [...purged] });
    }
  }, []);

  const sync = useCallback(async () => {
    const meta = readMeta();
    if (!meta || authLapsed.current) return;
    if (running.current) {
      rerun.current = true;
      return;
    }
    running.current = true;
    setStatus('syncing');
    try {
      await provider.signIn(false);
      let email = meta.accountEmail;
      if (!email) {
        email = await provider.getAccountEmail();
        updateMeta({ accountEmail: email });
        setAccountEmail(email);
      }
      const remote = await provider.getMeta();
      if (!remote) {
        if (meta.syncedRemoteVersion !== null) {
          // Never silently start a second copy if the shared one has gone missing.
          throw new Error(
            `Can't find the Wardrobe to Wallet data in ${provider.label} any more - it may have been unshared or moved to the bin. Changes are kept on this device.`,
          );
        }
        const who = email ?? 'this Google account';
        const startNew = window.confirm(
          `No Wardrobe to Wallet data is in ${who}'s ${provider.label}, or shared with it.\n\n` +
            `OK - start a new Wardrobe to Wallet folder in this account's ${provider.label} (do this if you run the business).\n` +
            `Cancel - someone else keeps the data: ask them to share their Wardrobe to Wallet folder with ${who}, then sign in again.`,
        );
        if (!startNew) {
          writeMeta(null);
          setAccountEmail(null);
          setError(`Ask the business owner to share their Wardrobe to Wallet folder in Google Drive with ${who} (as Editor), then sign in again.`);
          setStatus('off');
          return;
        }
      } else if (remote.owner !== undefined && remote.owner !== meta.dataOwner) {
        updateMeta({ dataOwner: remote.owner });
        setDataOwner(remote.owner);
      }
      const local = stateRef.current;
      const action = decideSync({
        localHash: hashState(local),
        remoteVersion: remote?.version ?? null,
        syncedHash: meta.syncedHash,
        syncedRemoteVersion: meta.syncedRemoteVersion,
      });

      if (action === 'push') {
        const uploaded = await provider.upload(exportStateAsJson(local), remote);
        recordSynced(hashState(local), uploaded);
      } else if (action === 'merge' && remote) {
        const remoteState = importStateFromJson(await provider.download(remote));
        const merged = mergeStates(stateRef.current, remoteState);
        const mergedHash = hashState(merged);
        // Record before replacing state so the resulting change isn't seen as a local edit to push back.
        if (mergedHash !== hashState(remoteState)) {
          const uploaded = await provider.upload(exportStateAsJson(merged), remote);
          recordSynced(mergedHash, uploaded);
        } else {
          recordSynced(mergedHash, remote);
        }
        if (mergedHash !== hashState(stateRef.current)) replaceState(merged);
      }

      await syncPhotos();
      setError(null);
      setStatus('synced');
    } catch (e) {
      if (e instanceof AuthRequiredError) {
        if (meta.syncedHash === null) {
          // Never finished signing in (e.g. cancelled at Google) - back to the sign-in screen.
          writeMeta(null);
          setStatus('off');
        } else {
          authLapsed.current = true;
          setStatus('reconnect');
        }
      } else {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    } finally {
      running.current = false;
      if (rerun.current) {
        rerun.current = false;
        void sync();
      }
    }
  }, [recordSynced, replaceState, syncPhotos]);

  const connect = useCallback(async () => {
    setStatus('syncing');
    setError(null);
    // Record the intent before signing in: the sign-in leaves the page for
    // Google's and comes back, and the reload needs to know to finish syncing.
    // An existing record is kept so reconnecting after a lapsed sign-in
    // doesn't start from scratch.
    if (!readMeta()) {
      writeMeta({
        providerId: provider.id,
        syncedHash: null,
        syncedRemoteVersion: null,
        lastSyncedAt: null,
        accountEmail: null,
        dataOwner: null,
        purgedPhotoIds: [],
      });
    }
    try {
      await provider.signIn(true);
      authLapsed.current = false;
      await sync();
    } catch (e) {
      if (e instanceof AuthRequiredError) setStatus('reconnect');
      else {
        setError(e instanceof Error ? e.message : String(e));
        setStatus('error');
      }
    }
  }, [sync]);

  const disconnect = useCallback(async () => {
    await provider.signOut();
    writeMeta(null);
    authLapsed.current = false;
    setLastSyncedAt(null);
    setAccountEmail(null);
    setDataOwner(null);
    setError(null);
    setStatus('off');
  }, []);

  // Sync once on load if this device was signed in before.
  useEffect(() => {
    if (readMeta()) void sync();
  }, [sync]);

  // Push edits shortly after they stop, rather than on every keystroke.
  useEffect(() => {
    if (!readMeta()) return;
    const timer = window.setTimeout(() => void sync(), PUSH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [state, sync]);

  // Pick up changes made on another device when coming back to the app, or coming back online.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible' && readMeta()) void sync();
    }
    function onOnline() {
      if (readMeta()) void sync();
    }
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [sync]);

  // A desktop left open all day should still pick up what the phone logs.
  // Only while the sign-in is still valid - an expired one would otherwise
  // bounce the page to Google and back with no warning.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible' && readMeta() && provider.hasToken()) void sync();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [sync]);

  return {
    status,
    lastSyncedAt,
    accountEmail,
    dataOwner,
    pendingPhotos,
    error,
    providerLabel: provider.label,
    connect,
    disconnect,
    syncNow: sync,
  };
}
