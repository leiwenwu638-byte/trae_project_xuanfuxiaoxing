import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TodoPanel } from './TodoPanel';
import type { Todo } from '../../shared/types';

const todos: Todo[] = [
  {
    id: 'todo-1',
    title: '完成作业',
    reminderTime: '10:00',
    completed: false,
    remindedAt: null,
    createdAt: '2026-06-10T08:00:00.000Z'
  }
];

describe('TodoPanel', () => {
  it('adds a todo with optional reminder time', () => {
    const onAdd = vi.fn();
    render(
      <TodoPanel
        dateLabel="2026年6月10日"
        todos={[]}
        onAdd={onAdd}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '添加待办' }));
    fireEvent.change(screen.getByLabelText('任务名称'), { target: { value: '和老师汇报' } });
    fireEvent.change(screen.getByLabelText('提醒时间'), { target: { value: '14:00' } });
    fireEvent.click(screen.getByRole('button', { name: '确认添加' }));

    expect(onAdd).toHaveBeenCalledWith({ title: '和老师汇报', reminderTime: '14:00' });
  });

  it('uses the same top add form pattern as the reminder manager', () => {
    render(
      <TodoPanel
        dateLabel="2026年6月10日"
        todos={todos}
        onAdd={vi.fn()}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '添加待办' }));

    expect(screen.getByTestId('todo-add-form')).toHaveClass('todo-form-enter');
    expect(screen.getByTestId('todo-reminder-time-field')).toHaveClass('todo-time-field');
  });

  it('shows validation for empty titles', () => {
    render(
      <TodoPanel
        dateLabel="2026年6月10日"
        todos={[]}
        onAdd={vi.fn()}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '添加待办' }));
    fireEvent.click(screen.getByRole('button', { name: '确认添加' }));

    expect(screen.getByText('任务名称不能为空')).toBeInTheDocument();
  });

  it('toggles and deletes todos', () => {
    const onToggle = vi.fn();
    const onDelete = vi.fn();
    render(
      <TodoPanel
        dateLabel="2026年6月10日"
        todos={todos}
        onAdd={vi.fn()}
        onClose={vi.fn()}
        onToggle={onToggle}
        onDelete={onDelete}
        onUpdate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '标记完成：完成作业' }));
    fireEvent.click(screen.getByRole('button', { name: '删除：完成作业' }));

    expect(onToggle).toHaveBeenCalledWith('todo-1');
    expect(onDelete).toHaveBeenCalledWith('todo-1');
  });

  it('edits a todo title and reminder time inline', () => {
    const onUpdate = vi.fn();
    render(
      <TodoPanel
        dateLabel="2026年6月10日"
        todos={todos}
        onAdd={vi.fn()}
        onClose={vi.fn()}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={onUpdate}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '编辑：完成作业' }));
    fireEvent.change(screen.getByLabelText('修改任务名称'), { target: { value: '修改后的任务' } });
    fireEvent.change(screen.getByLabelText('修改提醒时间'), { target: { value: '16:30' } });
    fireEvent.click(screen.getByRole('button', { name: '保存待办修改' }));

    expect(onUpdate).toHaveBeenCalledWith('todo-1', { title: '修改后的任务', reminderTime: '16:30' });
  });

  it('closes the todo panel from the header', () => {
    const onClose = vi.fn();
    render(
      <TodoPanel
        dateLabel="2026年6月10日"
        todos={[]}
        onAdd={vi.fn()}
        onClose={onClose}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '关闭今日待办' }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
