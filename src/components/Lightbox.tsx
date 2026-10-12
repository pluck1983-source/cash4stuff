import { useEffect, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';

/** A photo shown nearly full screen; tap anywhere, ✕ or Escape to close */
export function Lightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Stop the page behind scrolling while the photo is open.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return createPortal(
    <div role="dialog" aria-label={alt || 'Photo'} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-3"
      // React passes portal clicks up to the thumbnail's own handlers (and any link or row around it) - stop them here.
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <img src={src} alt={alt} className="max-h-[90vh] max-w-[96vw] rounded-lg object-contain shadow-2xl" />
      <button
        type="button"
        aria-label="Close photo"
        className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.75rem)] h-10 w-10 rounded-full bg-white/15 text-xl text-white"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        ✕
      </button>
    </div>,
    document.body,
  );
}

/**
 * Click handler for a thumbnail that opens it large. Thumbnails often sit
 * inside a link or a "take photo" button, so the tap stops there.
 */
function zoomClick(open: () => void) {
  return (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    open();
  };
}

/** A photo, tappable to open nearly full screen */
export function ZoomableImg({ src, alt, className = '', loading }: { src: string; alt: string; className?: string; loading?: 'lazy' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <img src={src} alt={alt} loading={loading} className={`cursor-zoom-in ${className}`} onClick={zoomClick(() => setOpen(true))} />
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}
