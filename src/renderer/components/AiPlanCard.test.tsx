import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiPlanDraft, AppSnapshot, Todo } from '../../shared/types';
import { desktopApi } from '../platform/desktopApi';
import { AiPlanCard } from './AiPlanCard';

vi.mock('../platform/desktopApi', () => ({
  desktopApi: {
    ai: {
      generateDailyPlan: vi.fn(),
      applyPlan: vi.fn()
    }
  }
}));

const existingTodos: Todo[] = [
  {
    id: 'todo-1',
    title: '已有任务',
    reminderTime: '08:30',
    soundEnabled: true,
    completed: false,
    priority: 'medium',
    remindedAt: null,
    createdAt: '2026-06-20T08:00:00.000Z'
  }
];

const draft: AiPlanDraft = {
  summary: '建议先复习，再整理文档。',
  todos: [
    {
      title: '复习 Java',
      reminderTime: '09:30',
      priority: 'high',
      soundEnabled: true,
      reason: '上午适合处理重点内容'
    },
    {
      title: '完善 README',
      reminderTime: null,
      priority: 'medium',
      soundEnabled: true,
      reason: '跟在复习后处理'
    }
  ],
  warnings: ['晚上运动未设置明确时间']
};

const snapshot: AppSnapshot = {
  today: '2026-06-20',
  todos: [],
  reminders: [],
  settings: {
    general: {
      autoLaunch: true,
      ballOpacity: 0.7,
      ballSize: 'medium',
      rememberPosition: true,
      soundEnabled: true,
      soundFilePath: null
    },
    todo: { advanceReminderMinutes: 10 },
    ballPosition: { x: 0, y: 0 }
  }
};

function renderCard(overrides: Partial<React.ComponentProps<typeof AiPlanCard>> = {}) {
  return render(
    <AiPlanCard
      todos={existingTodos}
      onSnapshotChange={vi.fn()}
      {...overrides}
    />
  );
}

