#!/usr/bin/env bash
# 构建 Mini Todo.app（macOS）
# 用法：./scripts/build-macos.sh [输出目录]
# 默认输出到 ~/Applications
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-$HOME/Applications}"
APP="$OUT_DIR/Mini Todo.app"

echo "==> 1/4 安装依赖"
cd "$ROOT"
[ -d node_modules ] || npm install --no-fund --no-audit

echo "==> 2/4 构建前端"
npm run build

echo "==> 3/4 编译 Rust（release，前端资源内嵌）"
cd "$ROOT/src-tauri"
cargo build --release --features custom-protocol

echo "==> 4/4 组装 .app"
TARGET_DIR="${CARGO_TARGET_DIR:-$ROOT/src-tauri/target}"
BIN="$TARGET_DIR/release/mini-todo"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/Mini Todo"
cp "$ROOT/src-tauri/icons/icon.icns" "$APP/Contents/Resources/icon.icns"
cp "$ROOT/scripts/Info.plist" "$APP/Contents/Info.plist"
codesign --force --deep --sign - "$APP" >/dev/null 2>&1 || true

echo "完成：$APP"
echo "打开：open \"$APP\""
