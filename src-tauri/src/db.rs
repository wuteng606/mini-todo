use chrono::{Local, TimeZone};
use rusqlite::{params, Connection, Result};
use serde::Serialize;
use std::path::Path;
use std::sync::Mutex;

pub struct Db(pub Mutex<Connection>);

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub notes: Option<String>,
    pub due_at: Option<i64>,
    pub priority: i64,
    pub tag: String,
    pub completed_at: Option<i64>,
    pub created_at: i64,
    pub sort_order: f64,
}

const COLS: &str = "id, title, notes, due_at, priority, tag, completed_at, created_at, sort_order";

fn row_to_task(r: &rusqlite::Row) -> Result<Task> {
    Ok(Task {
        id: r.get(0)?,
        title: r.get(1)?,
        notes: r.get(2)?,
        due_at: r.get(3)?,
        priority: r.get(4)?,
        tag: r.get(5)?,
        completed_at: r.get(6)?,
        created_at: r.get(7)?,
        sort_order: r.get(8)?,
    })
}

fn ensure_column(conn: &Connection, name: &str, ddl: &str) -> Result<()> {
    let mut stmt = conn.prepare("PRAGMA table_info(tasks)")?;
    let exists = stmt
        .query_map([], |r| r.get::<_, String>(1))?
        .filter_map(|c| c.ok())
        .any(|c| c == name);
    if !exists {
        conn.execute(&format!("ALTER TABLE tasks ADD COLUMN {ddl}"), [])?;
    }
    Ok(())
}

pub fn open(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;
    let _ = conn.pragma_update(None, "journal_mode", "WAL");
    let _ = conn.pragma_update(None, "synchronous", "NORMAL");

    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS tasks (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            title        TEXT    NOT NULL,
            notes        TEXT,
            due_at       INTEGER,
            priority     INTEGER NOT NULL DEFAULT 0,
            tag          TEXT    NOT NULL DEFAULT '生活',
            completed_at INTEGER,
            created_at   INTEGER NOT NULL,
            updated_at   INTEGER NOT NULL,
            deleted_at   INTEGER,
            sort_order   REAL    NOT NULL DEFAULT 0,
            notified_at  INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_due       ON tasks(due_at);
        CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed_at);
        CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
        "#,
    )?;

    // 老库平滑升级
    ensure_column(&conn, "sort_order", "sort_order REAL NOT NULL DEFAULT 0")?;
    ensure_column(&conn, "notified_at", "notified_at INTEGER")?;
    conn.execute(
        "UPDATE tasks SET sort_order = created_at WHERE sort_order = 0 OR sort_order IS NULL",
        [],
    )?;

    Ok(conn)
}

fn today_at(hour: u32, minute: u32) -> Option<i64> {
    let date = Local::now().date_naive();
    let naive = date.and_hms_opt(hour, minute, 0)?;
    Local
        .from_local_datetime(&naive)
        .single()
        .map(|d| d.timestamp_millis())
}

pub fn seed_if_empty(conn: &Connection) -> Result<()> {
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM tasks", [], |r| r.get(0))?;
    if count > 0 {
        return Ok(());
    }

    let now = Local::now().timestamp_millis();
    let rows: Vec<(&str, &str, Option<i64>, Option<i64>)> = vec![
        ("完成季度报告", "工作", today_at(18, 0), None),
        ("学习新技能：AIGC", "学习", None, Some(now - 3_600_000)),
        ("去健身房运动", "健康", today_at(20, 0), None),
        ("买生日礼物", "生活", None, None),
    ];

    for (idx, (title, tag, due_at, completed_at)) in rows.into_iter().enumerate() {
        conn.execute(
            "INSERT INTO tasks (title, due_at, tag, priority, completed_at, created_at, updated_at, sort_order)
             VALUES (?1, ?2, ?3, 0, ?4, ?5, ?5, ?6)",
            params![
                title,
                due_at,
                tag,
                completed_at,
                now,
                (idx as f64 + 1.0) * 1000.0
            ],
        )?;
    }

    Ok(())
}

pub fn list(conn: &Connection) -> Result<Vec<Task>> {
    let sql = format!(
        "SELECT {COLS} FROM tasks
         WHERE deleted_at IS NULL
         ORDER BY (completed_at IS NOT NULL) ASC,
                  sort_order ASC,
                  created_at DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], row_to_task)?;
    let items = rows.collect::<Result<Vec<Task>>>()?;
    Ok(items)
}

pub fn get(conn: &Connection, id: i64) -> Result<Task> {
    conn.query_row(
        &format!("SELECT {COLS} FROM tasks WHERE id = ?1"),
        params![id],
        row_to_task,
    )
}

pub fn create(
    conn: &Connection,
    title: &str,
    due_at: Option<i64>,
    tag: &str,
    priority: i64,
) -> Result<i64> {
    let now = Local::now().timestamp_millis();
    let next: f64 = conn
        .query_row(
            "SELECT COALESCE(MAX(sort_order), 0) + 1000 FROM tasks",
            [],
            |r| r.get(0),
        )
        .unwrap_or(1000.0);
    conn.execute(
        "INSERT INTO tasks (title, due_at, tag, priority, created_at, updated_at, sort_order)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5, ?6)",
        params![title.trim(), due_at, tag, priority, now, next],
    )?;
    Ok(conn.last_insert_rowid())
}

pub fn toggle(conn: &Connection, id: i64, done: bool) -> Result<()> {
    let now = Local::now().timestamp_millis();
    conn.execute(
        "UPDATE tasks SET
            completed_at = ?1,
            updated_at   = ?2,
            notified_at  = CASE WHEN ?1 IS NOT NULL THEN COALESCE(notified_at, ?2) ELSE notified_at END
         WHERE id = ?3",
        params![if done { Some(now) } else { None }, now, id],
    )?;
    Ok(())
}

