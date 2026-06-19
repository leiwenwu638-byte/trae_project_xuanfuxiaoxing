import { convertFileSrc } from '@tauri-apps/api/core';

/**
 * `public/sound-default.wav` —— 内置默认提示音。
 *
 *   - Vite / Tauri 都会把 `public/` 里的文件原样发布到站点根。
 *   - 开发期 `npm run dev:vite` 直接 serve；生产期 `vite build` 拷到 `dist/`。
 *   - Tauri 把 `dist/` 全部作为 webview 资源，路径 `/sound-default.wav`
 *     永远可解析；不需要 `import` 资源（避免 vitest 无法解析 asset 路径）。
 *
 * 旧版本 `import defaultSoundUrl from '../../assets/...wav'` 在 vitest jsdom
 * 环境里没有 build pipeline → "Failed to resolve"。改用 public/ 资源后，
 * 开发 / 生产 / 单测三套环境都走同一段字符串拼接代码。
 */
export const DEFAULT_SOUND_URL = '/sound-default.wav';

/**
 * `convertFileSrc` 的注入版本，便于测试。
 *
 * 默认实现是 `@tauri-apps/api/core` 的 `convertFileSrc`，把绝对路径
 * `C:\xxx\foo.wav` 转成 WebView2 可加载的 `http://asset.localhost/...`
 * 协议 URL。本地 app_data_dir/sounds/ 下的自定义提示音必须走它，
 * 否则 `<audio src="C:\\...">` 在 WebView 里直接打不开。
 */
export type ConvertFileSrcFn = (path: string) => string;
export const defaultConvertFileSrc: ConvertFileSrcFn = convertFileSrc;

/**
 * 解析 `soundSrc`，把业务占位值映射到真实可播放的音频 URL。
 *
 * 输入约定（来自 `scheduler.rs` / `tray.rs` / 前端 `desktopApi`）：
 *   - `null` / `undefined` / `""` → 不播放（用户未开启 / 测试弹窗）；
 *   - `"default"` → 后端 `build_new_todo` 在 `sound_enabled` 时传入的字面量，
 *     映射到 `/sound-default.wav`（public/ 默认音）；
 *   - `http://` / `https://` / `data:` / `blob:` / `/...` → 原样使用；
 *   - 其它（绝对 Windows / macOS / Linux 路径）→ 走 `convertFileSrc`
 *     转成 WebView2 可加载的 `http://asset.localhost/...`。
 *
 * 关键：旧实现直接把 `soundSrc` 喂给 `<audio src=...>`。
 *   * 当值为 `"default"` 时，前端会去请求 `/default` 资源 → 404 静默失败
 *     → 用户感受是"提醒弹窗没声音"；
 *   * 当值为本地绝对路径时，WebView2 / 浏览器都不允许 `file://` 跨源加载
 *     → 静默失败。
 */
export function resolveSoundSrc(
  soundSrc: string | null | undefined,
  convert: ConvertFileSrcFn = defaultConvertFileSrc
): string | null {
  if (!soundSrc) return null;
  if (soundSrc === 'default') return DEFAULT_SOUND_URL;
  if (
    soundSrc.startsWith('http://') ||
    soundSrc.startsWith('https://') ||
    soundSrc.startsWith('data:') ||
    soundSrc.startsWith('blob:') ||
    soundSrc.startsWith('/')
  ) {
    return soundSrc;
  }
  // 绝对本地路径 → Tauri asset 协议
  return convert(soundSrc);
}