describe('AiPlanCard', () => {
  const aiApi = vi.mocked(desktopApi.ai);

  beforeEach(() => {
    vi.clearAllMocks();
    aiApi.generateDailyPlan.mockResolvedValue(draft);
    aiApi.applyPlan.mockResolvedValue(snapshot);
  });

  it('disables generate button when input is empty', () => {
    renderCard();

    expect(screen.getByRole('button', { name: '生成计划' })).toBeDisabled();
  });

  it('can be closed by its parent panel', () => {
    const onClose = vi.fn();
    renderCard({ onClose });

    fireEvent.click(screen.getByRole('button', { name: '关闭 AI 计划' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('can generate a plan once input has content', async () => {
    renderCard();

    fireEvent.change(screen.getByLabelText('今天要做的事'), {
      target: { value: '上午复习 Java，下午完善 README' }
    });
    fireEvent.click(screen.getByRole('button', { name: '生成计划' }));

    await waitFor(() => {
      expect(aiApi.generateDailyPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          userInput: '上午复习 Java，下午完善 README',
          existingTodos: [
            {
              title: '已有任务',
              reminderTime: '08:30',
              priority: 'medium',
              completed: false
            }
          ]
        })
      );
    });
  });

  it('shows loading state while generating', async () => {
    let resolveDraft: (value: AiPlanDraft) => void = () => undefined;
    aiApi.generateDailyPlan.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDraft = resolve;
      })
    );
    renderCard();

    fireEvent.change(screen.getByLabelText('今天要做的事'), {
      target: { value: '上午复习 Java' }
    });
    fireEvent.click(screen.getByRole('button', { name: '生成计划' }));

    expect(screen.getByRole('button', { name: '生成中...' })).toBeDisabled();
    resolveDraft(draft);
    expect(await screen.findByText('AI 计划预览')).toBeInTheDocument();
  });

  it('shows generated todos preview', async () => {
    renderCard();

    fireEvent.change(screen.getByLabelText('今天要做的事'), {
      target: { value: '上午复习 Java，下午完善 README' }
    });
    fireEvent.click(screen.getByRole('button', { name: '生成计划' }));

    expect(await screen.findByText('AI 计划预览')).toBeInTheDocument();
    expect(screen.getByText('复习 Java')).toBeInTheDocument();
    expect(screen.getByText('09:30')).toBeInTheDocument();
    expect(screen.getByText('无提醒')).toBeInTheDocument();
    expect(screen.getByText('上午适合处理重点内容')).toBeInTheDocument();
    expect(screen.getByText('晚上运动未设置明确时间')).toBeInTheDocument();
  });

  it('can uncheck one generated todo before importing', async () => {
    renderCard();

    fireEvent.change(screen.getByLabelText('今天要做的事'), {
      target: { value: '上午复习 Java，下午完善 README' }
    });
    fireEvent.click(screen.getByRole('button', { name: '生成计划' }));

    const readmeCheckbox = await screen.findByRole('checkbox', {
      name: '选择导入：完善 README'
    });
    fireEvent.click(readmeCheckbox);
    fireEvent.click(screen.getByRole('button', { name: '导入选中' }));

    await waitFor(() => {
      expect(aiApi.applyPlan).toHaveBeenCalledWith({
        todos: [draft.todos[0]]
      });
    });
  });

  it('calls onSnapshotChange after importing selected todos', async () => {
    const onSnapshotChange = vi.fn();
    renderCard({ onSnapshotChange });

    fireEvent.change(screen.getByLabelText('今天要做的事'), {
      target: { value: '上午复习 Java' }
    });
    fireEvent.click(screen.getByRole('button', { name: '生成计划' }));
    fireEvent.click(await screen.findByRole('button', { name: '导入选中' }));

    await waitFor(() => {
      expect(aiApi.applyPlan).toHaveBeenCalledWith({ todos: draft.todos });
      expect(onSnapshotChange).toHaveBeenCalledWith(snapshot);
    });
    expect(screen.getByText('已导入')).toBeInTheDocument();
  });

  it('shows validation when importing without selected todos', async () => {
    renderCard();

    fireEvent.change(screen.getByLabelText('今天要做的事'), {
      target: { value: '上午复习 Java，下午完善 README' }
    });
    fireEvent.click(screen.getByRole('button', { name: '生成计划' }));

    fireEvent.click(await screen.findByRole('checkbox', { name: '选择导入：复习 Java' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '选择导入：完善 README' }));
    fireEvent.click(screen.getByRole('button', { name: '导入选中' }));

    expect(screen.getByText('请选择至少一条任务。')).toBeInTheDocument();
    expect(aiApi.applyPlan).not.toHaveBeenCalled();
  });

  it('shows a friendly message when API key is missing', async () => {
    aiApi.generateDailyPlan.mockRejectedValueOnce(new Error('请先配置 AI API Key'));
    renderCard();

    fireEvent.change(screen.getByLabelText('今天要做的事'), {
      target: { value: '上午复习 Java' }
    });
    fireEvent.click(screen.getByRole('button', { name: '生成计划' }));

    expect(await screen.findByText('请先在 AI 设置中配置 API Key')).toBeInTheDocument();
  });

  it('shows generate and apply failures', async () => {
    aiApi.generateDailyPlan.mockRejectedValueOnce(new Error('模型返回格式异常'));
    const { rerender } = renderCard();

    fireEvent.change(screen.getByLabelText('今天要做的事'), {
      target: { value: '上午复习 Java' }
    });
    fireEvent.click(screen.getByRole('button', { name: '生成计划' }));
    expect(await screen.findByText('模型返回格式异常，请重试')).toBeInTheDocument();

    aiApi.generateDailyPlan.mockResolvedValueOnce(draft);
    aiApi.applyPlan.mockRejectedValueOnce(new Error('磁盘写入失败'));
    rerender(<AiPlanCard todos={existingTodos} onSnapshotChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('今天要做的事'), {
      target: { value: '下午完善 README' }
    });
    fireEvent.click(screen.getByRole('button', { name: '生成计划' }));
    fireEvent.click(await screen.findByRole('button', { name: '导入选中' }));

    expect(await screen.findByText('导入失败：磁盘写入失败')).toBeInTheDocument();
  });
});
