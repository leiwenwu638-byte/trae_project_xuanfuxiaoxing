import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HealthWindow } from './HealthWindow';
import type { HealthReminder } from '../../shared/types';

const reminder: HealthReminder = {
  id: 'water',
  name: '定时喝水',
  icon: '💧',
  intervalMinutes: 30,
  soundEnabled: true,
  enabled: true,
  lastTriggeredAt: '2026-06-10T09:00:00.000Z',
  nextTriggerAt: '2026-06-10T09:30:00.000Z'
};

describe('HealthWindow', () => {
  it('renders reminder progress and toggles pause state', () => {
    const onToggle = vi.fn();
    render(
      <HealthWindow
        reminders={[reminder]}
        now={new Date('2026-06-10T09:15:00.000Z')}
        onToggle={onToggle}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('定时喝水')).toBeInTheDocument();
    expect(screen.getByText('剩余 15 分钟')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '暂停：定时喝水' }));

    expect(onToggle).toHaveBeenCalledWith('water');
  });

  it('closes the health window', () => {
    const onClose = vi.fn();
    render(
      <HealthWindow
        reminders={[reminder]}
        now={new Date('2026-06-10T09:15:00.000Z')}
        onToggle={vi.fn()}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '关闭提醒管理' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('adds a custom health reminder', () => {
    const onAdd = vi.fn();
    render(
      <HealthWindow
        reminders={[]}
        now={new Date('2026-06-10T09:15:00.000Z')}
        onToggle={vi.fn()}
        onAdd={onAdd}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '添加提醒' }));
    fireEvent.change(screen.getByLabelText('提醒名称'), { target: { value: '拉伸' } });
    fireEvent.change(screen.getByLabelText('间隔分钟'), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: '保存提醒' }));

    expect(onAdd).toHaveBeenCalledWith({ name: '拉伸', intervalMinutes: 20, soundEnabled: true });
  });

  it('edits a health reminder name and interval', () => {
    const onUpdate = vi.fn();
    const editableReminder = { ...reminder, id: 'custom', name: 'Drink water' };

    render(
      <HealthWindow
        reminders={[editableReminder]}
        now={new Date('2026-06-10T09:15:00.000Z')}
        onToggle={vi.fn()}
        onAdd={vi.fn()}
        onUpdate={onUpdate}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /编辑.*Drink water/ }));
    fireEvent.change(screen.getByLabelText('修改提醒名称'), { target: { value: 'Walk around' } });
    fireEvent.change(screen.getByLabelText('修改间隔分钟'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    expect(onUpdate).toHaveBeenCalledWith('custom', {
      name: 'Walk around',
      intervalMinutes: 45,
      soundEnabled: true
    });
  });

  it('deletes a health reminder', () => {
    const onDelete = vi.fn();
    render(
      <HealthWindow
        reminders={[reminder]}
        now={new Date('2026-06-10T09:15:00.000Z')}
        onToggle={vi.fn()}
        onAdd={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={onDelete}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '删除：定时喝水' }));

    expect(onDelete).toHaveBeenCalledWith('water');
  });
});
