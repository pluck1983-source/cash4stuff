import { useEffect } from 'react';

/**
 * How far the pinned header and tab bar are out of place, from the browser's
 * own viewport numbers.
 *
 * iPad and iPhone Safari (most of all from the home screen) sometimes leave
 * the page shifted after the on-screen keyboard closes: the visual viewport
 * stays offset from the layout one, so `position: fixed; bottom: 0` ends up
 * floating where the top of the keyboard was and the sticky header slides
 * off the top. Nothing in our CSS can see that, so we measure it and move
 * the bars back by the difference.
 *
 * Returns zero while zoomed in (moving the bars would fight the pinch) and
 * for differences of a couple of pixels (toolbar rounding).
 */
export function viewportShift(v: { offsetTop: number; height: number; scale: number }, innerHeight: number): { top: number; bottom: number } {
  if (Math.abs(v.scale - 1) > 0.01) return { top: 0, bottom: 0 };
  const top = Math.round(v.offsetTop);
  const bottom = Math.round(v.offsetTop + v.height - innerHeight);
  return { top: Math.abs(top) > 2 ? top : 0, bottom: Math.abs(bottom) > 2 ? bottom : 0 };
}

function typing(): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  return el instanceof HTMLInputElement && !['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'range', 'color'].includes(el.type);
}

/**
 * Keeps --vv-top / --vv-bottom on <html> set to the shift above, for the
 * phone header and tab bar to translate by. While a field has focus the
 * keyboard is up and Safari's normal handling is left alone.
 */
export function usePinnedBarsFix(enabled: boolean) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!enabled || !vv) return;
    const root = document.documentElement.style;
    let frame = 0;

    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const s = typing() ? { top: 0, bottom: 0 } : viewportShift(vv, window.innerHeight);
        root.setProperty('--vv-top', `${s.top}px`);
        root.setProperty('--vv-bottom', `${s.bottom}px`);
      });
    };

    // Once the keyboard has gone, nudge Safari to settle the viewport itself;
    // the measured shift covers the times it doesn't.
    const afterKeyboard = () => {
      setTimeout(() => {
        if (!typing()) window.scrollTo(window.scrollX, window.scrollY);
        update();
      }, 300);
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('focusin', update);
    window.addEventListener('focusout', afterKeyboard);
    window.addEventListener('pageshow', update);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      window.removeEventListener('scroll', update);
      window.removeEventListener('focusin', update);
      window.removeEventListener('focusout', afterKeyboard);
      window.removeEventListener('pageshow', update);
      document.removeEventListener('visibilitychange', update);
      root.removeProperty('--vv-top');
      root.removeProperty('--vv-bottom');
    };
  }, [enabled]);
}
