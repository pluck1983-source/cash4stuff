/**
 * Item photos. Phone camera shots are several MB each, far too big for
 * localStorage or for a JSON sync file, so they're shrunk on the device and
 * kept in IndexedDB, then synced to the cloud as separate image files.
 */

const DB_NAME = 'cash4stuff-photos';
const STORE = 'photos';
/** Longest edge in pixels after compression - plenty to identify an item */
const MAX_EDGE = 1200;
const JPEG_QUALITY = 0.72;

interface PhotoRecord {
  id: string;
  blob: Blob;
  /** True once the cloud has a copy */
  synced: boolean;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function savePhoto(id: string, blob: Blob, synced: boolean): Promise<void> {
  await tx('readwrite', (s) => s.put({ id, blob, synced } satisfies PhotoRecord));
  objectUrls.delete(id);
  notify(id);
}

export async function getPhoto(id: string): Promise<Blob | null> {
  const record = (await tx('readonly', (s) => s.get(id))) as PhotoRecord | undefined;
  return record?.blob ?? null;
}

export async function markPhotoSynced(id: string): Promise<void> {
  const record = (await tx('readonly', (s) => s.get(id))) as PhotoRecord | undefined;
  if (record && !record.synced) await tx('readwrite', (s) => s.put({ ...record, synced: true }));
}

export async function unsyncedPhotoIds(): Promise<string[]> {
  const all = (await tx('readonly', (s) => s.getAll())) as PhotoRecord[];
  return all.filter((r) => !r.synced).map((r) => r.id);
}

export async function deleteLocalPhoto(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
  const url = objectUrls.get(id);
  if (url) URL.revokeObjectURL(url);
  objectUrls.delete(id);
}

export async function clearAllPhotos(): Promise<void> {
  await tx('readwrite', (s) => s.clear());
  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
}

/** Shrinks a camera photo to a JPEG no bigger than MAX_EDGE on its longest side. */
export async function compressImage(file: Blob): Promise<Blob> {
  // imageOrientation 'from-image' applies the EXIF rotation phones store photos with.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the photo on this device');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not compress the photo'))), 'image/jpeg', JPEG_QUALITY),
  );
}

// --- Display helpers -------------------------------------------------------

const objectUrls = new Map<string, string>();
const listeners = new Set<(id: string) => void>();

function notify(id: string) {
  for (const listener of listeners) listener(id);
}

export function onPhotoChanged(listener: (id: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A remote fetcher set by the sync layer, used when a photo isn't on this device yet */
let remoteFetcher: ((id: string) => Promise<Blob | null>) | null = null;
const inFlight = new Map<string, Promise<string | null>>();

export function setRemotePhotoFetcher(fetcher: ((id: string) => Promise<Blob | null>) | null) {
  remoteFetcher = fetcher;
}

/** Object URL for showing a photo, fetching it from the cloud if this device doesn't have it. */
export function photoUrl(id: string): Promise<string | null> {
  const cached = objectUrls.get(id);
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(id);
  if (pending) return pending;
  const promise = (async () => {
    let blob = await getPhoto(id).catch(() => null);
    if (!blob && remoteFetcher) {
      blob = await remoteFetcher(id).catch(() => null);
      if (blob) await savePhoto(id, blob, true).catch(() => {});
    }
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    objectUrls.set(id, url);
    return url;
  })().finally(() => inFlight.delete(id));
  inFlight.set(id, promise);
  return promise;
}
