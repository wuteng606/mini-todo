#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod db;
#[cfg(target_os = "macos")]
mod macos_overlay;

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
    win_h: f64,
) -> (f64, f64) {
    let scale = monitor.scale_factor();
    let mpos = monitor.position();
    let msize = monitor.size();
    let margin = 8.0 * scale;

    let left = mpos.x as f64;
    let top = mpos.y as f64;
    let right = left + msize.width as f64;
    let bottom = top + msize.height as f64;

    let (center_x, anchor_y) = match tray {
        Some((x, y, w, h)) => (x + w / 2.0, y + h),
        // 拿不到图标位置时退回右上角
        None => (right - win_w / 2.0 - 10.0 * scale, top),
    };

    let min_x = left + margin;
    let max_x = (right - win_w - margin).max(min_x);
    let x = (center_x - win_w / 2.0).clamp(min_x, max_x);

    // 全屏应用时菜单栏会自动隐藏，托盘矩形可能落在屏幕外（y 为负），这里兜底贴顶
    let mut y = anchor_y + 6.0 * scale;
    if y < top + margin {
        y = top + margin;
    }
    if y + win_h > bottom - margin {
        y = (bottom - win_h - margin).max(top + margin);
    }
    (x, y)
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

/// 选出菜单栏所在的那块屏幕。
///
/// 原来直接用 `primary_monitor()`，多显示器时会把快捷窗口丢到主屏；
/// 全屏应用时托盘矩形还可能落在屏幕外，所以这里按 x 范围匹配，再退回当前 / 主屏。
fn popover_monitor(
    app: &AppHandle,
    win: &tauri::WebviewWindow,
    tray: Option<(f64, f64, f64, f64)>,
) -> Option<tauri::Monitor> {
    if let Some((tx, ty, tw, _)) = tray {
        let cx = tx + tw / 2.0;
        if let Ok(monitors) = app.available_monitors() {
            let mut same_column: Option<tauri::Monitor> = None;
            for m in monitors {
                let p = m.position();
                let s = m.size();
                let left = p.x as f64;
                let right = left + s.width as f64;
                if cx < left || cx > right {
                    continue;
                }
                let top = p.y as f64;
                let bottom = top + s.height as f64;
                // 托盘在菜单栏上，允许 80pt 的纵向余量（菜单栏自动隐藏时坐标可能偏上或为负）
                if ty >= top - 80.0 && ty <= bottom {
                    return Some(m);
                }
                if same_column.is_none() {
                    same_column = Some(m);
                }
            }
            if same_column.is_some() {
                return same_column;
            }
        }
    }

    win.current_monitor()
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten())
}

/// 把快捷窗口贴到托盘图标旁边：macOS 在菜单栏下方，Windows 在任务栏上方
fn place_popover(app: &AppHandle, win: &tauri::WebviewWindow) {
    let scale_guess = win.scale_factor().unwrap_or(1.0);
    let tray = tray_rect(app, scale_guess);

    let Some(monitor) = popover_monitor(app, win, tray) else { return };
    let Ok(wsize) = win.outer_size() else { return };

    let (x, y) = popover_position(&monitor, tray, wsize.width as f64, wsize.height as f64);

    let _ = win.set_position(tauri::PhysicalPosition::new(x.round() as i32, y.round() as i32));
}

/// 快捷窗口是不是「我们主动打开」的状态。
///
/// 不再只信 `is_visible()`：窗口被系统挤到别的 Space 时它仍然报 true，
/// 下次点击就会变成 hide()，表现成「点了没反应」。
static POPOVER_SHOWN: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);
static POPOVER_SHOWN_AT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// 弹出后这么长时间内的失焦事件不当作「用户点别处」处理（全屏 / 菜单栏切换常有连带失焦）
const BLUR_GRACE_MS: u64 = 300;

