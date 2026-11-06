# Mini Todo

[![Release](https://github.com/wuteng606/mini-todo/actions/workflows/release.yml/badge.svg)](https://github.com/wuteng606/mini-todo/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

一个轻巧的桌面待办工具，支持 **macOS / Windows**。柔和玻璃质感、菜单栏（托盘）快捷记录、纯本地存储，没有账号、没有同步、没有云。

![界面](./design/screenshot.png)

## 功能

- **主窗口**：今日 / 即将到来 / 全部 / 已完成 四个视图，逾期单独分组
- **任务**：标题、时间、分类标签（工作 / 学习 / 健康 / 生活）、完成勾选、悬停删除
- **改名与排序**：每行右侧的铅笔按钮（或双击任务）打开编辑面板，可改标题、换分类、删除；按住行拖动调整顺序（今天 / 全部视图）
- **到点提醒**：设了时间的任务到点发系统通知，同一任务只提醒一次
- **自然语言录入**：输入「明天 3 点 提交周报」，自动拆出标题与时间；支持「明晚 8 点」「明天下午 3 点」「三点半」「周五 / 下周三」等说法
- **加完就能看见**：新任务会自动切到它所在的清单（今日 / 即将到来），高亮并滚到可见位置；菜单栏弹窗按「今天 / 接下来」分组，未来任务加完立刻出现在「接下来」并闪一下，不会再出现“加了却找不到”
- **菜单栏 / 托盘常驻**：点击图标或按 `⌘ ⇧ Space`（Windows 为 `Ctrl ⇧ Space`）弹出快捷记录，列表按「今天 / 接下来」分组，回车即存、失焦自动收起
- **不占 Dock**：macOS 上只在菜单栏留一个图标，后台运行，`⌘ Tab` 和 Dock 里都不会出现（退出走菜单栏菜单）
- **全屏也盖不住**：macOS 上别的应用进了全屏，快捷窗口依然浮在最上层（不切走全屏、也不抢焦点），记完点回全屏应用自动收起
- **搜索**：`⌘ K` 实时过滤
- **手机 / 平板**：同一套代码可以跑 iOS / Android，窄屏自动切成整屏布局 + 底部标签栏（详见下方「移动端」）
- **本地数据**：SQLite，macOS 在 `~/Library/Application Support/com.minitodo.desktop/`，Windows 在 `%APPDATA%\com.minitodo.desktop\`

## 快捷键

macOS 用 `⌘`，Windows 用 `Ctrl`，下表以 macOS 写法为例。

| 操作 | 快捷键 |
| --- | --- |
| 快速记录（全局） | `⌘ ⇧ Space`（被占用时自动退到 `⌥ ⇧ Space`） |
| 新建任务 | `⌘ N` |
| 搜索 | `⌘ K` |
| 切换视图 | `⌘ 1` / `⌘ 2` / `⌘ 3` / `⌘ 4` |
| 关闭窗口 | `⌘ W` |
| 关闭弹窗 | `Esc` |
| 改名 / 换分类 | 点行尾铅笔，或双击任务 |
| 调整顺序 | 按住任务行拖动 |

## 安装

**Windows**：到 [Releases](https://github.com/wuteng606/mini-todo/releases) 下载 `Mini.Todo_*_x64-setup.exe` 双击安装。

**macOS**：到 [Releases](https://github.com/wuteng606/mini-todo/releases) 下载 `*_universal.dmg`（Apple Silicon / Intel 通用），打开后把 `Mini Todo.app` 拖进「应用程序」。应用未签名公证，首次打开如被系统拦下，右键 →「打开」。也可以按下面的「打包」从源码构建。

## 开发

```bash
npm install
npm run tauri dev      # 前端热更新 + Rust 调试构建
```

## 打包

```bash
./scripts/build-macos.sh          # 输出到 ~/Applications
./scripts/build-macos.sh ~/Desktop # 或指定目录
```

脚本会做四件事：构建前端 → release 编译 Rust（前端资源内嵌进二进制）→ 组装 `.app` → ad-hoc 签名。

> 说明：应用未做 Apple 公证，仅在自己机器上使用没有影响。若要分发给别人，需要开发者账号签名 + 公证。

## 移动端（iOS / Android）

同一套前端 + Rust 代码可以直接跑在手机和平板上。桌面专属能力（菜单栏图标、全局快捷键、悬浮快捷窗口、窗口定位）在移动端自动关闭，只剩单窗口 + 系统通知。

**界面适配**

| 宽度 | 布局 |
| --- | --- |
| > 1024pt | 桌面：1040×720 浮动玻璃窗，左侧图标栏 |
| 761–1024pt | 平板：窗口贴边、留白收敛，仍是左侧图标栏 |
| ≤ 760pt | 手机：整屏布局，图标栏变成**底部标签栏**，隐藏 macOS 红绿灯与吉祥物 |

细节：输入框统一 16px（避免 iOS 聚焦时自动放大）、`viewport-fit=cover` + `env(safe-area-inset-*)` 避开刘海和底部横条、触屏设备上任务行的编辑/删除按钮常驻（没有 hover）、任务行高度加高到 58pt。

**准备工作**（只需一次）

- iOS：装 Xcode（含模拟器），然后 `sudo xcode-select -s /Applications/Xcode.app`
- Android：装 Android Studio（SDK + NDK），配好 `ANDROID_HOME` / `NDK_HOME`
- Rust 交叉编译目标：
  ```bash
  rustup target add aarch64-apple-ios aarch64-apple-ios-sim \
    aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
  ```

**初始化平台工程**（会生成 `src-tauri/gen/apple`、`src-tauri/gen/android`）

```bash
npm run tauri ios init
npm run tauri android init
```

**开发 / 打包**

```bash
npm run tauri ios dev          # Xcode 模拟器
npm run tauri android dev      # 连真机或开模拟器
npm run tauri ios build        # 出 ipa / xcarchive
npm run tauri android build -- --apk
```

**实现说明**

- crate 现在是「lib + bin」：`src/lib.rs` 里的 `run()` 是唯一入口，桌面由 `src/main.rs` 调用，移动端由 `#[cfg_attr(mobile, tauri::mobile_entry_point)]` 生成的原生入口调用。
- 桌面专属依赖（`tauri-plugin-global-shortcut`、`tauri-plugin-positioner`、`tray-icon`）放在 `[target.'cfg(any(macos, windows, linux))'.dependencies]`，移动端不会拉进来。
- 菜单栏快捷窗口（popover）不再写在 `tauri.conf.json` 里，改成桌面端运行时用 `WebviewWindowBuilder` 创建 —— 移动端只支持一个 webview。
- 数据仍然是 `app_data_dir` 下的 SQLite 文件；`rusqlite` 开了 `bundled`，iOS / Android 上不依赖系统 sqlite3。

## 自检

```bash
# 前端：类型检查 + 构建 + Playwright e2e（覆盖主窗口 / 菜单栏弹窗的增删改查、视图、拖拽、自然语言等）
npm run build
npx playwright install chromium   # 首次运行需要装浏览器
npm run test:e2e

# Rust：数据层单元测试 / 端到端流程
cd src-tauri
cargo test                                  # 数据层单元测试（增删改查 / 排序 / 提醒）
cargo run -- --selftest                     # 端到端跑一遍，逐项打印 PASS
```

## 发布新版本

仓库带了两条 GitHub Actions 工作流：

- `.github/workflows/ci.yml`：push 到 `main` / PR 时跑前端构建 + Playwright e2e
- `.github/workflows/release.yml`：打 `v*` tag 时并行构建 **Windows NSIS 安装包** 和 **macOS 通用包（Apple Silicon + Intel）**，自动挂到 Release

```bash
# 1. 改版本号：package.json、src-tauri/tauri.conf.json、src-tauri/Cargo.toml 保持一致
# 2. 提交后打 tag，工作流自动构建并发布
git commit -am "chore: bump to v0.2.0"
git tag v0.2.0
git push origin main --tags
```

也可以在 GitHub 的 **Actions → Release → Run workflow** 手动触发。想同时产出 MSI，把工作流里的 `--bundles nsis` 改成 `--bundles nsis,msi`。macOS 产物未签名 / 未公证，分发给别人需要开发者账号签名 + 公证。

## 技术栈

Tauri 2 · React 19 · TypeScript · Vite · SQLite（rusqlite）· Playwright · Rust 1.89

> macOS 的快捷窗口在运行时被改造成「非激活 NSPanel」（`src-tauri/src/macos_overlay.rs`）：
> 只有这种窗口能被窗口服务器放进其它应用的全屏 Space，并且不用激活 App 就能收键盘输入。
> 排查时设 `MINI_TODO_DEBUG_OVERLAY=1` 能看到它的 class / styleMask / 层级 / 是否在当前 Space。
>
> 应用本身是 `ActivationPolicy::Accessory`（`main.rs` 的 setup）+ 打包时 `Info.plist` 的
> `LSUIElement`：菜单栏常驻、无 Dock 图标、无应用菜单，属于后台程序。

## 目录

```
src/              前端（React）
  components/     MainApp、PopoverApp、TaskEditor、SettingsSheet、图标
  lib/            api（含浏览器 mock）、nlp（中文时间解析）、select（视图筛选）
src-tauri/        Rust
  src/lib.rs      应用主体 + run()（桌面 / 移动端共用入口）
  src/main.rs     桌面可执行入口（调 run）
  src/macos_overlay.rs  macOS 全屏浮层（NSPanel）
  src/db.rs       数据层（SQLite）
  src/commands.rs 前端调用的命令
e2e/              Playwright 端到端测试（浏览器 mock，不依赖 Tauri）
design/           UI 稿与素材
scripts/          打包脚本
.github/          CI / Release 工作流
```

## License

[MIT](./LICENSE)
