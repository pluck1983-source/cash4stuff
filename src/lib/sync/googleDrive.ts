import { AuthRequiredError, type CloudProvider, type RemoteFileMeta } from './types';

/**
 * Google Drive backend. Signs in with Google's browser-only OAuth flow (a
 * full-page redirect to Google and back - no server, no popup, so it works
 * on an iPhone home-screen app).
 *
 * Data lives in an ordinary, visible "Wardrobe to Wallet" folder: one JSON file
 * plus a "photos" subfolder with one JPEG per item photo. The business owner
 * signs in first, which creates the folder in their Drive, then shares it
 * (Editor) with anyone else who should use the app. Those people sign in
 * with their own Google accounts and the app finds the shared file by name,
 * so nobody needs anyone else's password and access is removed by unsharing.
 *
 * That needs the full "drive" scope - drive.appdata is private to each
 * account, and drive.file can't see a file another person's copy of the app
 * created. In Testing mode only listed test users can sign in at all.
 */

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const SCOPE = 'openid email https://www.googleapis.com/auth/drive';
const FILE_NAME = 'cash4stuff-data.json';
const FOLDER_NAME = 'Wardrobe to Wallet';
const PHOTOS_FOLDER_NAME = 'photos';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const TOKEN_KEY = 'cash4stuff-gdrive-token';
/** CSRF check for the sign-in round trip */
const STATE_KEY = 'cash4stuff-gdrive-oauth-state';
/** Set when a silent re-sign-in has been tried this session, so it isn't retried in a loop */
const SILENT_TRIED_KEY = 'cash4stuff-gdrive-silent-tried';
const SIGN_IN_ERROR_KEY = 'cash4stuff-gdrive-sign-in-error';
const SILENT_RETRY_MS = 5 * 60_000;

/** A problem from the last Google sign-in, read once */
export function takeSignInError(): string | null {
  const message = sessionStorage.getItem(SIGN_IN_ERROR_KEY);
  sessionStorage.removeItem(SIGN_IN_ERROR_KEY);
  return message;
}

interface StoredToken {
  token: string;
  expiresAt: number;
}

interface DriveFile {
  id: string;
  modifiedTime: string;
  version: string;
  parents?: string[];
  owners?: { emailAddress?: string; displayName?: string }[];
}

function redirectUri(): string {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}

function readToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredToken;
    // Treat tokens as expired a minute early so a request doesn't race expiry.
    return parsed.expiresAt - 60_000 > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}

function writeToken(token: StoredToken | null) {
  if (token) localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  else localStorage.removeItem(TOKEN_KEY);
}

/**
 * Picks up the access token Google appends to the URL after a sign-in
 * redirect, then removes it from the address bar. Runs once when this module
 * loads, before the app renders.
 */
function consumeRedirectResult() {
  if (!window.location.hash.includes('state=')) return;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const expectedState = localStorage.getItem(STATE_KEY);
  if (!expectedState || params.get('state') !== expectedState) return;
  localStorage.removeItem(STATE_KEY);
  const token = params.get('access_token');
  const error = params.get('error');
  const granted = params.get('scope') ?? '';
  if (error && !['interaction_required', 'login_required', 'consent_required', 'account_selection_required'].includes(error)) {
    sessionStorage.setItem(SIGN_IN_ERROR_KEY, error === 'access_denied' ? 'Google sign-in was cancelled or blocked. Check this Google account is added as a test user, then try again.' : `Google sign-in failed (${error}).`);
  } else if (token && granted && !granted.includes('auth/drive')) {
    // Google's consent screen lets people untick Drive access - without it nothing can sync.
    sessionStorage.setItem(SIGN_IN_ERROR_KEY, 'Google Drive access was not allowed. Sign in again and tick the box to let Wardrobe to Wallet see and edit your Google Drive files.');
  } else if (token) {
    writeToken({ token, expiresAt: Date.now() + Number(params.get('expires_in') ?? 3600) * 1000 });
    localStorage.removeItem(SILENT_TRIED_KEY);
  }
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

consumeRedirectResult();

function redirectToGoogle(silent: boolean, loginHint?: string | null): Promise<never> {
  if (!CLIENT_ID) return Promise.reject(new Error('Google Drive sync is not configured for this build'));
  const state = crypto.randomUUID();
  localStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: SCOPE,
    state,
    include_granted_scopes: 'true',
    // "none" bounces straight back if the user is still signed in to Google
    // and has already allowed the app; otherwise it returns an error and we
    // show the Reconnect button instead.
    prompt: silent ? 'none' : 'select_account',
  });
  // Without a hint, a phone signed in to more than one Google account can't
  // renew silently - Google wants to be told which one.
  if (loginHint) params.set('login_hint', loginHint);
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  // The page is navigating away - nothing after this should run.
  return new Promise<never>(() => {});
}

