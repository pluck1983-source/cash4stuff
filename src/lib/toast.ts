import { useEffect, useState } from 'react';

/**
 * A short "Saved" style message shown over whatever page is open, so it survives
 * navigating away. Every add/save form calls this so there's always a sign the
 * save worked - and errors use it too, so a failed save is never silent.
 */
export type ToastKind = 'success' | 'error';
export interface Toast {
  message: string;
  kind: ToastKind;
}

type Listener = (toast: Toast | null) => void;
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string, ms = 3500, kind: ToastKind = 'success') {
  listeners.forEach((l) => l({ message, kind }));
  clearTimeout(timer);
  timer = setTimeout(dismissToast, ms);
}

/** Errors stay up longer and can be tapped away */
export function showError(message: string, ms = 8000) {
  showToast(message, ms, 'error');
}

export function dismissToast() {
  clearTimeout(timer);
  listeners.forEach((l) => l(null));
}

export function useToast(): Toast | null {
  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    listeners.add(setToast);
    return () => {
      listeners.delete(setToast);
    };
  }, []);
  return toast;
}
