import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActionButton } from './ActionButton';

describe('ActionButton', () => {
  it('renders plain children and infers aria-label from them', () => {
    render(<ActionButton>编辑</ActionButton>);
    const btn = screen.getByRole('button', { name: '编辑' });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('uses ariaLabel when provided, overriding inferred label', () => {
    render(<ActionButton ariaLabel="添加待办">+</ActionButton>);
    expect(screen.getByRole('button', { name: '添加待办' })).toBeInTheDocument();
  });

  it('renders an icon-only button with explicit ariaLabel', () => {
    render(
      <ActionButton
        variant="muted"
        size="icon"
        icon={<span data-testid="ico">★</span>}
        ariaLabel="收藏"
      />
    );
    const btn = screen.getByRole('button', { name: '收藏' });
    expect(btn).toContainElement(screen.getByTestId('ico'));
  });

  it('falls back to "button" ariaLabel and warns when icon-only has none', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<ActionButton icon={<span>★</span>} />);
    expect(screen.getByRole('button', { name: 'button' })).toBeInTheDocument();
    expect(warn).toHaveBeenCalled();
  });

  it('applies the standard transition / hover / focus-visible classes', () => {
    render(<ActionButton>测试</ActionButton>);
    const btn = screen.getByRole('button', { name: '测试' });
    expect(btn.className).toContain('transition-colors');
    expect(btn.className).toContain('duration-150');
    expect(btn.className).toContain('active:scale-[0.97]');
    expect(btn.className).toContain('focus-visible:ring-2');
    expect(btn.className).toContain('focus-visible:ring-assistant-accent/30');
  });

  it('renders the danger variant with warning hover tokens', () => {
    render(
      <ActionButton variant="danger" size="icon" ariaLabel="删除">
        ×
      </ActionButton>
    );
    const btn = screen.getByRole('button', { name: '删除' });
    expect(btn.className).toContain('hover:border-assistant-warning');
    expect(btn.className).toContain('hover:bg-orange-50');
    expect(btn.className).toContain('hover:text-assistant-warning');
    expect(btn.className).toContain('active:bg-orange-100');
  });

  it('renders the primary variant with the accent background', () => {
    render(
      <ActionButton variant="primary" size="icon" ariaLabel="确认">
        ✓
      </ActionButton>
    );
    const btn = screen.getByRole('button', { name: '确认' });
    expect(btn.className).toContain('bg-assistant-accent');
    expect(btn.className).toContain('text-white');
  });

  it('renders the ghost variant with no border', () => {
    render(
      <ActionButton variant="ghost" size="icon" ariaLabel="取消">
        ×
      </ActionButton>
    );
    const btn = screen.getByRole('button', { name: '取消' });
    expect(btn.className).toContain('border-transparent');
  });

  it('respects size "sm" with h-6 / px-2 / text-[11px]', () => {
    render(<ActionButton size="sm">编辑</ActionButton>);
    const btn = screen.getByRole('button', { name: '编辑' });
    expect(btn.className).toContain('h-6');
    expect(btn.className).toContain('px-2');
    expect(btn.className).toContain('text-[11px]');
  });

  it('respects size "icon" with h-7 w-7', () => {
    render(
      <ActionButton size="icon" ariaLabel="+">
        +
      </ActionButton>
    );
    const btn = screen.getByRole('button', { name: '+' });
    expect(btn.className).toContain('h-7');
    expect(btn.className).toContain('w-7');
  });

  it('forwards onClick to the underlying button', () => {
    const onClick = vi.fn();
    render(<ActionButton onClick={onClick}>点我</ActionButton>);
    fireEvent.click(screen.getByRole('button', { name: '点我' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    render(
      <ActionButton disabled onClick={onClick}>
        点我
      </ActionButton>
    );
    const btn = screen.getByRole('button', { name: '点我' });
    expect(btn).toBeDisabled();
    expect(btn.className).toContain('disabled:opacity-50');
    expect(btn.className).toContain('disabled:pointer-events-none');
    fireEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('allows type="submit" override', () => {
    render(<ActionButton type="submit">保存</ActionButton>);
    expect(screen.getByRole('button', { name: '保存' })).toHaveAttribute('type', 'submit');
  });

  it('forwards data-testid to the button', () => {
    render(<ActionButton data-testid="my-btn">X</ActionButton>);
    expect(screen.getByTestId('my-btn')).toBeInTheDocument();
  });
});
