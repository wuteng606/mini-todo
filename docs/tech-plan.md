# Mini Todo · 技术方案（待确认）

> 目标：一个 Mac 桌面端、单机、无账号、启动即用的 todo 小工具。首版做"够用且顺手"，不做团队协作与云端同步。

## 一、技术选型

### 候选对比

| 维度 | Tauri 2（推荐） | Electron | SwiftUI 原生 |
| --- | --- | --- | --- |
| 安装包体积 | 约 5–8 MB | 约 90–130 MB | 约 3–6 MB |
| 冷启动 | 快（系统 WebView） | 较慢（自带 Chromium） | 最快 |
| 内存占用 | 约 60–110 MB | 约 180–300 MB | 约 30–60 MB |
| UI 迭代效率 | 高（HTML/CSS） | 高 | 低（需 Xcode 预览、Swift 语法） |
| 原生能力（菜单栏、全局快捷键、通知） | 插件齐全 | 齐全但依赖 Node 侧 | 最好 |
| 本机当前条件 | ✅ Rust 1.89 + CLT 已就绪 | ✅ Node 22 | ❌ 未装 Xcode（需 10 GB+） |
| 签名与分发 | 需公证，也可 ad-hoc 自用 | 同左 | 同左 |

**结论：选 Tauri 2。** 体积和内存接近原生，UI 用 HTML/CSS 可以按现有设计稿 1:1 还原，本机工具链已经具备，不需要装 Xcode。

### 最终技术栈

- **壳**：Tauri 2（Rust 1.89，macOS 15 / WKWebView）
- **前端**：React 19 + TypeScript + Vite + 原生 CSS 变量（设计稿里的 token 直接落地，不引入 Tailwind，减少一层转译）
- **状态**：Zustand（轻量，任务列表用乐观更新）
- **数据**：SQLite（`tauri-plugin-sql`）+ FTS5 全文搜索；数据库文件放在 `~/Library/Application Support/MiniTodo/mini-todo.db`
- **Tauri 插件**：`global-shortcut`（⌘⇧Space）、`positioner`（菜单栏弹窗贴图标定位）、`notification`、`autostart`、`single-instance`、`store`（窗口位置/主题偏好）
- **自然语言**：`chrono-node`（中文 locale）+ 自写规则（"每週五""每天 9 点"）
- **图标/字体**：SF Symbols 风格自绘 SVG + 系统字体栈，不打包字体文件

## 二、架构分层

```
src-tauri/            Rust 侧
  src/main.rs         启动、单实例、窗口/托盘装配
  src/db.rs           建表、迁移、FTS 触发器
  src/commands.rs     IPC 命令（任务/清单/搜索/设置）
  src/tray.rs         菜单栏图标 + popover 定位
  src/reminder.rs     调度提醒、补发错过提醒

src/                  前端
  app/                窗口入口（main / popover 两个 HTML 入口）
  components/         Sidebar、TaskRow、QuickAdd、DetailPanel
  stores/             tasks.ts、lists.ts、ui.ts（zustand）
  lib/                ipc.ts（命令封装）、nlp.ts（自然语言）、date.ts
  styles/             tokens.css、app.css
```

**两个窗口，两个入口**：主窗口（860×604，可缩放）与菜单栏弹窗（292×420，无边框、失焦自动收起），共用同一套组件与 store，popover 只渲染精简视图。

## 三、数据模型

```sql
lists(id, name, color, icon, sort_order, created_at)
tasks(
  id, list_id, title, notes,
  due_at, remind_at,          -- 时间戳，可空
  priority,                   -- 0 无 / 1 低 / 2 中 / 3 高
  repeat_rule,                -- RFC5545 片段，首版可留空
  completed_at, sort_order,
  created_at, updated_at, deleted_at
)
tags(id, name, color)
task_tags(task_id, tag_id)
tasks_fts(title, notes)       -- FTS5 外部内容表
```

- 软删除（`deleted_at`），保留 30 天可撤销；
- 排序用 `sort_order`（REAL，插入取中值），拖拽重排不重写全表；
- 每日自动备份 `backup/YYYY-MM-DD.json`，保留最近 14 份。

## 四、关键流程

1. **全局快速记录**：⌘⇧Space → 若主窗口在前台则聚焦输入框，否则在鼠标所在屏幕的菜单栏下方弹出 popover → 输入"明天 3 点 提交周报" → 回车 → 写入 DB、`positioner` 收起窗口、菜单栏图标短暂高亮。
2. **时间解析**：`nlp.ts` 先抽时间短语，剩余文本作为标题；解析失败则整句当标题，并把光标停在日期按钮上（不阻塞录入）。
3. **提醒**：写入时算下次触发时间，Rust 侧用单一定时器维护最小堆；休眠唤醒后对比 `last_check` 补发错过的提醒，避免"合盖一晚全丢"。
4. **搜索**：输入即查 FTS5，`title` 命中加权高于 `notes`；⌘K 聚焦，↑↓ 选择，回车定位到任务。
5. **主题**：默认跟随系统（`prefers-color-scheme`），可在设置里锁定深/浅色，与设计稿的 `data-theme` 一一对应。

## 五、里程碑

| 阶段 | 内容 | 交付物 |
| --- | --- | --- |
| M1 骨架 | Tauri 工程、双窗口、托盘、全局快捷键、SQLite 建表、任务 CRUD | 能跑起来的空壳 + 增删改查 |
| M2 主界面 | 按设计稿还原侧边栏/列表/快速添加/搜索/主题 | 可日常使用的 v0.1 |
| M3 体验 | 自然语言、提醒通知、拖拽排序、标签、每日备份 | v0.5 |
| M4 收尾 | 图标、设置页、开机自启、`.dmg` 打包、ad-hoc 签名 | 可安装的 v1.0 |

## 六、风险与对策

- **WKWebView 毛玻璃**：popover 用 `transparent + vibrancy`，透明度在浅色下容易发灰 → 先用纯色卡片 + 内阴影，稳定后再叠 `backdrop-filter`。
- **全局快捷键冲突**：⌘⇧Space 可能被输入法占用 → 首次启动检测注册结果，失败则提示改键，设置里可自定义。
- **签名分发**：无 Apple 开发者账号时做 ad-hoc 签名，用户首次打开需右键→打开；自己用完全够。
- **数据迁移**：DB 加 `schema_version`，每次启动跑幂等迁移，避免后续加字段时丢数据。

## 七、需要你确认

1. **技术栈**：Tauri 2 是否可以？（本机 Rust 已就绪；若你更想纯前端、接受 100 MB 体积，可换 Electron）
2. **首版范围**：是否包含「重复任务 + 系统通知 + 子任务」？建议首版只做前两项，子任务放 M3。
3. **窗口形态**：主窗口 + 菜单栏常驻，两者都要吗？
4. **数据**：纯本地 SQLite 无同步，是否符合预期？（后续要 iCloud 同步可加一层 CloudKit 或自建同步）
