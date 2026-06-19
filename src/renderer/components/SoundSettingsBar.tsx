import { useRef } from 'react';
import { Music, RefreshCcw, Upload } from 'lucide-react';
import { ActionButton } from './common/ActionButton';

export type SoundSettingsBarProps = {
  /**
   * 全局提示音文件路径。`null` 表示当前使用内置默认提示音。
   * 来源：`AppSettings.general.soundFilePath`。
   */
  soundFilePath: string | null;
  /**
   * 用户选择音频文件后的回调。父组件负责把 File 写到 app_data_dir
   * 并把返回的真实路径写进 settings（见 App.tsx `handleSelectSound`）。
   */
  onSelectSound: (file: File) => void;
  /**
   * 用户点击"恢复默认"时调用。父组件负责把 settings.general.soundFilePath
   * 写回 null（见 App.tsx `handleResetSound`）。
   */
  onResetSound: () => void;
  /**
   * 测试用前缀。给 wrapper 一个稳定 data-testid，避免 TodoPanel / HealthWindow
   * 测试之间互相干扰。
   */
  testIdPrefix?: string;
};

/**
 * 全局提示音设置条。
 *
 * 设计目标：
 *   * 不暴露底层文件名（C:\xxx\sound.wav）给用户；
 *   * 状态只有两种：默认 / 自定义；
 *   * 用"更换"按钮触发 file input，"恢复默认"只在自定义时显示。
 *
 * 为什么不直接用 `<a href=file path>` 让浏览器下载后用户"自己保存"：
 *   * 用户期待"选个 wav → 立刻能听"，不是"选个 wav → 弹出下载 → 用户去
 *     找下载的文件 → 找不到"。
 *
 * 为什么不引入 Tauri dialog plugin：
 *   * 本阶段任务范围"不要引入大型 UI 框架 / 不要重写架构"；
 *   * `<input type="file">` 走 File API + arrayBuffer 已经能拿到文件内容，
 *     后续交给 Rust 写盘即可。
 */
export function SoundSettingsBar({
  soundFilePath,
  onSelectSound,
  onResetSound,
  testIdPrefix = 'sound-settings'
}: SoundSettingsBarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isCustom = soundFilePath !== null;

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // 重要：清空 value，否则同一文件第二次选不会触发 change
    event.target.value = '';
    if (file) onSelectSound(file);
  }

  return (
    <div
      data-testid={`${testIdPrefix}-bar`}
      className="no-drag flex flex-none items-center justify-between gap-2 border-b border-assistant-line bg-assistant-wash/60 px-4 py-1.5"
    >
      <div className="flex min-w-0 items-center gap-1.5 text-[12px]">
        <Music size={12} className="flex-none text-assistant-muted" />
        <span className="text-assistant-muted">提示音：</span>
        <span
          data-testid={`${testIdPrefix}-status`}
          className="truncate font-medium text-assistant-ink"
        >
          {isCustom ? '自定义' : '默认'}
        </span>
      </div>
      <div className="flex flex-none items-center gap-1">
        <ActionButton
          variant="muted"
          size="sm"
          icon={<Upload size={12} />}
          ariaLabel={isCustom ? '更换提示音' : '上传提示音'}
          onClick={() => fileInputRef.current?.click()}
        >
          {isCustom ? '更换' : '更换'}
        </ActionButton>
        {isCustom ? (
          <ActionButton
            variant="ghost"
            size="sm"
            icon={<RefreshCcw size={12} />}
            ariaLabel="恢复默认提示音"
            onClick={onResetSound}
          >
            恢复默认
          </ActionButton>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/wav,audio/mpeg,audio/ogg,.wav,.mp3,.ogg"
          className="hidden"
          data-testid={`${testIdPrefix}-file-input`}
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