pub fn update(
    conn: &Connection,
    id: i64,
    title: Option<&str>,
    due_at: Option<i64>,
    tag: Option<&str>,
    priority: Option<i64>,
) -> Result<()> {
    let now = Local::now().timestamp_millis();
    conn.execute(
        "UPDATE tasks SET
            title       = COALESCE(?1, title),
            due_at      = COALESCE(?2, due_at),
            tag         = COALESCE(?3, tag),
            priority    = COALESCE(?4, priority),
            updated_at  = ?5,
            notified_at = CASE WHEN ?2 IS NOT NULL THEN NULL ELSE notified_at END
         WHERE id = ?6",
        params![title, due_at, tag, priority, now, id],
    )?;
    Ok(())
}

pub fn reorder(conn: &mut Connection, ids: &[i64]) -> Result<()> {
    let now = Local::now().timestamp_millis();
    let tx = conn.transaction()?;
    {
        let mut stmt =
            tx.prepare("UPDATE tasks SET sort_order = ?1, updated_at = ?2 WHERE id = ?3")?;
        for (idx, id) in ids.iter().enumerate() {
            stmt.execute(params![((idx + 1) as f64) * 1000.0, now, id])?;
        }
    }
    tx.commit()
}

pub fn delete(conn: &Connection, id: i64) -> Result<()> {
    let now = Local::now().timestamp_millis();
    conn.execute(
        "UPDATE tasks SET deleted_at = ?1, updated_at = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    Ok(())
}

pub fn clear_completed(conn: &Connection) -> Result<()> {
    let now = Local::now().timestamp_millis();
    conn.execute(
        "UPDATE tasks SET deleted_at = ?1, updated_at = ?1
         WHERE completed_at IS NOT NULL AND deleted_at IS NULL",
        params![now],
    )?;
    Ok(())
}

/// 到点该提醒的任务（未完成、未提醒过、时间已到）
pub fn due_for_notification(conn: &Connection, now: i64) -> Result<Vec<(i64, String)>> {
    let mut stmt = conn.prepare(
        "SELECT id, title FROM tasks
         WHERE deleted_at IS NULL
           AND completed_at IS NULL
           AND notified_at IS NULL
           AND due_at IS NOT NULL
           AND due_at <= ?1
         ORDER BY due_at ASC
         LIMIT 20",
    )?;
    let rows = stmt.query_map(params![now], |r| Ok((r.get(0)?, r.get(1)?)))?;
    rows.collect()
}

pub fn mark_notified(conn: &Connection, ids: &[i64], now: i64) -> Result<()> {
    let mut stmt = conn.prepare("UPDATE tasks SET notified_at = ?1 WHERE id = ?2")?;
    for id in ids {
        stmt.execute(params![now, id])?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                notes TEXT,
                due_at INTEGER,
                priority INTEGER NOT NULL DEFAULT 0,
                tag TEXT NOT NULL DEFAULT '生活',
                completed_at INTEGER,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                deleted_at INTEGER,
                sort_order REAL NOT NULL DEFAULT 0,
                notified_at INTEGER
            );
            "#,
        )
        .unwrap();
        conn
    }

    #[test]
    fn crud_roundtrip() {
        let conn = mem();
        let id = create(&conn, "写周报", Some(1_700_000_000_000), "工作", 2).unwrap();

        let items = list(&conn).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "写周报");
        assert_eq!(items[0].tag, "工作");
        assert!(items[0].completed_at.is_none());

        toggle(&conn, id, true).unwrap();
        assert!(get(&conn, id).unwrap().completed_at.is_some());

        toggle(&conn, id, false).unwrap();
        assert!(get(&conn, id).unwrap().completed_at.is_none());

        update(&conn, id, Some("写周报（终稿）"), None, Some("学习"), Some(3)).unwrap();
        let t = get(&conn, id).unwrap();
        assert_eq!(t.title, "写周报（终稿）");
        assert_eq!(t.tag, "学习");
        assert_eq!(t.priority, 3);

        delete(&conn, id).unwrap();
        assert_eq!(list(&conn).unwrap().len(), 0);
    }

    #[test]
    fn clear_completed_only_removes_done() {
        let conn = mem();
        let a = create(&conn, "已完成", None, "生活", 0).unwrap();
        let b = create(&conn, "未完成", None, "生活", 0).unwrap();
        toggle(&conn, a, true).unwrap();
        clear_completed(&conn).unwrap();

        let items = list(&conn).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, b);
    }

    #[test]
    fn reorder_changes_listing_order() {
        let mut conn = mem();
        let a = create(&conn, "A", None, "生活", 0).unwrap();
        let b = create(&conn, "B", None, "生活", 0).unwrap();
        let c = create(&conn, "C", None, "生活", 0).unwrap();

        reorder(&mut conn, &[c, a, b]).unwrap();
        let titles: Vec<String> = list(&conn).unwrap().into_iter().map(|t| t.title).collect();
        assert_eq!(titles, vec!["C", "A", "B"]);
    }

    #[test]
    fn notifies_due_tasks_once() {
        let conn = mem();
        let now = Local::now().timestamp_millis();
        let id = create(&conn, "该喝水了", Some(now - 60_000), "健康", 0).unwrap();

        assert_eq!(due_for_notification(&conn, now).unwrap().len(), 1);
        mark_notified(&conn, &[id], now).unwrap();
        assert!(due_for_notification(&conn, now).unwrap().is_empty());
    }
}
