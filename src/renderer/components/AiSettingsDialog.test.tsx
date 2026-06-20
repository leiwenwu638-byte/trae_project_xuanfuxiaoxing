import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiPublicConfig } from '../../shared/types';
import { desktopApi } from '../platform/desktopApi';
import { AiSettingsDialog } from './AiSettingsDialog';

vi.mock('../platform/desktopApi', () => ({
  desktopApi: {
    ai: {
      getConfig: vi.fn(),
      saveConfig: vi.fn(),
      clearApiKey: vi.fn(),
      testConnection: vi.fn()
    }
  }
}));

const savedConfig: AiPublicConfig = {
  enabled: true,
  provider: 'deepseek',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  apiKeySaved: true
};

const unsavedConfig: AiPublicConfig = {
  ...savedConfig,
  enabled: false,
  apiKeySaved: false
};

describe('AiSettingsDialog', () => {
  const aiApi = vi.mocked(desktopApi.ai);

  beforeEach(() => {
    vi.clearAllMocks();
    aiApi.getConfig.mockResolvedValue(savedConfig);
    aiApi.saveConfig.mockResolvedValue(savedConfig);
    aiApi.clearApiKey.mockResolvedValue(unsavedConfig);
    aiApi.testConnection.mockResolvedValue({ ok: true, message: '连接成功' });
  });

  it('renders saved key status without exposing a real API key', async () => {
    render(<AiSettingsDialog onClose={vi.fn()} />);

    expect(await screen.findByText('AI 模型设置')).toBeInTheDocument();
    expect(screen.getByText('API Key：已保存')).toBeInTheDocument();
    expect(screen.queryByText(/real-secret/i)).toBeNull();
    expect(screen.getByLabelText('API Key')).toHaveValue('');
  });

  it('applies reasonable defaults when provider changes', async () => {
    render(<AiSettingsDialog onClose={vi.fn()} />);

    await screen.findByDisplayValue('https://api.deepseek.com');

    fireEvent.change(screen.getByLabelText('服务商'), { target: { value: 'openai' } });
    expect(screen.getByLabelText('Base URL')).toHaveValue('https://api.openai.com/v1');
    expect(screen.getByLabelText('模型名称')).toHaveValue('');

    fireEvent.change(screen.getByLabelText('服务商'), {
      target: { value: 'deepseek' }
    });
    expect(screen.getByLabelText('Base URL')).toHaveValue('https://api.deepseek.com');
    expect(screen.getByLabelText('模型名称')).toHaveValue('deepseek-v4-flash');
  });

  it('saves config with a newly typed API key', async () => {
    render(<AiSettingsDialog onClose={vi.fn()} />);

    await screen.findByText('API Key：已保存');
    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: 'test-api-key' }
    });
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => {
      expect(aiApi.saveConfig).toHaveBeenCalledWith({
        provider: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        apiKey: 'test-api-key'
      });
    });
  });

  it('clears the saved API key', async () => {
    render(<AiSettingsDialog onClose={vi.fn()} />);

    await screen.findByText('API Key：已保存');
    fireEvent.click(screen.getByRole('button', { name: '清除 Key' }));

    await waitFor(() => {
      expect(aiApi.clearApiKey).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findAllByText('未配置 API Key')).toHaveLength(2);
  });

  it('shows test connection success and failure messages', async () => {
    const { rerender } = render(<AiSettingsDialog onClose={vi.fn()} />);

    await screen.findByText('API Key：已保存');
    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
    expect(await screen.findByText('连接成功')).toBeInTheDocument();

    aiApi.getConfig.mockResolvedValue(savedConfig);
    aiApi.testConnection.mockResolvedValueOnce({
      ok: false,
      message: '连接失败，请检查 API Key / Base URL / 模型名称'
    });
    rerender(<AiSettingsDialog onClose={vi.fn()} />);

    await screen.findByText('API Key：已保存');
    fireEvent.click(screen.getByRole('button', { name: '测试连接' }));
    expect(
      await screen.findByText('连接失败，请检查 API Key / Base URL / 模型名称')
    ).toBeInTheDocument();
  });
});
