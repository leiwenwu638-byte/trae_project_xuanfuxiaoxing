import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReminderPopup } from './ReminderPopup';

describe('ReminderPopup', () => {
  it('renders reminder content and closes', () => {
    const onClose = vi.fn();
    render(<ReminderPopup body="已过 30 分钟，该活动一下了！" icon="💧" title="定时喝水" onClose={onClose} />);

    expect(screen.getByText('定时喝水')).toBeInTheDocument();
    expect(screen.getByText('已过 30 分钟，该活动一下了！')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '知道了' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('uses the top drop animation class', () => {
    const { container } = render(<ReminderPopup body="活动一下" icon="💧" title="定时喝水" onClose={vi.fn()} />);

    expect(container.querySelector('.reminder-popup-enter')).toBeInTheDocument();
  });

  it('renders an autoplay audio element when a sound source is provided', () => {
    const { container } = render(
      <ReminderPopup body="活动一下" icon="💧" soundSrc="file:///D:/Sounds/ice.wav" title="定时喝水" onClose={vi.fn()} />
    );

    const audio = container.querySelector('audio');
    expect(audio).toHaveAttribute('src', 'file:///D:/Sounds/ice.wav');
    expect(audio).toHaveAttribute('autoplay');
  });
});
