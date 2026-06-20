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

  it('renders a saved key as a password mask without redundant status copy', async () => {
    render(<AiSettingsDialog onClose={vi.fn()} />);

    expect(await screen.findByText('AI 模型设置')).toBeInTheDocument();
    expect(screen.queryByText('仅配置模型连接，不生成计划')).toBeNull();
    expect(screen.queryByText('API Key：已保存')).toBeNull();
    expect(screen.queryByText('API Key 已保存')).toBeNull();
    expect(screen.queryByText(/real-secret/i)).toBeNull();
    expect(screen.getByLabelText('API Key')).toHaveValue('********');
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

    await screen.findByDisplayValue('********');
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

  it('does not send apiKey when the saved key mask was not edited', async () => {
    render(<AiSettingsDialog onClose={vi.fn()} />);

    await screen.findByDisplayValue('********');
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => {
      expect(aiApi.saveConfig).toHaveBeenCalledWith({
        provider: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash'
      });
    });
  });

  it('clears the mask on focus and only sends a newly typed API key', async () => {
    render(<AiSettingsDialog onClose={vi.fn()} />);

    const input = await screen.findByDisplayValue('********');
    fireEvent.focus(input);
    expect(input).toHaveValue('');

    fireEvent.change(input, { target: { value: 'new-secret-key' } });
    fireEvent.click(screen.getByRole('button', { name: '保存配置' }));

    await waitFor(() => {
      expect(aiApi.saveConfig).toHaveBeenCalledWith({
        provider: 'deepseek',
        baseUrl: 'https://api.deepseek.com',
        model: 'deepseek-v4-flash',
        apiKey: 'new-secret-key'
      });
    });
  });

  it('clears the saved API key', async () => {
    render(<AiSettingsDialog onClose={vi.fn()} />);

    await screen.findByDisplayValue('********');
    fireEvent.click(screen.getByRole('button', { name: '清除 Key' }));

    await waitFor(() => {
      expect(aiApi.clearApiKey).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByLabelText('API Key')).toHaveValue('');
    expect(screen.queryByDisplayValue('********')).toBeNull();
  });

  it('shows test connection success and failure messages', async () => {
    render(<AiSettingsDialog onClose={vi.fn()} />);

    await screen.findByDisplayValue('********');
    fireEvent.click(screen.getByRole('button', { name: '保存并测试' }));
    expect(await screen.findByText('连接成功')).toBeInTheDocument();

    expect(aiApi.saveConfig.mock.invocationCallOrder[0]).toBeLessThan(
      aiApi.testConnection.mock.invocationCallOrder[0]
    );
  });

  it('saves current form values before testing connection', async () => {
    render(<AiSettingsDialog onClose={vi.fn()} />);

    await screen.findByDisplayValue('********');
    fireEvent.change(screen.getByLabelText('服务商'), {
      target: { value: 'custom_openai_compatible' }
    });
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://example.test/v1' }
    });
    fireEvent.change(screen.getByLabelText('模型名称'), { target: { value: 'model-x' } });
    fireEvent.focus(screen.getByLabelText('API Key'));
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'new-key' } });

    fireEvent.click(screen.getByRole('button', { name: '保存并测试' }));

    await waitFor(() => {
      expect(aiApi.saveConfig).toHaveBeenCalledWith({
        provider: 'custom_openai_compatible',
        baseUrl: 'https://example.test/v1',
        model: 'model-x',
        apiKey: 'new-key'
      });
    });
    expect(aiApi.saveConfig.mock.invocationCallOrder[0]).toBeLessThan(
      aiApi.testConnection.mock.invocationCallOrder[0]
    );
    expect(aiApi.testConnection).toHaveBeenCalledTimes(1);
  });

  it('does not test connection when saving the current form fails', async () => {
    aiApi.saveConfig.mockRejectedValueOnce(new Error('Base URL 不能为空'));
    render(<AiSettingsDialog onClose={vi.fn()} />);

    await screen.findByDisplayValue('********');
    fireEvent.change(screen.getByLabelText('Base URL'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '保存并测试' }));

    expect(await screen.findByText('Base URL 不能为空')).toBeInTheDocument();
    expect(aiApi.testConnection).not.toHaveBeenCalled();
  });

  it('shows backend test failure after save succeeds', async () => {
    aiApi.getConfig.mockResolvedValue(savedConfig);
    aiApi.testConnection.mockResolvedValueOnce({
      ok: false,
      message: '连接失败，请检查 API Key / Base URL / 模型名称'
    });
    render(<AiSettingsDialog onClose={vi.fn()} />);

    await screen.findByDisplayValue('********');
    fireEvent.click(screen.getByRole('button', { name: '保存并测试' }));
    expect(
      await screen.findByText('连接失败，请检查 API Key / Base URL / 模型名称')
    ).toBeInTheDocument();
  });
});
