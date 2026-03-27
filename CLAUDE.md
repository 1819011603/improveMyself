# DevKit - 个人开发者效率工具

## 项目概述

跨平台（macOS 优先，后续支持 Windows）的桌面端开发者效率工具，用于统一管理脚本、定时任务、命令速查、代码片段等。

## 技术栈

- **框架**: Electron + Vue 3 + TypeScript
- **UI 组件库**: Element Plus（优先使用现有组件，不造轮子）
- **状态管理**: Pinia
- **本地存储**: SQLite（better-sqlite3）
- **脚本执行**: Node.js child_process（spawn，支持实时输出流）
- **终端展示**: xterm.js（内嵌终端，显示命令执行输出）
- **定时任务**: node-cron
- **构建工具**: Vite

## 开发规范

### 架构原则

- 单个文件处理独立的模块和功能
- 每个文件不超过 500 行，超过必须拆分
- 能用现有框架/库解决的，不造轮子
- 优先使用 Element Plus 提供的组件

### 代码风格

- 使用 TypeScript 严格模式
- Vue 组件使用 `<script setup lang="ts">` 语法
- 组件命名使用 PascalCase，文件命名使用 kebab-case
- 类型定义统一放在 `src/shared/types/` 目录
- 每个模块的 IPC 通信独立一个文件

### Electron IPC 与结构化克隆（强制）

（以下路径相对于本仓库中的 **`devkit/`** 应用目录，即 `devkit/src/...`。）

`ipcRenderer.invoke` / `webContents.send` 使用**结构化克隆**，不是 JSON。以下值**不能**跨进程传递，否则会报 **`An object could not be cloned`**：

- Vue 3 / Pinia 的**响应式对象**（内部为 `Proxy`）
- 函数、`Symbol`、大部分 **class 实例**、`Error`（勿直接当返回值传递）
- `Map` / `Set`（部分版本/场景下受限）、含循环引用的对象等

**项目内约定：**

1. **Preload（`devkit/src/preload/index.ts`）**  
   凡通过 `invoke` 传给主进程的**对象/数组**参数，必须先经 `cloneForIpc()`（定义在 `devkit/src/shared/ipc-clone.ts`，实现为 `JSON.parse(JSON.stringify(...))`），再交给 `ipcRenderer.invoke`。不要在渲染进程把 `ref`/`reactive`/`store` 里的对象原样传入。

2. **主进程 IPC handler（`devkit/src/main/ipc/*.ts`）**  
   返回给渲染进程的**对象与数组**，用 `toIpcReply()` 再包一层，保证是普通可序列化数据（尤其避免把数据库驱动的原始行对象原样返回）。`invoke` 的返回值、`webContents.send` 的 payload 均适用。

3. **新增 IPC 时**  
   双向都按上两条检查；新增 `invoke` 通道时同步在 preload 里对入参做 `cloneForIpc`，主进程对出参做 `toIpcReply`（布尔、字符串、数字等原始类型可省略 `toIpcReply`，但包一层也无害）。

4. **限制说明**  
   `cloneForIpc` / `toIpcReply` 基于 JSON（带 `replacer`：去掉 function/symbol，BigInt 转字符串），无法传递 `undefined` 字段（键会被省略）；若未来需要更复杂类型，需显式转成字符串或拆分字段。

5. **禁止把 `undefined` 当作 `invoke` 的独立参数**  
   部分 Electron/Chromium 在序列化 `invoke(channel, a, undefined)` 时会报 **`An object could not be cloned`**。可选对象参数在 preload 里统一写成 `cloneForIpc(x ?? {})`，例如 `scriptRun(id, params ?? {})`、`scriptList(opts ?? {})`。

6. **渲染进程双保险**  
   Pinia store（`scripts` / `cheatsheet` / `scheduler`）以及 `ScriptRunDialog` 在调用 `window.api.*` 前对**对象载荷**再执行一次 `cloneForIpc`，避免遗漏的响应式引用。

7. **排查「看不到日志」**  
   - **运行 `npm run dev` 的终端**：主进程 `console.error`、**preload 的 `console.error`**（与页面 DevTools 不是同一上下文）默认打在这里。  
   - 开发模式下主进程会把 **渲染进程** `console` 转发为 `[DevKit renderer …]` 前缀，便于对照。  
   - `preload-error`、未捕获异常会以 `[DevKit main]` / `[DevKit preload-error]` 前缀输出。

### 文件组织

以下为 `devkit/src/` 结构（节选）：