async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const stored = readToken();
  if (!stored) throw new AuthRequiredError();
  const response = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${stored.token}` },
  });
  if (response.status === 401) {
    writeToken(null);
    throw new AuthRequiredError();
  }
  if (!response.ok) throw new Error(await driveErrorMessage(response));
  return response;
}

/** Turns Google's error body into something the person can act on */
async function driveErrorMessage(response: Response): Promise<string> {
  let reason = '';
  let detail = '';
  try {
    const body = (await response.json()) as { error?: { message?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] } };
    reason = body.error?.errors?.[0]?.reason ?? body.error?.details?.[0]?.reason ?? '';
    detail = body.error?.message ?? '';
  } catch {
    // Not JSON - fall back to the status code.
  }
  if (reason === 'accessNotConfigured' || reason === 'SERVICE_DISABLED' || /has not been used|is disabled/i.test(detail))
    return 'The Google Drive API is switched off in the Google Cloud project. Turn it on (APIs & Services → Library → Google Drive API → Enable), wait a few minutes, then tap retry.';
  if (reason === 'insufficientPermissions' || reason === 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' || /insufficient/i.test(detail))
    return 'Google Drive access was not allowed. Sign out in Settings, sign in again and tick the box to let Wardrobe to Wallet see and edit your Google Drive files.';
  if (response.status === 404) return 'The Wardrobe to Wallet data file could not be found in Google Drive - it may have been deleted or un-shared.';
  return `Google Drive request failed (${response.status}${detail ? `: ${detail}` : ''})`;
}

/** Drive query string literal - escapes quotes/backslashes */
function q(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

async function listFiles(query: string, fields: string, orderBy?: string): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q: `${query} and trashed = false`,
    fields: `files(${fields})`,
    // My Drive plus everything shared with this account.
    corpora: 'user',
    includeItemsFromAllDrives: 'true',
    supportsAllDrives: 'true',
    pageSize: '10',
  });
  if (orderBy) params.set('orderBy', orderBy);
  const response = await driveFetch(`https://www.googleapis.com/drive/v3/files?${params}`);
  return ((await response.json()) as { files: DriveFile[] }).files;
}

async function createFolder(name: string, parentId: string | null): Promise<string> {
  const response = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) }),
  });
  return ((await response.json()) as { id: string }).id;
}

/** Folder holding the data file - learned from the data file, or created on first upload */
let dataFolderId: string | null = null;
let photosFolderId: string | null = null;

async function ensureDataFolder(): Promise<string> {
  dataFolderId ??= await createFolder(FOLDER_NAME, null);
  return dataFolderId;
}

async function ensurePhotosFolder(): Promise<string> {
  if (photosFolderId) return photosFolderId;
  const parent = dataFolderId ?? (await ensureDataFolder());
  const existing = await listFiles(`name = ${q(PHOTOS_FOLDER_NAME)} and mimeType = ${q(FOLDER_MIME)} and ${q(parent)} in parents`, 'id');
  photosFolderId = existing[0]?.id ?? (await createFolder(PHOTOS_FOLDER_NAME, parent));
  return photosFolderId;
}

function photoFileName(photoId: string): string {
  return `photo-${photoId}.jpg`;
}

/** Drive file ids of photos looked up this session, so each is only searched for once */
const photoFileIds = new Map<string, string>();

async function findPhotoFileId(photoId: string): Promise<string | null> {
  const cached = photoFileIds.get(photoId);
  if (cached) return cached;
  // Photo ids are random UUIDs, so the name alone is unique.
  const files = await listFiles(`name = ${q(photoFileName(photoId))}`, 'id');
  const id = files[0]?.id ?? null;
  if (id) photoFileIds.set(photoId, id);
  return id;
}

