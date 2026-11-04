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
- **自然语言录入**：输入「明天 3 点 提交周报」，自动拆出标题与时间
- **菜单栏 / 托盘常驻**：点击图标或按 `⌘ ⇧ Space`（Windows 为 `Ctrl ⇧ Space`）弹出快捷记录，回车即存、失焦自动收起
- **全屏也盖不住**：macOS 上别的应用进了全屏，快捷窗口依然浮在最上层（不切走全屏、也不抢焦点），记完点回全屏应用自动收起
- **搜索**：`⌘ K` 实时过滤
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

**macOS**：目前没有签名公证的安装包，按下面的「打包」从源码构建即可；构建好的应用在 `~/Applications/Mini Todo.app`，首次打开如被系统拦下，右键 →「打开」。

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

## 自检

```bash
cd src-tauri
cargo test                                  # 数据层单元测试（增删改查 / 排序 / 提醒）
cargo run -- --selftest                     # 端到端跑一遍，逐项打印 PASS
```

## 发布新版本

仓库带了一个 GitHub Actions 工作流（`.github/workflows/release.yml`）：在 **windows-latest** 上编译，把 NSIS 安装包自动挂到 Release。

```bash
# 1. 改版本号：package.json 和 src-tauri/tauri.conf.json 两处保持一致
# 2. 提交后打 tag，工作流自动构建并发布
git commit -am "chore: bump to v0.2.0"
git tag v0.2.0
git push origin main --tags
```

也可以在 GitHub 的 **Actions → Release → Run workflow** 手动触发。想同时产出 MSI，把工作流里的 `--bundles nsis` 改成 `--bundles nsis,msi`。

## 技术栈

Tauri 2 · React 19 · TypeScript · Vite · SQLite（rusqlite）· Rust 1.89

> macOS 的快捷窗口在运行时被改造成「非激活 NSPanel」（`src-tauri/src/macos_overlay.rs`）：
> 只有这种窗口能被窗口服务器放进其它应用的全屏 Space，并且不用激活 App 就能收键盘输入。
> 排查时设 `MINI_TODO_DEBUG_OVERLAY=1` 能看到它的 class / styleMask / 层级 / 是否在当前 Space。

## 目录

```
src/              前端（React）
  components/     MainApp、PopoverApp、TaskEditor、SettingsSheet、图标
  lib/            api（含浏览器 mock）、nlp（中文时间解析）、select（视图筛选）
src-tauri/        Rust：main（窗口 / 托盘 / 快捷键）、db、commands
design/           UI 稿与素材
scripts/          打包脚本
.github/          release 工作流
```

## License

[MIT](./LICENSE)
