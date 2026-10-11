import { useEffect, useRef, useState } from 'react';
import type { EditRecord, PaymentMethod } from '../lib/types';
import { PAYMENT_LABELS } from '../lib/audit';
import { Chips } from './ui';

const METHODS = Object.entries(PAYMENT_LABELS) as [Exclude<PaymentMethod, ''>, string][];

export function PaymentChips({ value, onChange }: { value: PaymentMethod; onChange: (v: PaymentMethod) => void }) {
  return (
    <Chips
      options={METHODS.map(([, label]) => label)}
      value={value ? PAYMENT_LABELS[value] : ''}
      onChange={(label) => onChange(METHODS.find(([, l]) => l === label)?.[0] ?? '')}
    />
  );
}

/** Asks why, then voids. Returns false if they backed out. */
export function askVoidReason(what: string): string | null {
  const reason = window.prompt(`Why is this ${what} being voided? It stays in the records, crossed out, with this reason.`)?.trim();
  return reason ? reason : null;
}

export function VoidedNote({ voidedAt, reason }: { voidedAt: string | null; reason: string }) {
  if (!voidedAt) return null;
  return (
    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-950 dark:text-red-300">
      Voided {new Date(voidedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
      {reason && `: ${reason}`}
    </span>
  );
}

function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Entered-at time plus any later changes, newest last */
export function AuditTrail({ createdAt, history }: { createdAt: string; history: EditRecord[] }) {
  return (
    <div className="text-xs text-slate-500">
      <p>Entered {when(createdAt)}</p>
      {history.length > 0 && (
        <ul className="mt-1 space-y-1">
          {history.map((h, i) => (
            <li key={i}>
              Changed {when(h.at)}:{' '}
              {Object.entries(h.changes)
                .map(([field, [from, to]]) => `${field} ${from || '(blank)'} → ${to || '(blank)'}`)
                .join('; ')}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Finger/stylus signature box. Calls onChange with a PNG when the stroke ends, or null when cleared. */
export function SignaturePad({ onChange }: { onChange: (png: Blob | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#111';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.clientWidth, c.clientHeight);
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  }

  return (
    <div>
      <canvas
        ref={canvas}
        aria-label="Seller signature"
        className="h-36 w-full touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white dark:border-slate-600"
        onPointerDown={(e) => {
          const ctx = e.currentTarget.getContext('2d');
          if (!ctx) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const [x, y] = point(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 0.1, y + 0.1);
          ctx.stroke();
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext('2d');
          const [x, y] = point(e);
          ctx?.lineTo(x, y);
          ctx?.stroke();
        }}
        onPointerUp={(e) => {
          if (!drawing.current) return;
          drawing.current = false;
          setEmpty(false);
          e.currentTarget.toBlob((b) => onChange(b), 'image/png');
        }}
      />
      <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
        <span>{empty ? 'Seller signs here with a finger' : 'Signed'}</span>
        {!empty && (
          <button
            type="button"
            className="font-medium text-brand-700 dark:text-brand-400"
            onClick={() => {
              const c = canvas.current;
              const ctx = c?.getContext('2d');
              if (c && ctx) ctx.fillRect(0, 0, c.clientWidth, c.clientHeight);
              setEmpty(true);
              onChange(null);
            }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
