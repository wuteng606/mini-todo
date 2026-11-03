#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;

use db::Db;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};
#[cfg(target_os = "macos")]
use tauri::RunEvent;

fn show_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

/// 托盘图标在屏幕上的矩形（物理像素）：x, y, w, h
fn tray_rect(app: &AppHandle, scale: f64) -> Option<(f64, f64, f64, f64)> {
    let tray = app.tray_by_id("mini-todo-tray")?;
    let rect = tray.rect().ok().flatten()?;
    let (x, y) = match rect.position {
        tauri::Position::Physical(p) => (p.x as f64, p.y as f64),
        tauri::Position::Logical(p) => (p.x * scale, p.y * scale),
    };
    let (w, h) = match rect.size {
        tauri::Size::Physical(s) => (s.width as f64, s.height as f64),
        tauri::Size::Logical(s) => (s.width * scale, s.height * scale),
    };
    Some((x, y, w, h))
}

/// 把快捷窗口贴到菜单栏图标正下方（macOS）
#[cfg(not(target_os = "windows"))]
fn popover_position(
    monitor: &tauri::Monitor,
    tray: Option<(f64, f64, f64, f64)>,
    win_w: f64,
    _win_h: f64,
) -> (f64, f64) {
    let scale = monitor.scale_factor();
    let mpos = monitor.position();
    let msize = monitor.size();
    let margin = 8.0 * scale;

    let (center_x, top_y) = match tray {
        Some((x, y, w, h)) => (x + w / 2.0, y + h),
        // 拿不到图标位置时退回右上角
        None => (mpos.x as f64 + msize.width as f64 - win_w / 2.0 - 10.0 * scale, mpos.y as f64),
    };

    let min_x = mpos.x as f64 + margin;
    let max_x = mpos.x as f64 + msize.width as f64 - win_w - margin;
    let x = (center_x - win_w / 2.0).clamp(min_x, max_x.max(min_x));
    (x, top_y + 6.0 * scale)
}

/// Windows 的任务栏通常在屏幕底部，快捷窗口贴在托盘图标**上方**，并避开任务栏
#[cfg(target_os = "windows")]
fn popover_position(
    monitor: &tauri::Monitor,
    tray: Option<(f64, f64, f64, f64)>,
    win_w: f64,
    win_h: f64,
) -> (f64, f64) {
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let margin = 8.0 * scale;
    let left = area.position.x as f64;
    let right = left + area.size.width as f64;
    let bottom = area.position.y as f64 + area.size.height as f64;

    let x = match tray {
        Some((tx, _, tw, _)) => {
            let lo = left + margin;
            let hi = (right - win_w - margin).max(lo);
            (tx + tw / 2.0 - win_w / 2.0).clamp(lo, hi)
        }
        None => (right - win_w - margin).max(left + margin),
    };
    let y = match tray {
        Some((_, ty, _, _)) => (ty - win_h - 6.0 * scale).max(area.position.y as f64 + margin),
        None => (bottom - win_h - margin).max(area.position.y as f64 + margin),
    };
    (x, y)
}

/// 把快捷窗口贴到托盘图标旁边：macOS 在菜单栏下方，Windows 在任务栏上方
fn place_popover(app: &AppHandle, win: &tauri::WebviewWindow) {
    let monitor = app
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| win.current_monitor().ok().flatten());

    let Some(monitor) = monitor else { return };
    let scale = monitor.scale_factor();
    let Ok(wsize) = win.outer_size() else { return };

    let tray = tray_rect(app, scale);
    let (x, y) = popover_position(&monitor, tray, wsize.width as f64, wsize.height as f64);

    let _ = win.set_position(tauri::PhysicalPosition::new(x.round() as i32, y.round() as i32));
}

/// 显示 / 隐藏菜单栏快捷窗口
fn toggle_popover(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("popover") {
        if win.is_visible().unwrap_or(false) {
            let _ = win.hide();
        } else {
            place_popover(app, &win);
            let _ = win.show();
            let _ = win.set_focus();
        }
    }
}

fn run_selftest() -> i32 {
    let path = std::env::temp_dir().join("mini-todo-selftest.db");
    let _ = std::fs::remove_file(&path);

    let conn = match db::open(&path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("FAIL open db: {e}");
            return 1;
        }
    };

    if let Err(e) = db::seed_if_empty(&conn) {
        eprintln!("FAIL seed: {e}");
        return 1;
    }
    let seeded = db::list(&conn).unwrap_or_default().len();
    println!("1. 初始化 + 种子数据: {seeded} 条 {}", if seeded == 4 { "PASS" } else { "FAIL" });

    let id = match db::create(&conn, "写周报", None, "工作", 1) {
        Ok(id) => id,
        Err(e) => {
            eprintln!("FAIL create: {e}");
            return 1;
        }
    };
    let after_create = db::list(&conn).unwrap().len();
    println!(
        "2. 新建任务: 共 {after_create} 条 {}",
        if after_create == 5 { "PASS" } else { "FAIL" }
    );

    db::toggle(&conn, id, true).unwrap();
    let done = db::get(&conn, id).unwrap().completed_at.is_some();
    println!("3. 勾选完成: {} {}", done, if done { "PASS" } else { "FAIL" });

    db::update(&conn, id, Some("写周报（终稿）"), None, Some("学习"), Some(3)).unwrap();
    let t = db::get(&conn, id).unwrap();
    let ok = t.title == "写周报（终稿）" && t.tag == "学习" && t.priority == 3;
    println!("4. 编辑任务: {} {}", t.title, if ok { "PASS" } else { "FAIL" });

    db::delete(&conn, id).unwrap();
    let after_delete = db::list(&conn).unwrap().len();
    println!(
        "5. 删除任务: 剩余 {after_delete} 条 {}",
        if after_delete == 4 { "PASS" } else { "FAIL" }
    );

    db::clear_completed(&conn).unwrap();
    let remaining = db::list(&conn).unwrap().len();
    println!(
        "6. 清除已完成: 剩余 {remaining} 条 {}",
        if remaining == 3 { "PASS" } else { "FAIL" }
    );

    // 7. 拖拽排序
    let mut ids: Vec<i64> = db::list(&conn).unwrap().iter().map(|t| t.id).collect();
    ids.reverse();
    let expected_first = db::get(&conn, ids[0]).unwrap().title;
    let mut conn_mut = conn;
    db::reorder(&mut conn_mut, &ids).unwrap();
    let first = db::list(&conn_mut).unwrap()[0].title.clone();
    println!(
        "7. 拖拽排序: 首条 {} {}",
        first,
        if first == expected_first { "PASS" } else { "FAIL" }
    );

    0
}