/// 显示 / 隐藏菜单栏快捷窗口
fn toggle_popover(app: &AppHandle) {
    use std::sync::atomic::Ordering;

    let Some(win) = app.get_webview_window("popover") else {
        return;
    };

    if POPOVER_SHOWN.load(Ordering::Relaxed) && win.is_visible().unwrap_or(false) {
        POPOVER_SHOWN.store(false, Ordering::Relaxed);
        let _ = win.hide();
        return;
    }

    place_popover(app, &win);
    POPOVER_SHOWN.store(true, Ordering::Relaxed);
    POPOVER_SHOWN_AT.store(ms_since_start() as u64, Ordering::Relaxed);

    // macOS：窗口要变成「非激活 NSPanel」才能浮在全屏应用上，
    // 并且显示时不能激活 App（否则会把当前全屏 Space 顶掉）。
    #[cfg(target_os = "macos")]
    {
        macos_overlay::show(&win);

        // 全屏下点菜单栏图标，系统会把菜单栏升起再收回，这个重排可能把面板挤到后面，
        // 隔一小会儿再叠一次最前（万一这期间用户已经点别处收起了，就跳过）。
        let w = win.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(150));
            if POPOVER_SHOWN.load(Ordering::Relaxed) {
                macos_overlay::raise(&w);
            }
        });
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = win.show();
        let _ = win.set_focus();
    }

    if std::env::var("MINI_TODO_DEBUG_OVERLAY").is_ok() {
        eprintln!("[toggle] show +{}ms", ms_since_start());
    }
}

fn ms_since_start() -> u128 {
    use std::sync::OnceLock;
    static START: OnceLock<std::time::Instant> = OnceLock::new();
    START.get_or_init(std::time::Instant::now).elapsed().as_millis()
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
            // ---------- macOS：纯菜单栏后台程序 ----------
            // Accessory = 没有 Dock 图标、没有应用菜单，只在菜单栏留一个图标。
            // 打包后的 .app 还会在 Info.plist 里写 LSUIElement，避免启动瞬间闪一下 Dock。
            #[cfg(target_os = "macos")]
            app.handle()
                .set_activation_policy(tauri::ActivationPolicy::Accessory)?;

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

            // 菜单栏图标：tray-icon 会把图缩放到 18pt 高，视觉大小由图形留白决定，
            // 所以这里用专门的 tray.png（满幅、无投影），而不是 App 图标（带 20% 留白）。
            match tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png")) {
                Ok(icon) => tray = tray.icon(icon),
                Err(e) => {
                    eprintln!("菜单栏图标加载失败，退回应用图标: {e:?}");
                    if let Some(icon) = app.default_window_icon() {
                        tray = tray.icon(icon.clone());
                    }
                }
            }
            tray.build(app)?;

            // ---------- macOS：快捷窗口浮在全屏应用之上 ----------
            // 启动时打一次标记，之后 toggle_popover 里还会再补一次（防御窗口被重建 / 层级被重置）
            #[cfg(target_os = "macos")]
            if let Some(win) = app.get_webview_window("popover") {
                macos_overlay::make_overlay(&win);
            }

            // Accessory（无 Dock 图标）下，启动时系统不会自动把 App 激活，
            // 主窗口会开在别的窗口后面 —— 这里主动提到最前一次。
            #[cfg(target_os = "macos")]
            show_main(app.handle());

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
            WindowEvent::Focused(focused) => {
                if std::env::var("MINI_TODO_DEBUG_OVERLAY").is_ok() {
                    eprintln!(
                        "[event] {} focused={focused} +{}ms",
                        window.label(),
                        ms_since_start()
                    );
                }

                if !focused && window.label() == "popover" {
                    use std::sync::atomic::Ordering;

                    let now = ms_since_start() as u64;
                    let shown_at = POPOVER_SHOWN_AT.load(Ordering::Relaxed);
                    if now.saturating_sub(shown_at) < BLUR_GRACE_MS {
                        // 刚弹出就失焦：多半是全屏 / 菜单栏切换的连带事件，稍后确认一次
                        let handle = window.app_handle().clone();
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(BLUR_GRACE_MS + 50));
                            if let Some(w) = handle.get_webview_window("popover") {
                                if POPOVER_SHOWN.load(Ordering::Relaxed)
                                    && !w.is_focused().unwrap_or(false)
                                {
                                    POPOVER_SHOWN.store(false, Ordering::Relaxed);
                                    let _ = w.hide();
                                }
                            }
                        });
                    } else {
                        POPOVER_SHOWN.store(false, Ordering::Relaxed);
                        let _ = window.hide();
                    }
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