function toMeta(file: DriveFile): RemoteFileMeta {
  const owner = file.owners?.[0];
  return { id: file.id, modifiedTime: file.modifiedTime, version: file.version, owner: owner?.emailAddress ?? owner?.displayName ?? null };
}

const FIELDS = 'id,modifiedTime,version,parents,owners(emailAddress,displayName)';

export const googleDriveProvider: CloudProvider = {
  id: 'google-drive',
  label: 'Google Drive',

  isConfigured: () => Boolean(CLIENT_ID),

  hasToken: () => readToken() !== null,

  async signIn(interactive, mayRedirect = false, loginHint = null) {
    if (interactive) return redirectToGoogle(false);
    if (readToken()) return;
    // Tokens only last an hour, so a returning visit usually needs a fresh
    // one. The silent round trip reloads the page, so it's only allowed when
    // the app starts (never mid-typing), and at most once every few minutes -
    // remembered in localStorage because iPhone home-screen apps can lose
    // sessionStorage on the way back from Google, which would loop forever.
    const lastTry = Number(localStorage.getItem(SILENT_TRIED_KEY) ?? 0);
    if (mayRedirect && navigator.onLine && Date.now() - lastTry > SILENT_RETRY_MS) {
      localStorage.setItem(SILENT_TRIED_KEY, String(Date.now()));
      return redirectToGoogle(true, loginHint);
    }
    throw new AuthRequiredError();
  },

  async signOut() {
    const stored = readToken();
    writeToken(null);
    dataFolderId = null;
    photosFolderId = null;
    photoFileIds.clear();
    if (stored) {
      // Best effort - revokes this app's access so a later sign-in asks again.
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(stored.token)}`, {
        method: 'POST',
      }).catch(() => {});
    }
  },

  async getMeta() {
    const files = await listFiles(`name = ${q(FILE_NAME)}`, FIELDS, 'modifiedTime desc');
    const file = files[0];
    if (!file) return null;
    if (file.parents?.[0] && file.parents[0] !== dataFolderId) {
      dataFolderId = file.parents[0];
      photosFolderId = null;
    }
    return toMeta(file);
  },

  async download(meta) {
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${meta.id}?alt=media&supportsAllDrives=true`);
    return response.text();
  },

  async upload(content, existing) {
    if (existing) {
      const response = await driveFetch(
        `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media&supportsAllDrives=true&fields=${FIELDS}`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content },
      );
      return toMeta((await response.json()) as DriveFile);
    }
    const folderId = await ensureDataFolder();
    const boundary = `cash4stuff${Date.now()}`;
    const metadata = { name: FILE_NAME, parents: [folderId], mimeType: 'application/json' };
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
    const response = await driveFetch(
      `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=${FIELDS}`,
      { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
    );
    return toMeta((await response.json()) as DriveFile);
  },

  async getAccountEmail() {
    const response = await driveFetch('https://openidconnect.googleapis.com/v1/userinfo');
    const body = (await response.json()) as { email?: string };
    return body.email ?? null;
  },

  async uploadPhoto(photoId, blob) {
    // Photo ids are never reused, so an existing file means it's already up.
    if (await findPhotoFileId(photoId)) return;
    const folderId = await ensurePhotosFolder();
    const boundary = `cash4stuff${Date.now()}`;
    const metadata = { name: photoFileName(photoId), parents: [folderId], mimeType: 'image/jpeg' };
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`,
      blob,
      `\r\n--${boundary}--`,
    ]);
    const response = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    const file = (await response.json()) as { id: string };
    photoFileIds.set(photoId, file.id);
  },

  async downloadPhoto(photoId) {
    const id = await findPhotoFileId(photoId);
    if (!id) return null;
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`);
    return response.blob();
  },

  async deletePhoto(photoId) {
    const id = await findPhotoFileId(photoId);
    if (!id) return;
    const stored = readToken();
    if (!stored) throw new AuthRequiredError();
    // Trashed rather than deleted: an editor can't permanently delete the
    // owner's files, and the owner can still recover a photo from the bin.
    // Not via driveFetch: 403/404 (not allowed / already gone) is fine here.
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?supportsAllDrives=true`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${stored.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true }),
    });
    if (response.status === 401) {
      writeToken(null);
      throw new AuthRequiredError();
    }
    if (!response.ok && response.status !== 403 && response.status !== 404) throw new Error(`Google Drive request failed (${response.status})`);
    photoFileIds.delete(photoId);
  },
};
