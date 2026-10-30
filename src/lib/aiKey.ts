/**
 * The photo AI's API key, kept on this device only and locked with Face ID /
 * Touch ID. The key is encrypted with a secret that only a passkey can give
 * back (the WebAuthn "prf" extension), and the passkey asks for a face or
 * fingerprint every time. Once unlocked, the key stays in memory until the
 * app is closed.
 */

const STORE_KEY = 'cash4stuff-ai-key';

interface Locked {
  credentialId: string;
  salt: string;
  iv: string;
  cipher: string;
}

let unlocked: string | null = null;

const toB64 = (bytes: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromB64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

function readLocked(): Locked | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Locked) : null;
  } catch {
    return null;
  }
}

export function hasAiKey(): boolean {
  return readLocked() !== null;
}

export function forgetAiKey() {
  unlocked = null;
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    // Nothing saved to remove.
  }
}

const NOT_SUPPORTED = "This phone can't lock the key with Face ID (it needs iOS 18 or newer, or a recent Chrome), so it wasn't saved.";

/** Asks for Face ID and returns the passkey's secret for this salt */
async function passkeySecret(credentialId: Uint8Array, salt: Uint8Array): Promise<ArrayBuffer> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      allowCredentials: [{ type: 'public-key', id: credentialId as BufferSource }],
      userVerification: 'required',
      extensions: { prf: { eval: { first: salt as BufferSource } } },
    },
  })) as PublicKeyCredential | null;
  const secret = assertion?.getClientExtensionResults().prf?.results?.first;
  if (!secret) throw new Error(NOT_SUPPORTED);
  return secret instanceof ArrayBuffer ? secret : (secret.buffer as ArrayBuffer);
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

/** Makes a Face ID passkey on this device and saves the key locked with it */
export async function saveAiKey(apiKey: string): Promise<void> {
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
  const credentialId = new Uint8Array(created.rawId);
  // Some phones hand the secret back straight away; others need a second Face ID.
  const first = prf?.results?.first;
  const secret = first ? (first instanceof ArrayBuffer ? first : (first.buffer as ArrayBuffer)) : await passkeySecret(credentialId, salt);
  const iv = random(12);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret, 'encrypt'), new TextEncoder().encode(apiKey.trim()));
  localStorage.setItem(STORE_KEY, JSON.stringify({ credentialId: toB64(credentialId), salt: toB64(salt), iv: toB64(iv), cipher: toB64(cipher) } satisfies Locked));
  unlocked = apiKey.trim();
}

/** The key, asking for Face ID the first time after the app opens. Null when none is saved. */
export async function unlockAiKey(): Promise<string | null> {
  if (unlocked) return unlocked;
  const locked = readLocked();
  if (!locked) return null;
  const secret = await passkeySecret(fromB64(locked.credentialId), fromB64(locked.salt));
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(locked.iv) }, await aesKey(secret, 'decrypt'), fromB64(locked.cipher));
  unlocked = new TextDecoder().decode(plain);
  return unlocked;
}
