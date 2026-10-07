import { useEffect, useRef, useState, type ReactNode } from 'react';
import { compressImage, onPhotoChanged, photoUrl } from '../lib/photos';

/** Item photo thumbnail - loads from this device, or from the cloud if it was taken on another one. */
export function Photo({ id, alt, className = '' }: { id: string | null; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = () =>
      photoUrl(id).then((u) => {
        if (cancelled) return;
        setUrl(u);
        setFailed(!u);
      });
    void load();
    const off = onPhotoChanged((changed) => {
      if (changed === id) void load();
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [id]);

  const base = `overflow-hidden bg-slate-100 dark:bg-slate-800 ${className}`;
  if (!id || (failed && !url)) {
    return (
      <div className={`${base} flex items-center justify-center text-slate-400`} aria-label={id ? 'Photo not available yet' : 'No photo'}>
        <svg viewBox="0 0 24 24" className="h-1/3 w-1/3" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 4 6.5 6H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2.5L16 4H8Z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
      </div>
    );
  }
  return <div className={base}>{url && <img src={url} alt={alt} className="h-full w-full object-cover" loading="lazy" />}</div>;
}

/**
 * Take or choose a photo. On a phone the camera opens straight away; the
 * image is shrunk on the device before anything is stored.
 */
export function PhotoPicker({
  preview,
  onPicked,
  onClear,
}: {
  /** What to show in the photo box - null shows the "take photo" prompt */
  preview: ReactNode | null;
  onPicked: (blob: Blob) => void;
  onClear: () => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onPicked(await compressImage(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not use that photo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-stretch gap-3">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="relative flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-500 dark:border-slate-600 dark:bg-slate-800"
        >
          {preview ? (
            preview
          ) : (
            <span className="whitespace-pre-line text-center text-sm">{busy ? 'Processing…' : '📷\nTake photo'}</span>
          )}
        </button>
        <div className="flex flex-col justify-center gap-2">
          <button type="button" className="text-left text-sm text-brand-700 underline dark:text-brand-400" onClick={() => cameraRef.current?.click()}>
            {preview ? 'Retake' : 'Camera'}
          </button>
          <button type="button" className="text-left text-sm text-brand-700 underline dark:text-brand-400" onClick={() => libraryRef.current?.click()}>
            Choose from library
          </button>
          {preview && (
            <button type="button" className="text-left text-sm text-slate-500 underline" onClick={onClear}>
              Remove
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void handle(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handle(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
