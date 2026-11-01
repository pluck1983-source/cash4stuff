import { describe, expect, it } from 'vitest';
import { viewportShift } from './viewport';

describe('viewportShift', () => {
  it('is zero when the viewports line up', () => {
    expect(viewportShift({ offsetTop: 0, height: 1080, scale: 1 }, 1080)).toEqual({ top: 0, bottom: 0 });
  });

  it('moves the bars back after the keyboard leaves the page shifted up', () => {
    // iPad after the keyboard closes: page left 324px up, so the bar floats 324px above the bottom
    expect(viewportShift({ offsetTop: 324, height: 1080, scale: 1 }, 1080)).toEqual({ top: 324, bottom: 324 });
  });

  it('covers a layout viewport left at keyboard height', () => {
    expect(viewportShift({ offsetTop: 0, height: 1080, scale: 1 }, 760)).toEqual({ top: 0, bottom: 320 });
  });

  it('never lifts the tab bar while something covers the bottom', () => {
    // iPhone with a select picker or keyboard up: visible area 340px shorter than the page
    expect(viewportShift({ offsetTop: 0, height: 504, scale: 1 }, 844)).toEqual({ top: 0, bottom: 0 });
    expect(viewportShift({ offsetTop: 120, height: 504, scale: 1 }, 844)).toEqual({ top: 120, bottom: 0 });
  });

  it('leaves the bars alone while zoomed in', () => {
    expect(viewportShift({ offsetTop: 200, height: 500, scale: 2 }, 1080)).toEqual({ top: 0, bottom: 0 });
  });

  it('ignores a pixel or two of rounding', () => {
    expect(viewportShift({ offsetTop: 0.5, height: 1081.5, scale: 1 }, 1080)).toEqual({ top: 0, bottom: 0 });
  });
});
