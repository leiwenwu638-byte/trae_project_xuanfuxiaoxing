import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TodoPanel } from './TodoPanel';
import type { Todo } from '../../shared/types';

const todos: Todo[] = [
  {
    id: 'todo-1',
    title: '完成作业',
    reminderTime: '10:00',
    soundEnabled: true,
    completed: false,
    priority: 'medium',
    remindedAt: null,
    createdAt: '2026-06-10T08:00:00.000Z'
  }
];

describe('TodoPanel', () => {
  // 公共 props：所有 TodoPanel 测试都共用
  // （soundFilePath / onSelectSound / onResetSound 在本阶段是必传 prop）
  function buildProps(overrides: Partial<React.ComponentProps<typeof TodoPanel>> = {}) {
    return {
      dateLabel: '2026年6月10日',
      todos: [] as Todo[],
      onAdd: vi.fn(),
      onToggle: vi.fn(),
      onDelete: vi.fn(),
      onUpdate: vi.fn(),
      soundFilePath: null as string | null,
      onSelectSound: vi.fn(),
      onResetSound: vi.fn(),
      ...overrides
    };
  }

  it('adds a todo with optional reminder time', () => {
    const onAdd = vi.fn();
    render(<TodoPanel {...buildProps({ onAdd })} />);

    fireEvent.click(screen.getByRole('button', { name: '添加待办' }));
    fireEvent.change(screen.getByLabelText('任务名称'), { target: { value: '和老师汇报' } });
    // 打开时间滚轮选择器：点 trigger 按钮，浮层 portal 渲染到 document.body
    fireEvent.click(screen.getByTestId('todo-reminder-time-trigger'));
    // 选择小时 14、分钟 00
    fireEvent.click(screen.getByTestId('time-wheel-hour-14'));
    fireEvent.click(screen.getByTestId('time-wheel-minute-00'));
    // 点确定关闭浮层
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    fireEvent.click(screen.getByLabelText('待办提示音'));
    fireEvent.click(screen.getByRole('button', { name: '确认添加' }));

    expect(onAdd).toHaveBeenCalledWith({ title: '和老师汇报', reminderTime: '14:00', soundEnabled: false, priority: 'medium' });
  });

  it('uses the same top add form pattern as the reminder manager', () => {
    render(<TodoPanel {...buildProps({ todos })} />);

    fireEvent.click(screen.getByRole('button', { name: '添加待办' }));

    expect(screen.getByTestId('todo-add-form')).toHaveClass('todo-form-enter');
    expect(screen.getByTestId('todo-reminder-time-field')).toBeInTheDocument();
  });

  it('opens the time wheel picker with placeholder when reminder time is empty', () => {
    render(<TodoPanel {...buildProps()} />);

    fireEvent.click(screen.getByRole('button', { name: '添加待办' }));

    const trigger = screen.getByTestId('todo-reminder-time-trigger');
    expect(trigger).toHaveTextContent('选择提醒时间');

    fireEvent.click(trigger);
    // 浮层 portal 后应能看到小时 / 分钟两组
    expect(screen.getByTestId('time-wheel-popover')).toBeInTheDocument();
    expect(screen.getByTestId('time-wheel-hour-00')).toBeInTheDocument();
    expect(screen.getByTestId('time-wheel-minute-00')).toBeInTheDocument();
  });

  it('clears the reminder time when the clear button is pressed', () => {
    const onAdd = vi.fn();
    render(<TodoPanel {...buildProps({ onAdd })} />);

    fireEvent.click(screen.getByRole('button', { name: '添加待办' }));
    fireEvent.change(screen.getByLabelText('任务名称'), { target: { value: '测试' } });
    fireEvent.click(screen.getByTestId('todo-reminder-time-trigger'));
    fireEvent.click(screen.getByTestId('time-wheel-hour-09'));
    fireEvent.click(screen.getByTestId('time-wheel-minute-30'));
    fireEvent.click(screen.getByRole('button', { name: '确定' }));

    // 再次打开并清除
    fireEvent.click(screen.getByTestId('todo-reminder-time-trigger'));
    fireEvent.click(screen.getByRole('button', { name: '清除当前选择' }));

    fireEvent.click(screen.getByRole('button', { name: '确认添加' }));

    expect(onAdd).toHaveBeenCalledWith({ title: '测试', reminderTime: null, soundEnabled: true, priority: 'medium' });
  });

  it('shows validation for empty titles', () => {
    render(<TodoPanel {...buildProps()} />);

    fireEvent.click(screen.getByRole('button', { name: '添加待办' }));
    fireEvent.click(screen.getByRole('button', { name: '确认添加' }));

    expect(screen.getByText('任务名称不能为空')).toBeInTheDocument();
  });

  it('toggles and deletes todos', () => {
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    render(<TodoPanel {...buildProps({ todos, onToggle, onDelete })} />);

    fireEvent.click(screen.getByRole('button', { name: '标记完成：完成作业' }));
    fireEvent.click(screen.getByRole('button', { name: '删除：完成作业' }));

    expect(onToggle).toHaveBeenCalledWith('todo-1');
    expect(onDelete).toHaveBeenCalledWith('todo-1');
  });

  it('edits a todo title and reminder time inline', () => {
    const onUpdate = vi.fn();
    render(<TodoPanel {...buildProps({ todos, onUpdate })} />);

    fireEvent.click(screen.getByRole('button', { name: '编辑：完成作业' }));
    fireEvent.change(screen.getByLabelText('修改任务名称'), { target: { value: '修改后的任务' } });
    // 通过 TimeWheelPicker 修改时间
    fireEvent.click(screen.getByTestId('todo-edit-reminder-time-trigger'));
    fireEvent.click(screen.getByTestId('time-wheel-hour-16'));
    fireEvent.click(screen.getByTestId('time-wheel-minute-30'));
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    fireEvent.click(screen.getByLabelText('修改待办提示音'));
    fireEvent.click(screen.getByRole('button', { name: '保存待办修改' }));

    expect(onUpdate).toHaveBeenCalledWith('todo-1', { title: '修改后的任务', reminderTime: '16:30', soundEnabled: false, priority: 'medium' });
  });

  it('prefills the edit form with the existing reminder time', () => {
    render(<TodoPanel {...buildProps({ todos })} />);

    fireEvent.click(screen.getByRole('button', { name: '编辑：完成作业' }));

    const trigger = screen.getByTestId('todo-edit-reminder-time-trigger');
    // 编辑回显的 reminderTime 是 '10:00'，应显示在 trigger 上
    expect(trigger).toHaveTextContent('10:00');
  });

  it('does not expose an in-page close button', () => {
    render(<TodoPanel {...buildProps({ todos })} />);

    expect(screen.queryByRole('button', { name: '关闭今日待办' })).toBeNull();
  });

  // ---- 任务优先级（priority）----

  it('defaults the add form priority to medium', () => {
    render(<TodoPanel {...buildProps()} />);

    fireEvent.click(screen.getByRole('button', { name: '添加待办' }));

    // 默认 medium 应被 aria-pressed=true 标识
    const mediumBtn = screen.getByTestId('todo-priority-selector-option-medium');
    expect(mediumBtn).toHaveAttribute('aria-pressed', 'true');
    // 其它三个未选中
    expect(screen.getByTestId('todo-priority-selector-option-critical')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByTestId('todo-priority-selector-option-high')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByTestId('todo-priority-selector-option-low')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('saves the selected priority when adding a todo', () => {
    const onAdd = vi.fn();
    render(<TodoPanel {...buildProps({ onAdd })} />);

    fireEvent.click(screen.getByRole('button', { name: '添加待办' }));
    fireEvent.change(screen.getByLabelText('任务名称'), { target: { value: '紧急任务' } });
    // 切到"特别重要"
    fireEvent.click(screen.getByTestId('todo-priority-selector-option-critical'));
    fireEvent.click(screen.getByRole('button', { name: '确认添加' }));

    expect(onAdd).toHaveBeenCalledWith({
      title: '紧急任务',
      reminderTime: null,
      soundEnabled: true,
      priority: 'critical'
    });
  });

  it('resets the priority back to medium after submitting a todo', () => {
    const onAdd = vi.fn();
    render(<TodoPanel {...buildProps({ onAdd })} />);

    fireEvent.click(screen.getByRole('button', { name: '添加待办' }));
    fireEvent.change(screen.getByLabelText('任务名称'), { target: { value: '选 high' } });
    fireEvent.click(screen.getByTestId('todo-priority-selector-option-high'));
    fireEvent.click(screen.getByRole('button', { name: '确认添加' }));

    // 表单关闭，需要重新打开
    fireEvent.click(screen.getByRole('button', { name: '添加待办' }));
    expect(screen.getByTestId('todo-priority-selector-option-medium')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId('todo-priority-selector-option-high')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('renders a priority badge on each todo row', () => {
    const highTodo: Todo = {
      ...todos[0],
      priority: 'high'
    };
    render(<TodoPanel {...buildProps({ todos: [highTodo] })} />);

    expect(screen.getByTestId('todo-priority-badge-high')).toHaveTextContent('重要');
  });

  it('uses the same "任务优先级" title in both add and edit forms', () => {
    const mediumTodo: Todo = { ...todos[0], priority: 'medium' };
    render(<TodoPanel {...buildProps({ todos: [mediumTodo] })} />);

    // add form
    fireEvent.click(screen.getByRole('button', { name: '添加待办' }));
    const addGroup = screen.getByTestId('todo-priority-selector');
    expect(addGroup.previousSibling).toMatchObject({ textContent: '任务优先级' });
    fireEvent.click(screen.getByRole('button', { name: '取消添加' }));

    // edit form
    fireEvent.click(screen.getByRole('button', { name: '编辑：完成作业' }));
    const editGroup = screen.getByTestId('todo-edit-priority-selector');
    expect(editGroup.previousSibling).toMatchObject({ textContent: '任务优先级' });
    // 屏幕阅读器要能区分两个分组（不能两个都叫"任务优先级"）
    expect(addGroup.getAttribute('aria-label')).not.toBe(
      editGroup.getAttribute('aria-label')
    );
  });

  it('falls back to medium badge when todo has no priority', () => {
    const todoWithoutPriority: Todo = {
      id: 'todo-2',
      title: '老数据',
      reminderTime: null,
      soundEnabled: true,
      completed: false,
      // 老 todos.json 没有 priority 字段——直接构造一份缺字段的对象，
      // 模拟 IPC 给前端的"被手工改坏的快照"，验证列表兜底。
      remindedAt: null,
      createdAt: '2026-06-10T08:00:00.000Z'
    } as Todo;
    render(<TodoPanel {...buildProps({ todos: [todoWithoutPriority] })} />);

    expect(screen.getByTestId('todo-priority-badge-medium')).toHaveTextContent('中等');
  });

  it('prefills the edit form with the existing todo priority', () => {
    const highTodo: Todo = { ...todos[0], priority: 'high' };
    render(<TodoPanel {...buildProps({ todos: [highTodo] })} />);

    fireEvent.click(screen.getByRole('button', { name: '编辑：完成作业' }));

    // 编辑表单的 selector 应当回显 high
    expect(screen.getByTestId('todo-edit-priority-selector-option-high')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId('todo-edit-priority-selector-option-medium')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('saves the updated priority when editing a todo', () => {
    const onUpdate = vi.fn();
    const lowTodo: Todo = { ...todos[0], priority: 'low' };
    render(<TodoPanel {...buildProps({ todos: [lowTodo], onUpdate })} />);

    fireEvent.click(screen.getByRole('button', { name: '编辑：完成作业' }));
    fireEvent.click(screen.getByTestId('todo-edit-priority-selector-option-critical'));
    fireEvent.click(screen.getByRole('button', { name: '保存待办修改' }));

    expect(onUpdate).toHaveBeenCalledWith('todo-1', {
      title: '完成作业',
      reminderTime: '10:00',
      soundEnabled: true,
      priority: 'critical'
    });
  });

  // -------------------------------------------------------------------------
  // SoundSettingsBar（全局提示音设置）相关
  // -------------------------------------------------------------------------

  it('shows 默认 status when soundFilePath is null', () => {
    render(<TodoPanel {...buildProps({ soundFilePath: null })} />);
    expect(screen.getByTestId('todo-sound-status')).toHaveTextContent('默认');
  });

  it('shows 自定义 status and a reset button when soundFilePath is set', () => {
    const onResetSound = vi.fn();
    render(
      <TodoPanel
        {...buildProps({
          soundFilePath: 'C:/Users/me/sounds/ding.wav',
          onResetSound
        })}
      />
    );
    expect(screen.getByTestId('todo-sound-status')).toHaveTextContent('自定义');
    fireEvent.click(screen.getByRole('button', { name: '恢复默认提示音' }));
    expect(onResetSound).toHaveBeenCalledTimes(1);
  });

  it('forwards a selected audio File to onSelectSound', () => {
    const onSelectSound = vi.fn();
    render(<TodoPanel {...buildProps({ onSelectSound })} />);

    const file = new File(['x'], 'ding.wav', { type: 'audio/wav' });
    fireEvent.change(screen.getByTestId('todo-sound-file-input'), {
      target: { files: [file] }
    });
    expect(onSelectSound).toHaveBeenCalledTimes(1);
    expect(onSelectSound.mock.calls[0][0]).toBe(file);
  });
});