fn spawn_reminder(app: AppHandle) {
    use tauri_plugin_notification::NotificationExt;

    std::thread::spawn(move || {
        // 启动先等 5 秒，之后每 30 秒扫一次
        std::thread::sleep(std::time::Duration::from_secs(5));
        loop {
            let now = chrono::Local::now().timestamp_millis();
            let due = {
                let state = app.state::<Db>();
                let guard = state.0.lock();
                match guard {
                    Ok(conn) => db::due_for_notification(&conn, now).unwrap_or_default(),
                    Err(_) => Vec::new(),
                }
            };

            if !due.is_empty() {
                let ids: Vec<i64> = due.iter().map(|(id, _)| *id).collect();
                for (_, title) in &due {
                    let _ = app
                        .notification()
                        .builder()
                        .title("Mini Todo")
                        .body(format!("该做「{title}」了"))
                        .show();
                }
                if let Ok(conn) = app.state::<Db>().0.lock() {
                    let _ = db::mark_notified(&conn, &ids, now);
                }
                let _ = app.emit("tasks-changed", ());
            }

            std::thread::sleep(std::time::Duration::from_secs(30));
        }
    });
}

fn main() {
    if std::env::args().any(|a| a == "--selftest") {
        std::process::exit(run_selftest());
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        toggle_popover(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            // ---------- 数据库 ----------
            // 默认放 ~/Library/Application Support/com.minitodo.desktop
            // 可用 MINI_TODO_DATA_DIR 覆盖（便于调试 / 便携模式）
            let dir = match std::env::var("MINI_TODO_DATA_DIR") {
                Ok(p) if !p.trim().is_empty() => std::path::PathBuf::from(p),
                _ => app.path().app_data_dir()?,
            };
            std::fs::create_dir_all(&dir)?;
            let db_path = dir.join("mini-todo.db");
            let conn = db::open(&db_path)?;
            db::seed_if_empty(&conn)?;
            app.manage(Db(Mutex::new(conn)));

            // ---------- 到点提醒 ----------
            spawn_reminder(app.handle().clone());

            // 调试: MINI_TODO_SHOW_POPOVER=1 时启动后自动弹出快捷窗口
            if std::env::var("MINI_TODO_SHOW_POPOVER").is_ok() {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_millis(1200));
                    toggle_popover(&handle);
                });
            }

            // ---------- 菜单栏 ----------
            let show_item = MenuItem::with_id(app, "show", "打开主窗口", true, None::<&str>)?;
            let quick_item = MenuItem::with_id(app, "quick", "快速记录", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出 Mini Todo", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quick_item, &quit_item])?;

            let mut tray = TrayIconBuilder::with_id("mini-todo-tray")
                .tooltip("Mini Todo")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "quick" => toggle_popover(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_popover(tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            // ---------- 全局快捷键 ⌘⇧Space ----------
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
                // macOS 用 ⌘⇧Space，Windows / Linux 用 Ctrl⇧Space
                #[cfg(target_os = "macos")]
                let primary = Modifiers::SUPER | Modifiers::SHIFT;
                #[cfg(not(target_os = "macos"))]
                let primary = Modifiers::CONTROL | Modifiers::SHIFT;

                // 第一个常被输入法占用，失败时退到 Alt⇧Space
                let candidates = [
                    Shortcut::new(Some(primary), Code::Space),
                    Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::Space),
                ];
                let mut registered = false;
                for sc in candidates {
                    if app.global_shortcut().register(sc).is_ok() {
                        registered = true;
                        break;
                    }
                }
                if !registered {
                    eprintln!("全局快捷键注册失败：请到「系统设置 › 键盘 › 快捷键」检查冲突");
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                if window.label() == "main" {
                    // 关窗不退出，常驻菜单栏
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
            WindowEvent::Focused(false) => {
                if window.label() == "popover" {
                    let _ = window.hide();
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_tasks,
            commands::create_task,
            commands::toggle_task,
            commands::update_task,
            commands::delete_task,
            commands::reorder_tasks,
            commands::clear_completed,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, _event| {
            // Reopen 只有 macOS 会有（点 Dock 图标重新打开）
            #[cfg(target_os = "macos")]
            if let RunEvent::Reopen { .. } = _event {
                show_main(app);
            }
            #[cfg(not(target_os = "macos"))]
            {
                let _ = app;
            }
        });
}
