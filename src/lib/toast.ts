import { useEffect, useState } from 'react';

/** A short "Saved" style message shown over whatever page is open, so it survives navigating away */
type Listener = (message: string | null) => void;
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string, ms = 2500) {
  listeners.forEach((l) => l(message));
  clearTimeout(timer);
  timer = setTimeout(() => listeners.forEach((l) => l(null)), ms);
}

export function useToast(): string | null {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    listeners.add(setMessage);
    return () => {
      listeners.delete(setMessage);
    };
  }, []);
  return message;
}
