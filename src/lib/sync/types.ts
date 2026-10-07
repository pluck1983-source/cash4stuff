/**
 * A cloud storage backend that holds a single JSON file of business data (plus
 * one image file per item photo) in
 * the user's own account. Implementations only move bytes - deciding when to
 * push, pull or ask about a conflict lives in syncEngine.ts so a provider can
 * be swapped without touching that logic.
 */
export interface RemoteFileMeta {
  id: string;
  /** Last-modified timestamp (ISO string), shown to the user */
  modifiedTime: string;
  /** Opaque marker that changes on every write (e.g. an eTag) */
  version: string;
  /** Whose storage the file lives in, when the provider knows */
  owner?: string | null;
}

export interface CloudProvider {
  id: string;
  /** Shown in the UI, e.g. "Google Drive" */
  label: string;
  /** False when the app was built without this provider's client ID */
  isConfigured(): boolean;
  /**
   * Gets an access token. interactive=false tries to reuse an existing
   * sign-in without prompting, and rejects with AuthRequiredError if the user
   * has to act. interactive=true may navigate away to the provider's sign-in
   * page and back, in which case it never resolves.
   */
  signIn(interactive: boolean): Promise<void>;
  signOut(): Promise<void>;
  getMeta(): Promise<RemoteFileMeta | null>;
  download(meta: RemoteFileMeta): Promise<string>;
  /** Creates or overwrites the file, returning its new metadata */
  upload(content: string, existing: RemoteFileMeta | null): Promise<RemoteFileMeta>;
  /** The signed-in account's email address, shown in the header */
  getAccountEmail(): Promise<string | null>;
  /** Photos are stored as separate files next to the data file, named by photo id */
  uploadPhoto(photoId: string, blob: Blob): Promise<void>;
  /** Null if the photo isn't in the cloud (e.g. not uploaded yet from the device that took it) */
  downloadPhoto(photoId: string): Promise<Blob | null>;
  deletePhoto(photoId: string): Promise<void>;
  /** True if a usable sign-in exists right now without any redirect */
  hasToken(): boolean;
}

export class AuthRequiredError extends Error {
  constructor(message = 'Sign-in required') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}