```
src/
├── main/                     # Electron 主进程
│   ├── index.ts              # 入口
│   ├── ipc/                  # IPC handlers，每个模块一个文件
│   │   ├── scripts.ts
│   │   ├── scheduler.ts
│   │   └── cheatsheet.ts
│   └── db/
│       ├── index.ts          # DB 连接
│       └── migrations/       # 建表 SQL
│
├── renderer/                 # Vue 前端
│   ├── pages/                # 页面级组件
│   │   ├── scripts/          # 脚本库
│   │   ├── scheduler/        # 定时任务
│   │   ├── cheatsheet/       # 命令速查
│   │   ├── snippets/         # 代码片段
│   │   └── settings/         # 设置
│   ├── components/           # 通用组件
│   ├── composables/          # Vue 组合式函数
│   └── stores/               # Pinia stores，每个模块一个文件
│
├── shared/                   # 主进程和渲染进程共享
│   ├── types/                # TypeScript 类型定义
│   └── ipc-clone.ts          # IPC 结构化克隆：cloneForIpc / toIpcReply
│
└── presets/                  # 内置数据（JSON）
    ├── git.json
    ├── docker.json
    ├── macos-shortcuts.json
    └── terminal-unstuck.json
```

### 模块划分

| 模块 | 功能 | 优先级 |
|------|------|--------|
| scripts | 脚本库：存储、搜索、执行、多平台版本 | Phase 1 |
| cheatsheet | 命令速查：内置 + 自定义、模糊搜索 | Phase 1 |
| scheduler | 定时任务：可视化 Cron、开关、日志 | Phase 2 |
| snippets | 代码片段：模板代码、一键复制 | Phase 3 |
| path-converter | 路径转换：Windows ↔ macOS | Phase 3 |
| env-manager | 环境变量管理：按项目管理 .env | Phase 3 |

### 终端交互规范

脚本执行面板是核心交互，必须满足：

- **实时输出**：使用 `spawn` + 流式读取，输出实时滚动显示，不能等执行完才显示
- **终端组件**：使用 xterm.js 渲染输出，支持 ANSI 颜色和格式
- **执行控制**：
  - 运行中显示"终止"按钮，可强制 kill 进程
  - 执行完成后显示退出码和耗时
  - 支持清空输出
- **面板状态**：idle / running / success / error 四种状态，有明显视觉区分
- **参数填写**：脚本有参数时，执行前弹出表单，每个参数有名称、描述、默认值
- **历史记录**：每次执行结束将完整输出写入 `execution_logs`；设置页可配「保留条数」与「单条输出上限（字节）」；仅保留最近 N 条**已结束**记录；单条超过上限时 UTF-8 安全保留**末尾**并加提示行。详见「数据存储」。
- **运行弹窗**：窗口可缩放（`resize`）；展示脚本新建/更新时间、本次执行耗时；主按钮在运行中仅禁用并文案为「运行中…」，结束进程只用「终止」；提供「复制脚本」（当前平台正文）；xterm 使用 `convertEol`、等宽字体与可读配色，随容器 `ResizeObserver` 自适应。

### 交互设计原则

- 操作反馈要即时（loading、success、error 状态）
- 危险操作（删除脚本、终止任务）需要二次确认
- 列表页支持搜索 + 标签过滤
- 表单字段必须有 placeholder 和描述说明
- 空状态要有引导提示，不能空白一片

### 跨平台处理

- 脚本支持存储 macOS 和 Windows 两个版本
- 运行时根据 `process.platform` 自动选择对应版本
- 路径处理统一使用 Node.js `path` 模块

### 数据存储

- 所有用户数据存储在 SQLite 中
- 内置预设数据以 JSON 文件形式放在 presets/ 目录
- 应用数据目录使用 Electron 的 app.getPath('userData')
- 执行日志单独存表（`execution_logs`），避免主表膨胀
- **执行快照**：进程正常结束后更新该次 `output`；超长输出按设置的字节上限截尾（`execution-log-maintenance.ts`）
- **历史条数**：`app_settings.execution_history_max_count`（默认 200，范围 10–10000）；每次执行结束后按 `finished_at` 删除更早的已完成记录；修改设置保存时也会立即修剪
- **单条输出上限**：`app_settings.execution_output_max_bytes`（默认 1MB，范围 64KB–50MB，可设置页修改）

### 提交规范

- commit message 使用英文，格式：`type(scope): description`
- type: feat / fix / refactor / docs / chore
- scope: 模块名，如 scripts / scheduler / cheatsheet
