import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "Move data into this account" against a fake Google Drive: copies the data
 * file and photos into a new folder, never touches the originals, and the copy
 * wins over the original from then on.
 */

interface FakeFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  ownedByMe: boolean;
  owner: string;
  modifiedTime: string;
  appProperties?: Record<string, string>;
  trashed?: boolean;
}

let files: FakeFile[];
let nextId: number;
let copies: number;
let failAfterCopies: number;

function store(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    clear: () => data.clear(),
    key: () => null,
    get length() {
      return data.size;
    },
  };
}

/** Just enough of Drive's "q" language for the app's queries */
function matches(f: FakeFile, query: string): boolean {
  if (f.trashed) return false;
  const name = /name = '([^']+)'/.exec(query)?.[1];
  const mime = /mimeType = '([^']+)'/.exec(query)?.[1];
  const parent = /'([^']+)' in parents/.exec(query)?.[1];
  return (!name || f.name === name) && (!mime || f.mimeType === mime) && (!parent || f.parents.includes(parent));
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const view = (f: FakeFile) => ({ ...f, version: f.modifiedTime, owners: [{ emailAddress: f.owner }] });

function fakeFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const url = new URL(String(input));
  const method = init.method ?? 'GET';
  const copy = /\/files\/([^/]+)\/copy$/.exec(url.pathname);
  if (copy) {
    if (copies >= failAfterCopies) return Promise.resolve(new Response('{}', { status: 500 }));
    copies++;
    const from = files.find((f) => f.id === copy[1])!;
    const body = JSON.parse(String(init.body)) as Partial<FakeFile>;
    const made: FakeFile = { ...from, ...body, id: `f${nextId++}`, ownedByMe: true, owner: 'shop@example.com', modifiedTime: '2026-01-01T00:00:00Z' };
    files.push(made);
    return Promise.resolve(json(view(made)));
  }
  if (url.pathname === '/drive/v3/files' && method === 'POST') {
    const body = JSON.parse(String(init.body)) as Partial<FakeFile>;
    const made: FakeFile = { name: '', mimeType: '', parents: [], ...body, id: `f${nextId++}`, ownedByMe: true, owner: 'shop@example.com', modifiedTime: '2026-01-01T00:00:00Z' };
    files.push(made);
    return Promise.resolve(json({ id: made.id }));
  }
  if (url.pathname === '/drive/v3/files') {
    const query = url.searchParams.get('q') ?? '';
    const found = files.filter((f) => matches(f, query)).sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
    return Promise.resolve(json({ files: found.map(view) }));
  }
  const one = /\/files\/([^/]+)$/.exec(url.pathname);
  if (one && method === 'PATCH') {
    files.find((f) => f.id === one[1])!.trashed = true;
    return Promise.resolve(json({}));
  }
  throw new Error(`unexpected ${method} ${url}`);
}

const FOLDER = 'application/vnd.google-apps.folder';

async function loadProvider() {
  vi.resetModules();
  vi.stubGlobal('localStorage', store());
  vi.stubGlobal('sessionStorage', store());
  vi.stubGlobal('window', { location: { hash: '', pathname: '/', search: '', origin: 'https://x' }, history: { replaceState() {} } });
  vi.stubGlobal('fetch', vi.fn(fakeFetch));
  localStorage.setItem('cash4stuff-gdrive-token', JSON.stringify({ token: 't', expiresAt: Date.now() + 3_600_000 }));
  return (await import('./googleDrive')).googleDriveProvider;
}

beforeEach(() => {
  nextId = 100;
  copies = 0;
  failAfterCopies = Infinity;
  const old = { ownedByMe: false, owner: 'yvonne@example.com', modifiedTime: '2026-06-01T00:00:00Z' };
  files = [
    { ...old, id: 'oldFolder', name: 'Wardrobe to Wallet', mimeType: FOLDER, parents: ['root'] },
    { ...old, id: 'oldData', name: 'cash4stuff-data.json', mimeType: 'application/json', parents: ['oldFolder'] },
    { ...old, id: 'oldPhotos', name: 'photos', mimeType: FOLDER, parents: ['oldFolder'] },
    { ...old, id: 'p1', name: 'photo-a.jpg', mimeType: 'image/jpeg', parents: ['oldPhotos'] },
    { ...old, id: 'p2', name: 'photo-b.jpg', mimeType: 'image/jpeg', parents: ['oldPhotos'] },
    { ...old, id: 'p3', name: 'photo-c.jpg', mimeType: 'application/pdf', parents: ['oldPhotos'] },
  ];
});

describe('moveDataHere', () => {
  it('copies the data and every photo into a new folder, leaving the originals alone', async () => {
    const drive = await loadProvider();
    const progress: string[] = [];
    const result = await drive.moveDataHere!((d, t) => progress.push(`${d}/${t}`));

    expect(result).toEqual({ photosCopied: 3, originalOwner: 'yvonne@example.com' });
    expect(progress.at(-1)).toBe('3/3');
    const mine = files.filter((f) => f.ownedByMe);
    expect(mine.map((f) => f.name).sort()).toEqual(['Wardrobe to Wallet', 'cash4stuff-data.json', 'photo-a.jpg', 'photo-b.jpg', 'photo-c.jpg', 'photos']);
    expect(files.filter((f) => !f.ownedByMe).every((f) => !f.trashed)).toBe(true);
    expect(files.filter((f) => !f.ownedByMe)).toHaveLength(6);

    // The copy is used from now on, even though the original looks newer.
    expect((await drive.getMeta())?.id).toBe(mine.find((f) => f.name === 'cash4stuff-data.json')!.id);
  });

  it('carries on where it stopped without copying anything twice', async () => {
    const drive = await loadProvider();
    failAfterCopies = 2; // the data file and one photo
    await expect(drive.moveDataHere!()).rejects.toThrow();
    failAfterCopies = Infinity;
    const result = await drive.moveDataHere!();

    const mine = files.filter((f) => f.ownedByMe);
    expect(mine.filter((f) => f.name === 'cash4stuff-data.json')).toHaveLength(1);
    expect(mine.filter((f) => f.name.startsWith('photo-')).map((f) => f.name).sort()).toEqual(['photo-a.jpg', 'photo-b.jpg', 'photo-c.jpg']);
    expect(result.photosCopied).toBe(2);
  });

  it('deleting a photo afterwards bins the copy, not the original', async () => {
    const drive = await loadProvider();
    await drive.moveDataHere!();
    await drive.deletePhoto('a');
    expect(files.find((f) => f.id === 'p1')!.trashed).toBeFalsy();
    expect(files.find((f) => f.ownedByMe && f.name === 'photo-a.jpg')!.trashed).toBe(true);
  });

  it('refuses when the data already belongs to this account', async () => {
    files = files.map((f) => ({ ...f, ownedByMe: true }));
    const drive = await loadProvider();
    await expect(drive.moveDataHere!()).rejects.toThrow(/already in this account/);
  });
});
