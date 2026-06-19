import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthWindow } from './HealthWindow';
import type { HealthReminder } from '../../shared/types';

const reminder: HealthReminder = {
  id: 'water',
  name: '定时喝水',
  icon: '💧',
  intervalMinutes: 30,
  message: '已过 30 分钟，该活动一下了！',
  soundEnabled: true,
  soundFilePath: null,
  enabled: true,
  lastTriggeredAt: '2026-06-10T09:00:00.000Z',
  nextTriggerAt: '2026-06-10T09:30:00.000Z'
};

// 公共 props：所有 HealthWindow 测试都共用
// （soundFilePath / onSelectSound / onResetSound 在本阶段是必传 prop）
function buildProps(overrides: Partial<React.ComponentProps<typeof HealthWindow>> = {}) {
  return {
    reminders: [reminder],
    now: new Date('2026-06-10T09:15:00.000Z'),
    onToggle: vi.fn(),
    onAdd: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    soundFilePath: null as string | null,
    onSelectSound: vi.fn(),
    onResetSound: vi.fn(),
    ...overrides
  };
}

describe('HealthWindow', () => {
  beforeEach(() => {
    // 清理上一测试残留的 `window.confirm` / `console.warn` spy，
    // 否则新测试用 `expect(confirmSpy).toHaveBeenCalledTimes(1)` 会失败。
    vi.restoreAllMocks();
  });

  it('renders reminder progress and toggles pause state', () => {
    const onToggle = vi.fn();
    render(<HealthWindow {...buildProps({ onToggle })} />);

    expect(screen.getByText('定时喝水')).toBeInTheDocument();
    expect(screen.getByText('剩余 15 分钟')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '暂停：定时喝水' }));

    expect(onToggle).toHaveBeenCalledWith('water');
  });

  it('does not expose an in-page close button', () => {
    render(<HealthWindow {...buildProps()} />);

    expect(screen.queryByRole('button', { name: '关闭提醒管理' })).toBeNull();
  });

  it('exposes a per-item delete button with trash icon', () => {
    render(<HealthWindow {...buildProps()} />);

    // 仿照 TodoPanel 今日计划页面的删除按钮 aria-label
    const btn = screen.getByRole('button', { name: '删除：定时喝水' });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('type', 'button');
    // 按钮里要包含 Trash2 图标（lucide-react 渲染成 svg）
    expect(btn.querySelector('svg')).not.toBeNull();
    // 文案 + 图标共存（不纯图标按钮）
    expect(btn).toHaveTextContent('删除');
  });

  it('calls onDelete only after the user confirms the prompt', () => {
    const onDelete = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<HealthWindow {...buildProps({ onDelete })} />);

    fireEvent.click(screen.getByRole('button', { name: '删除：定时喝水' }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('确定删除该健康提醒吗');
    expect(confirmSpy.mock.calls[0][0]).toContain('定时喝水');
    expect(onDelete).toHaveBeenCalledWith('water');
  });

  it('does not call onDelete when the user cancels the prompt', () => {
    const onDelete = vi.fn();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<HealthWindow {...buildProps({ onDelete })} />);

    fireEvent.click(screen.getByRole('button', { name: '删除：定时喝水' }));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('logs and swallows a synchronous throw from onDelete', () => {
    const onDelete = vi.fn(() => {
      throw new Error('synthetic failure');
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<HealthWindow {...buildProps({ onDelete })} />);

    expect(() =>
      fireEvent.click(screen.getByRole('button', { name: '删除：定时喝水' }))
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  it('still toggles pause state after adding a delete button (regression)', () => {
    const onToggle = vi.fn();
    render(<HealthWindow {...buildProps({ onToggle })} />);

    fireEvent.click(screen.getByRole('button', { name: '暂停：定时喝水' }));
    expect(onToggle).toHaveBeenCalledWith('water');
  });

  it('closes the edit form when deleting the reminder being edited', () => {
    const onDelete = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<HealthWindow {...buildProps({ onDelete })} />);

    // 进入编辑态
    fireEvent.click(screen.getByRole('button', { name: '编辑：定时喝水' }));
    expect(screen.getByLabelText('修改提醒名称')).toBeInTheDocument();
    // 退出编辑态
    fireEvent.click(screen.getByRole('button', { name: '取消修改' }));
    expect(screen.queryByLabelText('修改提醒名称')).toBeNull();
    // 删除按钮仍然存在（被编辑过的提醒也能删）
    expect(screen.getByRole('button', { name: '删除：定时喝水' })).toBeInTheDocument();
  });

  it('adds a custom health reminder with default sound enabled', () => {
    const onAdd = vi.fn();
    render(
      <HealthWindow
        {...buildProps({
          reminders: [],
          onAdd
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '添加提醒' }));
    fireEvent.change(screen.getByLabelText('提醒名称'), { target: { value: '拉伸' } });
    fireEvent.change(screen.getByLabelText('间隔分钟'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('提醒内容'), { target: { value: '站起来拉伸肩颈！' } });
    fireEvent.click(screen.getByRole('button', { name: '保存提醒' }));

    // 单条 reminder 永远 soundEnabled=true（音源走全局 settings.general.soundFilePath）。
    expect(onAdd).toHaveBeenCalledWith({
      name: '拉伸',
      intervalMinutes: 20,
      message: '站起来拉伸肩颈！',
      soundEnabled: true,
      soundFilePath: null
    });
  });

  it('updates the default reminder message when the interval changes before customization', () => {
    const onAdd = vi.fn();
    render(
      <HealthWindow
        {...buildProps({
          reminders: [],
          onAdd
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '添加提醒' }));
    fireEvent.change(screen.getByLabelText('间隔分钟'), { target: { value: '45' } });

    expect(screen.getByLabelText('提醒内容')).toHaveValue('已过 45 分钟，该活动一下了！');
  });

  it('shows a custom validation message for invalid intervals', () => {
    render(<HealthWindow {...buildProps({ reminders: [] })} />);

    fireEvent.click(screen.getByRole('button', { name: '添加提醒' }));
    fireEvent.change(screen.getByLabelText('提醒名称'), { target: { value: '拉伸' } });
    fireEvent.change(screen.getByLabelText('间隔分钟'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: '保存提醒' }));

    expect(screen.getByRole('alert')).toHaveTextContent('间隔需为 5 到 480 分钟！');
  });

  it('edits a health reminder name and interval', () => {
    const onUpdate = vi.fn();
    const editableReminder = { ...reminder, id: 'custom', name: 'Drink water' };

    render(
      <HealthWindow
        {...buildProps({
          reminders: [editableReminder],
          onUpdate
        })}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /编辑.*Drink water/ }));
    fireEvent.change(screen.getByLabelText('修改提醒名称'), { target: { value: 'Walk around' } });
    fireEvent.change(screen.getByLabelText('修改间隔分钟'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('修改提醒内容'), { target: { value: '离开座位走一走！' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    expect(onUpdate).toHaveBeenCalledWith('custom', {
      name: 'Walk around',
      intervalMinutes: 45,
      message: '离开座位走一走！',
      soundEnabled: true,
      soundFilePath: null
    });
  });

  it('renders delete, edit and toggle buttons in that order on the action row', () => {
    render(<HealthWindow {...buildProps()} />);

    const actionRow = screen.getByTestId('delete-reminder-water').parentElement!;
    const buttons = Array.from(actionRow.querySelectorAll('button'));
    const labels = buttons.map((b) => b.getAttribute('aria-label') ?? '');
    expect(labels[0]).toBe('编辑：定时喝水');
    expect(labels[1]).toBe('暂停：定时喝水');
    expect(labels[2]).toBe('删除：定时喝水');
  });

  // -------------------------------------------------------------------------
  // SoundSettingsBar（全局提示音设置）相关
  // -------------------------------------------------------------------------

  it('shows 默认 status when soundFilePath is null', () => {
    render(<HealthWindow {...buildProps({ soundFilePath: null })} />);
    expect(screen.getByTestId('health-sound-status')).toHaveTextContent('默认');
  });

  it('shows 自定义 status and a reset button when soundFilePath is set', () => {
    const onResetSound = vi.fn();
    render(
      <HealthWindow
        {...buildProps({
          soundFilePath: 'C:/Users/me/sounds/water.wav',
          onResetSound
        })}
      />
    );
    expect(screen.getByTestId('health-sound-status')).toHaveTextContent('自定义');
    fireEvent.click(screen.getByRole('button', { name: '恢复默认提示音' }));
    expect(onResetSound).toHaveBeenCalledTimes(1);
  });

  it('forwards a selected audio File to onSelectSound', () => {
    const onSelectSound = vi.fn();
    render(<HealthWindow {...buildProps({ onSelectSound })} />);

    const file = new File(['x'], 'ding.wav', { type: 'audio/wav' });
    fireEvent.change(screen.getByTestId('health-sound-file-input'), {
      target: { files: [file] }
    });
    expect(onSelectSound).toHaveBeenCalledTimes(1);
    expect(onSelectSound.mock.calls[0][0]).toBe(file);
  });
});
