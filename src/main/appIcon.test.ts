import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { createAppIconSvg, resolveAppIconPath } from './appIcon';

describe('createAppIconSvg', () => {
  it('renders the new Xuanfu Xiaoxing app icon artwork', () => {
    const svg = createAppIconSvg();

    expect(svg).toContain('id="xuanfu-xiaoxing-icon"');
    expect(svg).toContain('#5FCBFF');
    expect(svg).toContain('#A59BFF');
    expect(svg).toContain('id="planet-face"');
    expect(svg).toContain('id="todo-card"');
    expect(svg).toContain('id="bell"');
  });

  it('can render an unfinished todo badge in the top-right corner', () => {
    const svg = createAppIconSvg(3);

    expect(svg).toContain('id="unfinished-todo-badge"');
    expect(svg).toContain('cx="214"');
    expect(svg).toContain('cy="42"');
    expect(svg).toContain('>3</text>');
  });

  it('does not render a badge when there are no unfinished todos', () => {
    expect(createAppIconSvg(0)).not.toContain('unfinished-todo-badge');
  });

  it('resolves the normal taskbar icon to a real PNG asset', () => {
    expect(resolveAppIconPath()).toBe(path.join(process.cwd(), 'assets', 'app-icon.png'));
  });
});
