import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { AiProviderType, AiPublicConfig } from '../../shared/types';
import { desktopApi } from '../platform/desktopApi';
import { ActionButton } from './common/ActionButton';

type AiSettingsDialogProps = {
  onClose: () => void;
};

const PROVIDER_LABELS: Record<AiProviderType, string> = {
  deepseek: 'DeepSeek',
  openai: 'OpenAI',
  custom_openai_compatible: '自定义兼容接口'
};

const PROVIDER_DEFAULTS: Record<AiProviderType, Pick<AiPublicConfig, 'baseUrl' | 'model'>> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash'
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: ''
  },
  custom_openai_compatible: {
    baseUrl: '',
    model: ''
  }
};

const DEFAULT_CONFIG: AiPublicConfig = {
  enabled: false,
  provider: 'deepseek',
  baseUrl: PROVIDER_DEFAULTS.deepseek.baseUrl,
  model: PROVIDER_DEFAULTS.deepseek.model,
  apiKeySaved: false
};

type StatusTone = 'muted' | 'success' | 'error';

function statusClass(tone: StatusTone): string {
  if (tone === 'success') return 'border-assistant-success/30 bg-green-50 text-assistant-success';
  if (tone === 'error') return 'border-assistant-warning/30 bg-orange-50 text-assistant-warning';
  return 'border-assistant-line bg-assistant-wash text-assistant-muted';
}

function normalizeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return '操作失败，请稍后重试';
}

export function AiSettingsDialog({ onClose }: AiSettingsDialogProps) {
  const [provider, setProvider] = useState<AiProviderType>(DEFAULT_CONFIG.provider);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_CONFIG.baseUrl);
  const [model, setModel] = useState(DEFAULT_CONFIG.model);
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('正在加载 AI 设置');
  const [tone, setTone] = useState<StatusTone>('muted');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    desktopApi.ai
      .getConfig()
      .then((config) => {
        if (!alive) return;
        setProvider(config.provider);
        setBaseUrl(config.baseUrl);
        setModel(config.model);
        setApiKeySaved(config.apiKeySaved);
        setMessage(config.apiKeySaved ? 'API Key 已保存' : '未配置 API Key');
        setTone('muted');
      })
      .catch((error) => {
        if (!alive) return;
        setMessage(normalizeError(error));
        setTone('error');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const keyStatus = useMemo(
    () => (apiKeySaved ? 'API Key：已保存' : '未配置 API Key'),
    [apiKeySaved]
  );

  function changeProvider(nextProvider: AiProviderType) {
    const defaults = PROVIDER_DEFAULTS[nextProvider];
    setProvider(nextProvider);
    setBaseUrl(defaults.baseUrl);
    setModel(defaults.model);
    setMessage(apiKeySaved ? 'API Key 已保存' : '未配置 API Key');
    setTone('muted');
  }

  function currentSaveInput() {
    const trimmedKey = apiKey.trim();
    return {
      provider,
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      ...(trimmedKey ? { apiKey: trimmedKey } : {})
    };
  }

  function applyPublicConfig(config: AiPublicConfig) {
    setProvider(config.provider);
    setBaseUrl(config.baseUrl);
    setModel(config.model);
    setApiKeySaved(config.apiKeySaved);
    setApiKey('');
  }

  async function saveConfig(event?: FormEvent) {
    event?.preventDefault();
    setSaving(true);
    setMessage('正在保存配置');
    setTone('muted');
    try {
      const config = await desktopApi.ai.saveConfig(currentSaveInput());
      applyPublicConfig(config);
      setMessage('配置已保存');
      setTone('success');
    } catch (error) {
      setMessage(normalizeError(error));
      setTone('error');
    } finally {
      setSaving(false);
    }
  }

  async function clearApiKey() {
    setSaving(true);
    setMessage('正在清除 API Key');
    setTone('muted');
    try {
      const config = await desktopApi.ai.clearApiKey();
      setProvider(config.provider);
      setBaseUrl(config.baseUrl);
      setModel(config.model);
      setApiKeySaved(config.apiKeySaved);
      setApiKey('');
      setMessage('未配置 API Key');
      setTone('muted');
    } catch (error) {
      setMessage(normalizeError(error));
      setTone('error');
    } finally {
      setSaving(false);
    }
  }

  async function saveAndTestConnection() {
    setTesting(true);
    setMessage('保存并测试中...');
    setTone('muted');
    try {
      const config = await desktopApi.ai.saveConfig(currentSaveInput());
      applyPublicConfig(config);
      const result = await desktopApi.ai.testConnection();
      setMessage(result.message);
      setTone(result.ok ? 'success' : 'error');
    } catch (error) {
      setMessage(normalizeError(error));
      setTone('error');
    } finally {
      setTesting(false);
    }
  }

  const busy = loading || saving || testing;

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 px-4"
      role="dialog"
    >
      <form
        className="w-full max-w-[360px] rounded-lg border border-assistant-line bg-white p-4 shadow-xl"
        onSubmit={saveConfig}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-assistant-ink">AI 模型设置</h2>
            <p className="mt-0.5 text-[11px] text-assistant-muted">仅配置模型连接，不生成计划</p>
          </div>
          <ActionButton disabled={busy} variant="ghost" size="sm" onClick={onClose}>
            关闭
          </ActionButton>
        </div>

        <div className="space-y-3">
          <label className="block text-[11px] text-assistant-muted">
            服务商
            <select
              aria-label="服务商"
              className="mt-1 h-8 w-full rounded-md border border-assistant-line bg-white px-2 text-[13px] text-assistant-ink outline-none focus:border-assistant-accent/70"
              disabled={busy}
              value={provider}
              onChange={(event) => changeProvider(event.target.value as AiProviderType)}
            >
              {Object.entries(PROVIDER_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-[11px] text-assistant-muted">
            Base URL
            <input
              aria-label="Base URL"
              className="mt-1 h-8 w-full rounded-md border border-assistant-line bg-white px-2 text-[13px] text-assistant-ink outline-none focus:border-assistant-accent/70"
              disabled={busy}
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </label>

          <label className="block text-[11px] text-assistant-muted">
            模型名称
            <input
              aria-label="模型名称"
              className="mt-1 h-8 w-full rounded-md border border-assistant-line bg-white px-2 text-[13px] text-assistant-ink outline-none focus:border-assistant-accent/70"
              disabled={busy}
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
          </label>

          <div className="space-y-1.5">
            <div className="text-[11px] text-assistant-muted">{keyStatus}</div>
            <label className="block text-[11px] text-assistant-muted">
              API Key
              <input
                aria-label="API Key"
                autoComplete="off"
                className="mt-1 h-8 w-full rounded-md border border-assistant-line bg-white px-2 text-[13px] text-assistant-ink outline-none focus:border-assistant-accent/70"
                disabled={busy}
                placeholder={apiKeySaved ? '输入新的 API Key 后保存' : '输入 API Key'}
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
              />
            </label>
          </div>

          <p className={`rounded-md border px-2 py-1.5 text-[11px] ${statusClass(tone)}`}>
            {message}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <ActionButton
            disabled={busy}
            variant="muted"
            size="sm"
            onClick={saveAndTestConnection}
          >
            {testing ? '保存并测试中...' : '保存并测试'}
          </ActionButton>
          <ActionButton disabled={busy || !apiKeySaved} variant="danger" size="sm" onClick={clearApiKey}>
            清除 Key
          </ActionButton>
          <ActionButton disabled={busy} variant="primary" size="sm" type="submit">
            保存配置
          </ActionButton>
        </div>
      </form>
    </div>
  );
}
