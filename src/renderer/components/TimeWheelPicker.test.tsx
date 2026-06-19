import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimeWheelPicker } from './TimeWheelPicker';

function renderPicker(value: string | null, onChange = vi.fn()) {
  render(
    <TimeWheelPicker
      ariaLabel="选择提醒时间"
      testId="time-trigger"
      value={value}
      onChange={onChange}
      onClear={vi.fn()}
    />
  );
  fireEvent.click(screen.getByTestId('time-trigger'));
  return onChange;
}

function wheelColumn(prefix: 'time-wheel-hour' | 'time-wheel-minute') {
  return screen.getByTestId(`${prefix}-viewport`);
}

describe('TimeWheelPicker', () => {
  it('keeps the highlighted center row aligned with the selected value', () => {
    renderPicker('12:00');

    const list = screen.getByTestId('time-wheel-hour-list');

    expect(screen.getByTestId('time-wheel-hour-12')).toHaveAttribute('aria-pressed', 'true');
    expect(list).toHaveStyle({ transform: 'translateY(-1296px)' });
  });

  it('confirms the same value shown as selected in the wheel', () => {
    const onChange = renderPicker('12:00');

    fireEvent.click(screen.getByRole('button', { name: '确定' }));

    expect(onChange).toHaveBeenCalledWith('12:00');
  });

  it('wraps hour 23 down to 00 with the mouse wheel', () => {
    renderPicker('23:00');

    fireEvent.wheel(wheelColumn('time-wheel-hour'), { deltaY: 100 });

    expect(screen.getByTestId('time-wheel-hour-00')).toHaveAttribute('aria-pressed', 'true');
  });

  it('wraps hour 00 up to 23 with the mouse wheel', () => {
    renderPicker('00:00');

    fireEvent.wheel(wheelColumn('time-wheel-hour'), { deltaY: -100 });

    expect(screen.getByTestId('time-wheel-hour-23')).toHaveAttribute('aria-pressed', 'true');
  });

  it('wraps minute 59 down to 00 with the mouse wheel', () => {
    renderPicker('10:59');

    fireEvent.wheel(wheelColumn('time-wheel-minute'), { deltaY: 100 });

    expect(screen.getByTestId('time-wheel-minute-00')).toHaveAttribute('aria-pressed', 'true');
  });

  it('wraps minute 00 up to 59 with the mouse wheel', () => {
    renderPicker('10:00');

    fireEvent.wheel(wheelColumn('time-wheel-minute'), { deltaY: -100 });

    expect(screen.getByTestId('time-wheel-minute-59')).toHaveAttribute('aria-pressed', 'true');
  });

  it('wraps with keyboard arrow keys', () => {
    renderPicker('23:59');

    fireEvent.keyDown(wheelColumn('time-wheel-hour'), { key: 'ArrowDown' });
    fireEvent.keyDown(wheelColumn('time-wheel-minute'), { key: 'ArrowRight' });

    expect(screen.getByTestId('time-wheel-hour-00')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('time-wheel-minute-00')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(wheelColumn('time-wheel-hour'), { key: 'ArrowUp' });
    fireEvent.keyDown(wheelColumn('time-wheel-minute'), { key: 'ArrowLeft' });

    expect(screen.getByTestId('time-wheel-hour-23')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('time-wheel-minute-59')).toHaveAttribute('aria-pressed', 'true');
  });
});
