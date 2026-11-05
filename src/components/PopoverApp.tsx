import { useEffect, useMemo, useRef, useState } from "react";
import catUrl from "../../design/assets/cat-mascot-cut.png";
import { isTauri } from "../lib/api";
import { dueText, startOfDay } from "../lib/dates";
import { parseTask } from "../lib/nlp";
import type { Task } from "../lib/types";
import { useTasks } from "../lib/useTasks";
import { CheckIcon, PencilIcon, PlusIcon } from "./Icons";

async function current() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

export function PopoverApp() {
  const { tasks, create, toggle, update } = useTasks();
  const [value, setValue] = useState("");
  const [completing, setCompleting] = useState<number[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [flash, setFlash] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [justAddedId, setJustAddedId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  const addedTimer = useRef<number | undefined>(undefined);

  const showFlash = (text: string, tone: "ok" | "error" = "ok") => {
    setFlash({ text, tone });
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 2600);
  };

  const highlightAdded = (id: number) => {
    setJustAddedId(id);
    window.clearTimeout(addedTimer.current);
    addedTimer.current = window.setTimeout(() => setJustAddedId(null), 1800);
  };

  /** 先播放 420ms 的完成动效，再真正落库，避免点了就消失 */
  const complete = (id: number) => {
    if (completing.includes(id)) return;
    setCompleting((prev) => [...prev, id]);
    window.setTimeout(() => {
      void toggle(id, true).finally(() => {
        setCompleting((prev) => prev.filter((x) => x !== id));
      });
    }, 420);
  };

  const startEdit = (task: Task) => {
    setDraft(task.title);
    setEditingId(task.id);
    window.setTimeout(() => {
      editRef.current?.focus();
      editRef.current?.select();
    }, 20);
  };

  const commitEdit = () => {
    if (editingId == null) return;
    const clean = draft.trim();
    if (clean) void update(editingId, { title: clean });
    setEditingId(null);
  };

  const { todayTasks, upcomingTasks } = useMemo(() => {
    const tomorrow = startOfDay(Date.now()) + 86_400_000;
    const pending = tasks.filter((t) => !t.completedAt);
    return {
      todayTasks: pending
        .filter((t) => t.dueAt == null || t.dueAt < tomorrow)
        .sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity)),
      upcomingTasks: pending
        .filter((t) => t.dueAt != null && t.dueAt >= tomorrow)
        .sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity)),
    };
  }, [tasks]);

  const total = todayTasks.length + upcomingTasks.length;

  // 新任务不一定在当前滚动位置，滚过去让用户一眼看到
  useEffect(() => {
    if (justAddedId == null) return;
    const el = document.querySelector<HTMLElement>(`.pop-task[data-task-id="${justAddedId}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [justAddedId, total]);

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    focus();
    window.addEventListener("focus", focus);
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "w") {
        e.preventDefault();
        if (isTauri) void current().then((w) => w.hide());
        return;
      }
      if (e.key === "Escape" && isTauri) void current().then((w) => w.hide());
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("focus", focus);
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(flashTimer.current);
      window.clearTimeout(addedTimer.current);
    };
  }, []);

  const submit = async () => {
    const v = value.trim();
    if (!v) return;
    const p = parseTask(v);
    const tag = /报告|会议|周报|方案|邮件/.test(v) ? "工作" : "生活";
    try {
      const task = await create({ title: p.title, dueAt: p.dueAt, tag });
      setValue("");
      highlightAdded(task.id);
      const tomorrow = startOfDay(Date.now()) + 86_400_000;
      if (task.dueAt == null || task.dueAt < tomorrow) {
        showFlash(task.dueAt ? `已添加 · ${dueText(task.dueAt).text}` : "已添加");
      } else {
        showFlash(`已加入即将到来 · ${dueText(task.dueAt).text}`);
      }
    } catch (err) {
      // 失败时保留输入，方便重试
      showFlash(`添加失败：${String(err)}`, "error");
    }
  };

  const close = () => { if (isTauri) void current().then((w) => w.hide()); };

  const renderTask = (t: Task) => {
    const due = t.dueAt ? dueText(t.dueAt) : null;
    const checking = completing.includes(t.id);
    const editing = editingId === t.id;

    return (
      <div
        key={t.id}
        data-task-id={t.id}
        className={`pop-task${checking ? " completing" : ""}${editing ? " editing" : ""}${justAddedId === t.id ? " just-added" : ""}`}
        onDoubleClick={(e) => {
          if (editing) return;
          if ((e.target as HTMLElement).closest("button")) return;
          startEdit(t);
        }}
      >
        {editing ? (
          <>
            <input
              ref={editRef}
              className="pop-edit-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") setEditingId(null);
              }}
            />
            <em className="ok">↵ 保存</em>
          </>
        ) : (
          <>
            <button className="check" onClick={() => complete(t.id)}>
              <CheckIcon />
            </button>
            <span title={t.title}>{t.title}</span>
            {checking ? (
              <em className="ok">已完成</em>
            ) : (
              due && <em className={due.tone === "soon" ? "soon" : ""}>{due.text}</em>
            )}
            <button className="pop-edit-btn" title="编辑" onClick={() => startEdit(t)}>
              <PencilIcon />
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="pop-shell">
      <div className="pop-card">
        <div className="pop-head" data-tauri-drag-region>
          <span className="t">待办</span>
          <span className="d">{total}<i> 项</i></span>
        </div>

        <div className="pop-input">
          <PlusIcon />
          <input
            ref={inputRef}
            value={value}
            placeholder="记点什么，回车就存…"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
              if (e.key === "Escape") close();
            }}
          />
          <span className="keys">↵</span>
        </div>

        {flash && (
          <div className={`pop-flash ${flash.tone}`} role="status">
            {flash.text}
          </div>
        )}

        <div className="pop-list">
          {total === 0 && (
            <div className="pop-empty">
              <img src={catUrl} alt="" />
              {tasks.length === 0 ? "还没有待办，记一件小事吧" : "今天的都做完了，休息一下 ☕️"}
            </div>
          )}

          {todayTasks.length > 0 && (
            <>
              {upcomingTasks.length > 0 && <div className="pop-group">今天</div>}
              {todayTasks.map(renderTask)}
            </>
          )}

          {upcomingTasks.length > 0 && (
            <>
              <div className="pop-group">接下来</div>
              {upcomingTasks.map(renderTask)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
