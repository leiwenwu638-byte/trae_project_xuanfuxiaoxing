# 悬浮小醒

> 轻量级 Tauri 托盘常驻式学习工作节律助手。

## 项目简介

「悬浮小醒」是一款面向**学习 / 工作节律管理**的桌面小工具。常驻系统托盘，
不抢桌面空间，专注三件事：

- **今日待办**：把今天要做的事按优先级排好，按时弹窗提醒；
- **健康节律**：定时循环提醒喝水、起身、远眺，避免久坐；
- **节律保持**：配合桌面弹窗 + 系统托盘入口，养成稳定的工作节奏。

当前版本专注于基础能力收口：本地 JSON 持久化、托盘常驻、滚轮式时间选择器、
桌面弹窗、调度器。**不实现** AI 学习计划生成、悬浮球等大功能。

## 技术栈

| 类别       | 选型                                                                  |
| ---------- | --------------------------------------------------------------------- |
| 桌面框架   | [Tauri 2](https://tauri.app/)（Rust + WebView2）                      |
| 前端框架   | [React 19](https://react.dev/) + [TypeScript 5](https://www.typescriptlang.org/) |
| 构建工具   | [Vite 7](https://vitejs.dev/)                                         |
| 样式方案   | [Tailwind CSS 3](https://tailwindcss.com/) + 少量手写 CSS             |
| 单元测试   | [Vitest 4](https://vitest.dev/) + [Testing Library](https://testing-library.com/) |
| 图标库     | [lucide-react](https://lucide.dev/)                                   |
| 持久化     | 本地 JSON（Rust `storage.rs` 自实现）                                  |

## 核心功能

- **今日待办**：新增 / 编辑 / 删除 / 标记完成；支持四级优先级（critical / high / medium / low）；
- **任务优先级**：列表项左侧用 `PriorityBadge` 视觉化，编辑表单内 `PrioritySelector` 切换；
- **滚轮式提醒时间选择器（`TimeWheelPicker`）**：双列滚轮 + 键盘上下方向键，输出 `HH:mm`；
- **今日计划提前提醒**：在任务时间前 **10 分钟**弹出 `ReminderPopup` 一次；到点不再提醒；过点不补提醒；
- **健康节律循环提醒**：周期性提醒（5–480 分钟），进度条 + 剩余时间实时刷新；
- **`ReminderPopup` 桌面弹窗**：独立 webview 窗口，播放默认提示音（`public/sound-default.wav`）；
- **可自定义提示音**：在"今日计划 / 健康节律"顶部点"更换"上传 wav / mp3 / ogg（≤ 5MB），
  写到 `app_data_dir/sounds/`，UI 只显示"提示音：默认 / 自定义"，不暴露底层文件名；
  两页面共用同一设置；点"恢复默认"清回默认音；
- **AI 模型设置（第一阶段）**：今日计划顶部提供"AI 设置"入口，可配置 DeepSeek、OpenAI
  或自定义 OpenAI-compatible 接口，支持保存 / 清除 API Key 和测试连接；本阶段不生成今日计划；
- **系统托盘常驻**：托盘菜单"今日计划 / 健康节律 / 显示提醒测试 / 退出"，未关闭窗口也可继续工作；
- **本地 JSON 持久化**：所有数据落盘 `app_data_dir`，无任何云端依赖。

## AI 设置说明

当前 AI 功能仅完成第一阶段：模型配置和连接测试。暂未实现 AI 生成今日计划、AI 聊天、
AI 健康节律推荐，也不会自动写入待办。

- 支持服务商：DeepSeek、OpenAI、自定义 OpenAI-compatible。
- 默认 DeepSeek 配置：`baseUrl = https://api.deepseek.com`，`model = deepseek-v4-flash`。
- 本软件不内置 API Key。API Key 由用户自行到对应平台申请并填入，属于 BYOK
  （Bring Your Own Key）模式。
- API Key 不会显示在页面中，也不会进入 `AppSnapshot` 或普通设置 JSON。
- 不要把 API Key 写入源码、README、`.env` 后提交到 GitHub。

## 本地运行

依赖：

- Node.js ≥ 20
- Rust 工具链（stable，`cargo`）
- Windows 10/11 + WebView2（系统自带或运行时安装）

```bash
# 安装前端依赖
npm install

# 启动 Tauri 开发模式（会自动拉起 Vite + Rust 编译）
npm run tauri:dev
```

`tauri:dev` 等价于 `tauri dev`：Tauri 会先执行 `npm run dev:vite`（Vite 起在
`http://127.0.0.1:5173`）再拉起 Rust 进程、加载前端页面。

> ⚠️ 首次启动 `npm run tauri:dev` 时 Tauri 会冷编译 Rust 依赖（chrono /
> tauri / uuid ...），控制台会卡在 `Compiling` 数分钟，**这是预期行为**；
> 后续 `tauri dev` 会复用 `src-tauri/target` 缓存（可通过
> `CARGO_TARGET_DIR` 改路径），启动会快很多；不要手动删除 `src-tauri/target`，
> 否则下次会重新冷编译 Rust 依赖。实际"打开窗口后页面加载慢"
> 还是 Rust 编译慢，可开启 DevTools Console 看前端 `console.info('[App] getSnapshot total=...ms')`
> ——这条日志只在 `>= 50ms` 时打印，是 Rust 读盘 + IPC + setState 的总耗时，
> 正常 < 50ms（不打印）。
>
> 开发时建议保持 `npm run tauri:dev` 进程运行；只改前端 React / CSS 时，Vite HMR
> 会直接热更新页面，不需要重启 Tauri。只有修改 Rust 代码或 Tauri 配置后，才需要等待
> Rust 重新编译。

## 前端检查

```bash
# TypeScript 类型检查（不输出文件）
npm run typecheck

# 单元测试（一次跑完所有 .test.tsx / .test.ts，不进入 watch 模式）
npm test

# 监听模式（开发期间使用）
npm run test:watch
```

## Rust 检查

```bash
cd src-tauri

# 格式化
cargo fmt

# 类型 + 编译检查
cargo check

# 单元测试
cargo test
```

## 打包命令

```bash
# 在项目根目录执行，会调用 tauri build，输出可分发的安装包
npm run tauri:build
```

产物默认在 `src-tauri/target/release/bundle/` 下，按平台产生 `.exe` / `.msi`
（Windows）、`.dmg`（macOS）、`.AppImage` / `.deb`（Linux）等。

> ⚠️ `tauri build` 前**建议**先收紧 `src-tauri/tauri.conf.json` 中的
> `security.csp`（当前为 `null` 仅用于开发）。

## 项目结构

```text
悬浮小醒/
├── assets/                        # 图标、提示音等静态资源
│   ├── app-icon.ico
│   ├── app-icon.png
│   └── xianchen_ice_sparkle_1p5s.wav
├── scripts/                       # 构建 / 维护脚本（如图标生成）
│   └── generate-app-icon.ps1
├── src/                           # 前端
│   ├── renderer/                  # 渲染层（React 入口）
│   │   ├── components/            # 业务组件（TodoPanel / HealthWindow / ReminderPopup / TimeWheelPicker ...）
│   │   ├── platform/              # Tauri 适配层（desktopApi）
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── styles.css
│   └── shared/                    # 跨进程 / 跨窗口共享的类型与服务
│       ├── types.ts               # IPC 数据契约
│       ├── reminderService.ts     # 健康提醒进度计算
│       ├── todoService.ts         # 今日待办排序 / 校验
│       ├── reminderContent.ts     # 默认提醒文案
│       ├── defaults.ts            # 默认值（优先级 / 时间）
│       └── date.ts
├── src-tauri/                     # Rust 后端
│   ├── capabilities/default.json  # Tauri 权限声明
│   ├── src/
│   │   ├── main.rs                # 入口
│   │   ├── lib.rs                 # 业务装配（窗口 / 托盘 / 命令注册）
│   │   ├── commands.rs            # #[tauri::command] 实现
│   │   ├── models.rs              # 数据结构 + 校验
│   │   ├── scheduler.rs           # 健康提醒循环调度
│   │   ├── state.rs               # AppState（Mutex<AppSnapshot>）
│   │   ├── storage.rs             # JSON 持久化
│   │   ├── tray.rs                # 系统托盘
│   │   └── window_manager.rs      # 窗口分类 / 尺寸 / 装饰
│   ├── tauri.conf.json
│   └── Cargo.toml
├── index.html                     # Vite 入口
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vitest.config.ts
```

## 开发说明

- **不实现悬浮球**：常驻入口走**系统托盘**（托盘菜单可一键唤起"今日计划"
  / "健康节律"窗口）。这避免了 WebView 浮窗在不同 DPI 下的尺寸漂移、点击
  穿透、跨进程焦点切换等老问题；
- **数据本地保存**：所有用户数据（todos / reminders）落在 Tauri `app_data_dir`
  下的 `todos.json` / `reminders.json`；卸载应用前手动 `cp` 出来即可迁移；
- **无外部依赖**：不联网、不上传、不引入第三方统计 / 分析；适合作为参赛作品
  做静态审查；
- **后续可扩展**：在 `src/shared/reminderContent.ts` 增加 `createAIReminderPlan`
  等函数 + Tauri 端对应命令即可补 AI 学习计划生成（**本版本不实现**）；
- **设计取舍**：详情见 `src/renderer/components/common/ActionButton.tsx` 顶部
  JSDoc（统一按钮交互）、`src-tauri/src/window_manager.rs` 顶部 rustdoc
  （窗口尺寸 / 装饰策略）。

## 历史说明

本项目早期曾经基于 Electron 试做原型，后已整体迁移到 Tauri 2。当前的
**运行方式、构建命令、技术栈**以上文为准；`package.json` 中**已不再保留**
任何 Electron 相关 scripts / 依赖。

## License

详见 [LICENSE](LICENSE)。
