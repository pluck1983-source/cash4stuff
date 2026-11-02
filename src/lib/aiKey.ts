import type { LockedAiKey } from './types';

/**
 * The photo AI's API key, locked with Face ID / Touch ID. The key is
 * encrypted with a secret that only a passkey can give back (the WebAuthn
 * "prf" extension), and the passkey asks for a face or fingerprint every
 * time. The locked copies live in the synced settings: passkeys sync through
 * iCloud Keychain, so the person who saved a key can unlock it on all their
 * devices, while anyone else sharing the data can't.
 *
 * Once unlocked with Face ID, the key is also kept on this device (local
 * storage, never synced) so the photo AI runs on every upload without asking
 * again - David's choice (2026-11-02). "Lock this device" in Settings forgets it.
 */

const DEVICE_KEY = 'cash4stuff-ai-key-device';

/** The unlocked key kept on this device, with which saved (locked) key it came from */
interface DeviceKey {
  cipher: string;
  apiKey: string;
}

function readDeviceKey(): DeviceKey | null {
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    return raw ? (JSON.parse(raw) as DeviceKey) : null;
  } catch {
    return null;
  }
}

function keepOnDevice(cipher: string, apiKey: string) {
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify({ cipher, apiKey } satisfies DeviceKey));
  } catch {
    // Private browsing etc: it stays unlocked until the app closes instead.
  }
}

let unlocked: string | null = null;

/** The key kept on this device, if it still matches one of the saved keys (removed keys don't linger) */
function deviceKeyFor(keys: LockedAiKey[]): string | null {
  const kept = readDeviceKey();
  if (!kept) return null;
  if (keys.some((k) => k.cipher === kept.cipher)) return kept.apiKey;
  forgetUnlockedKey();
  return null;
}

const toB64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const toB64Url = (text: string) => text.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const asBuffer = (secret: BufferSource): ArrayBuffer => (secret instanceof ArrayBuffer ? secret : (secret.buffer as ArrayBuffer));

const NOT_SUPPORTED = "This device can't lock the key with Face ID (it needs iOS 18 or newer, or a recent Chrome), so it wasn't saved.";
const NOT_YOURS = 'A key saved from another Apple ID needs your own key adding in Settings > Photo AI.';

/** Unlocked already (this app session or kept on this device), so the AI can run without asking for Face ID */
export function aiKeyUnlocked(keys: LockedAiKey[]): boolean {
  if (keys.length === 0) return false;
  return unlocked !== null || deviceKeyFor(keys) !== null;
}

/** Locks this device again: the next run asks for Face ID */
export function forgetUnlockedKey() {
  unlocked = null;
  try {
    localStorage.removeItem(DEVICE_KEY);
  } catch {
    // Nothing kept.
  }
}

/** Asks for Face ID once; whichever saved key belongs to this person's passkeys is used */
async function passkeySecret(keys: LockedAiKey[]): Promise<{ key: LockedAiKey; secret: ArrayBuffer }> {
  const evalByCredential = Object.fromEntries(keys.map((k) => [toB64Url(k.credentialId), { first: fromB64(k.salt) as BufferSource }]));
  const assertion = (await navigator.credentials
    .get({
      publicKey: {
        challenge: random(32),
        allowCredentials: keys.map((k) => ({ type: 'public-key', id: fromB64(k.credentialId) as BufferSource })),
        userVerification: 'required',
        extensions: { prf: { evalByCredential } },
      },
    })
    .catch((e: unknown) => {
      // The phone says the same thing for "cancelled" and "no matching passkey".
      if (e instanceof DOMException && e.name === 'NotAllowedError') throw new Error(`Face ID was cancelled, or this device can't unlock the saved key. ${NOT_YOURS}`);
      throw e;
    })) as PublicKeyCredential | null;
  if (!assertion) throw new Error(NOT_YOURS);
  const key = keys.find((k) => k.credentialId === toB64(assertion.rawId));
  const secret = assertion.getClientExtensionResults().prf?.results?.first;
  if (!key) throw new Error(NOT_YOURS);
  if (!secret) throw new Error(NOT_SUPPORTED);
  return { key, secret: asBuffer(secret) };
}

async function aesKey(secret: ArrayBuffer, usage: KeyUsage): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info: new TextEncoder().encode('cash4stuff photo AI key') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage],
  );
}

/** Makes a Face ID passkey and returns the key locked with it, to add to the synced settings */
export async function lockAiKey(apiKey: string): Promise<LockedAiKey> {
  if (!window.PublicKeyCredential || !crypto.subtle) throw new Error(NOT_SUPPORTED);
  const salt = random(32);
  const created = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Wardrobe to Wallet' },
      user: { id: random(16), name: 'Photo AI key', displayName: 'Photo AI key' },
      challenge: random(32),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { userVerification: 'required', residentKey: 'required' },
      extensions: { prf: { eval: { first: salt } } },
    },
  })) as PublicKeyCredential | null;
  if (!created) throw new Error('Face ID was cancelled');
  const prf = created.getClientExtensionResults().prf;
  if (prf?.enabled === false) throw new Error(NOT_SUPPORTED);
  const credentialId = toB64(created.rawId);
  const iv = random(12);
  // Some devices hand the secret back straight away; others need a second Face ID.
  const first = prf?.results?.first;
  const partial = { credentialId, salt: toB64(salt), iv: toB64(iv), cipher: '' };
  const secret = first ? asBuffer(first) : (await passkeySecret([partial])).secret;
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret, 'encrypt'), new TextEncoder().encode(apiKey.trim()));
  unlocked = apiKey.trim();
  keepOnDevice(toB64(cipher), unlocked);
  return { ...partial, cipher: toB64(cipher) };
}

/** The key, asking for Face ID the first time after the app opens. Null when none is saved. */
export async function unlockAiKey(keys: LockedAiKey[]): Promise<string | null> {
  if (keys.length === 0) return null;
  const kept = deviceKeyFor(keys);
  if (kept) return kept;
  if (unlocked) return unlocked;
  const { key, secret } = await passkeySecret(keys);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(key.iv) }, await aesKey(secret, 'decrypt'), fromB64(key.cipher));
  unlocked = new TextDecoder().decode(plain);
  keepOnDevice(key.cipher, unlocked);
  return unlocked;
}
