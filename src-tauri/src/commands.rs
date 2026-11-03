use crate::db::{self, Db, Task};
use tauri::{AppHandle, Emitter, State};

fn notify(app: &AppHandle) {
    let _ = app.emit("tasks-changed", ());
}

#[tauri::command]
pub fn list_tasks(state: State<Db>) -> Result<Vec<Task>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::list(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_task(
    app: AppHandle,
    state: State<Db>,
    title: String,
    due_at: Option<i64>,
    tag: Option<String>,
    priority: Option<i64>,
) -> Result<Task, String> {
    if title.trim().is_empty() {
        return Err("任务标题不能为空".into());
    }
    let tag = tag.unwrap_or_else(|| "生活".to_string());
    let id = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        db::create(&conn, &title, due_at, &tag, priority.unwrap_or(0))
            .map_err(|e| e.to_string())?
    };
    notify(&app);

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    db::get(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn toggle_task(
    app: AppHandle,
    state: State<Db>,
    id: i64,
    done: bool,
) -> Result<(), String> {
    {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        db::toggle(&conn, id, done).map_err(|e| e.to_string())?;
    }
    notify(&app);
    Ok(())
}

#[tauri::command]
pub fn update_task(
    app: AppHandle,
    state: State<Db>,
    id: i64,
    title: Option<String>,
    due_at: Option<i64>,
    tag: Option<String>,
    priority: Option<i64>,
) -> Result<(), String> {
    {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        db::update(
            &conn,
            id,
            title.as_deref(),
            due_at,
            tag.as_deref(),
            priority,
        )
        .map_err(|e| e.to_string())?;
    }
    notify(&app);
    Ok(())
}

#[tauri::command]
pub fn delete_task(app: AppHandle, state: State<Db>, id: i64) -> Result<(), String> {
    {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        db::delete(&conn, id).map_err(|e| e.to_string())?;
    }
    notify(&app);
    Ok(())
}

#[tauri::command]
pub fn reorder_tasks(app: AppHandle, state: State<Db>, ids: Vec<i64>) -> Result<(), String> {
    {
        let mut conn = state.0.lock().map_err(|e| e.to_string())?;
        db::reorder(&mut conn, &ids).map_err(|e| e.to_string())?;
    }
    notify(&app);
    Ok(())
}

#[tauri::command]
pub fn clear_completed(app: AppHandle, state: State<Db>) -> Result<(), String> {
    {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        db::clear_completed(&conn).map_err(|e| e.to_string())?;
    }
    notify(&app);
    Ok(())
}
