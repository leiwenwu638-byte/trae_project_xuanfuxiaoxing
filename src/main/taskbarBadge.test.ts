import { describe, expect, it } from 'vitest';
import { createTaskbarBadgeSvg } from './taskbarBadge';

describe('createTaskbarBadgeSvg', () => {
  it('renders the unfinished todo count', () => {
    expect(createTaskbarBadgeSvg(7)).toContain('>7</text>');
  });

  it('caps large counts at 99+', () => {
    expect(createTaskbarBadgeSvg(134)).toContain('>99+</text>');
  });

  it('does not render negative counts', () => {
    expect(createTaskbarBadgeSvg(-2)).toContain('>0</text>');
  });
});
