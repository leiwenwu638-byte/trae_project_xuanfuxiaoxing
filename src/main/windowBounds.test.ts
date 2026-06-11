import { describe, expect, it } from 'vitest';
import { ensureVisibleBounds, getTopCenterPosition, getPanelPositionNearAnchor } from './windowBounds';

describe('ensureVisibleBounds', () => {
  it('keeps a visible position unchanged', () => {
    expect(
      ensureVisibleBounds(
        { x: 120, y: 160 },
        { x: 0, y: 0, width: 1920, height: 1080 },
        { width: 52, height: 52 }
      )
    ).toEqual({ x: 120, y: 160 });
  });

  it('moves an offscreen position back into the work area', () => {
    expect(
      ensureVisibleBounds(
        { x: 4000, y: -300 },
        { x: 0, y: 0, width: 1920, height: 1040 },
        { width: 52, height: 52 }
      )
    ).toEqual({ x: 1852, y: 16 });
  });

  it('places popup windows at the top center of the work area', () => {
    expect(getTopCenterPosition({ x: 0, y: 0, width: 1920, height: 1040 }, { width: 360, height: 180 })).toEqual({
      x: 780,
      y: 24
    });
  });

  it('places utility panels beside an anchor and keeps them visible', () => {
    expect(
      getPanelPositionNearAnchor(
        { x: 1880, y: 1020, width: 52, height: 52 },
        { x: 0, y: 0, width: 1920, height: 1040 },
        { width: 340, height: 560 }
      )
    ).toEqual({ x: 1564, y: 464 });
  });
});
