// 桌面端入口：真正的逻辑都在 lib 里（移动端由 lib 的 mobile_entry_point 直接调起）
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    mini_todo_lib::run();
}
