import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// `ReminderPopup` 内部走 `@tauri-apps/api/core` 的 `convertFileSrc`
// 把本地绝对路径转成 WebView2 可加载的 URL。jsdom 没有 Tauri runtime，
// 这里把它 stub 成"原样加前缀"，便于断言。
vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (input: string) => `asset://localhost/${input.replace(/\\/g, '/')}`
}));

import { ReminderPopup } from './ReminderPopup';

describe('ReminderPopup', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('maps the "default" sound source to the public default audio asset', () => {
    const { container } = render(
      <ReminderPopup body="活动一下" icon="💧" soundSrc="default" title="定时喝水" onClose={vi.fn()} />
    );

    const audio = container.querySelector('audio');
    expect(audio).toHaveAttribute('src', '/sound-default.wav');
    expect(audio).toHaveAttribute('autoplay');
  });

  it('passes http(s) / data / blob / absolute paths through unchanged', () => {
    // 这几种都已经是浏览器可加载的 URL，不需要再走 convertFileSrc
    const cases = [
      'https://cdn.example.com/ding.mp3',
      'http://localhost:5173/abc.wav',
      'data:audio/wav;base64,AAA',
      'blob:http://localhost/abc',
      '/relative/from/public.wav'
    ];
    for (const url of cases) {
      const { container, unmount } = render(
        <ReminderPopup body="活动一下" icon="💧" soundSrc={url} title="定时喝水" onClose={vi.fn()} />
      );
      const audio = container.querySelector('audio');
      expect(audio).toHaveAttribute('src', url);
      unmount();
    }
  });

  it('rewrites local absolute paths through convertFileSrc so the WebView can load them', () => {
    // `app_data_dir/sounds/foo.wav` 这种绝对路径 WebView2 直接 `<audio src=>` 加载不了，
    // 必须先经 Tauri 的 `convertFileSrc` 转成 `asset://localhost/...`。
    // 这里用正斜杠的绝对路径作为输入（避免 JSX 字符串里 `\\` 双重转义
    // 问题），mock 的 convertFileSrc 在前面拼 `asset://localhost/`。
    const absolutePath = 'C:/Users/me/sounds/water.wav';
    const { container } = render(
      <ReminderPopup body="活动一下" icon="💧" soundSrc={absolutePath} title="定时喝水" onClose={vi.fn()} />
    );
    const audio = container.querySelector('audio');
    expect(audio).toHaveAttribute('src', `asset://localhost/${absolutePath}`);
  });

  it('does not render an audio element when the sound source is empty or null', () => {
    const { container: c1 } = render(
      <ReminderPopup body="活动一下" icon="💧" soundSrc="" title="定时喝水" onClose={vi.fn()} />
    );
    expect(c1.querySelector('audio')).toBeNull();

    const { container: c2 } = render(
      <ReminderPopup body="活动一下" icon="💧" soundSrc={null} title="定时喝水" onClose={vi.fn()} />
    );
    expect(c2.querySelector('audio')).toBeNull();
  });

  it('logs a warning when audio.play() rejects', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // 真实 audio.play 在 jsdom 下不会真正调用；这里手工在原型上替换。
    const originalPlay = HTMLMediaElement.prototype.play;
    const playError = new Error('autoplay blocked');
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.reject(playError));

    render(
      <ReminderPopup body="活动一下" icon="💧" soundSrc="default" title="定时喝水" onClose={vi.fn()} />
    );
    // 等 microtask flush
    await Promise.resolve();
    await Promise.resolve();
    expect(warnSpy).toHaveBeenCalledWith('[ReminderPopup] audio play failed:', playError);

    HTMLMediaElement.prototype.play = originalPlay;
  });
});
