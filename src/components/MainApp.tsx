import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import catUrl from "../../design/assets/cat-mascot-cut.png";
import { isTauri, onFocusQuickAdd } from "../lib/api";
import { cheer, dateLine, dueText, fullDate } from "../lib/dates";
import { parseTask } from "../lib/nlp";
import { countFor, selectView } from "../lib/select";
import { TAGS, TAG_CLASS, type TagName, type Task, type ViewKey } from "../lib/types";
import { useTasks } from "../lib/useTasks";
import {
  AllIcon,
  BarsIcon,
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  DoneIcon,
  GearIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Sparkles,
  TrashIcon,
  UpcomingIcon,
} from "./Icons";
import { SettingsSheet } from "./SettingsSheet";
import { TaskEditor } from "./TaskEditor";

const VIEW_META: Record<ViewKey, { title: string; desc: string }> = {
  today: { title: "今日待办", desc: "" },
  upcoming: { title: "即将到来", desc: "接下来的事都在这儿，一件件安排 ☁️" },
  all: { title: "全部任务", desc: "所有还没做完的事，慢慢来 🌿" },
  done: { title: "已完成", desc: "做过的每一件都算数 ✨" },
};

const CAT_PHRASES = [
  "喵～ 今天也要加油呀",
  "慢慢来，一件一件就做完了",
  "你已经很棒啦",
  "清空清单就可以摸鱼咯",
  "摸摸头，继续加油 ✧",
];

async function win() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

function TrafficLights() {
  return (
    <div className="traffic">
      <button
        className="r"
        title="关闭"
        onClick={async () => { if (isTauri) (await win()).close(); }}
      />
      <button
        className="y"
        title="最小化"
        onClick={async () => { if (isTauri) (await win()).minimize(); }}
      />
      <button
        className="g"
        title="缩放"
        onClick={async () => { if (isTauri) (await win()).toggleMaximize(); }}
      />
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onRemove,
  onEdit,
  sortable,
  dragging,
  dropTarget,
  completing,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
}: {
  task: Task;
  onToggle: (id: number, done: boolean) => void;
  onRemove: (id: number) => void;
  onEdit: (id: number) => void;
  sortable: boolean;
  dragging: boolean;
  dropTarget: boolean;
  completing: boolean;
  onDragStart: (id: number) => void;
  onDragOver: (id: number) => void;
  onDragEnd: () => void;
  onDrop: (id: number) => void;
}) {
  const done = !!task.completedAt;
  const due = task.dueAt ? dueText(task.dueAt) : null;

  const cls = [
    "task",
    done ? "done" : "",
    sortable ? "sortable" : "",
    dragging ? "dragging" : "",
    dropTarget ? "drop-target" : "",
    completing ? "completing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      draggable={sortable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart(task.id);
      }}
      onDragOver={(e) => {
        if (!sortable) return;
        e.preventDefault();
        onDragOver(task.id);
      }}
      onDragEnd={onDragEnd}
      onDrop={(e) => {
        if (!sortable) return;
        e.preventDefault();
        onDrop(task.id);
      }}
      onDoubleClick={() => onEdit(task.id)}
      title={`${task.title} · 双击编辑 · 拖动排序`}
    >
      <button className="check" aria-label={done ? "取消完成" : "完成"} onClick={() => onToggle(task.id, !done)}>
        <CheckIcon />
      </button>

      <span className="task-title">{task.title}</span>

      {due && !done && (
        <span className={`task-time ${due.tone}`}>
          <ClockIcon />
          {due.text}
        </span>
      )}
      {done && <span className="task-time">{new Date(task.completedAt!).getHours().toString().padStart(2, "0")}:{new Date(task.completedAt!).getMinutes().toString().padStart(2, "0")} 完成</span>}
      <span className={`tag ${TAG_CLASS[task.tag] ?? "life"}`}>{task.tag}</span>
      <button className="task-act task-edit-btn" title="编辑" onClick={() => onEdit(task.id)}>
        <PencilIcon />
      </button>
      <button className="task-act task-del" title="删除" onClick={() => onRemove(task.id)}>
        <TrashIcon />
      </button>
    </div>
  );
}

function Adder({
  onAdd,
  onClose,
}: {
  onAdd: (title: string, dueAt: number | null, tag: TagName) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [tag, setTag] = useState<TagName>("工作");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const parsed = useMemo(() => (value.trim() ? parseTask(value) : null), [value]);
  const showParsed = !!parsed?.dueAt && parsed.title !== value.trim();

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    const p = parseTask(v);
    onAdd(p.title, p.dueAt, tag);
    setValue("");
  };

  return (
    <div className="adder">
      <div className="adder-row">
        <PlusIcon />
        <input
          ref={inputRef}
          value={value}
          placeholder="写点什么，比如「明天 3 点 提交周报」"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") onClose();
          }}
        />
        {showParsed && parsed?.dueAt && (
          <span className="parsed">{dueText(parsed.dueAt).text}</span>
        )}
        <span className="hint">↵ 添加</span>
      </div>
      <div className="adder-foot">
        {TAGS.map((t) => (
          <button
            key={t}
            className={`tag ${TAG_CLASS[t]} tag-pick${tag === t ? " on" : ""}`}
            onClick={() => { setTag(t); inputRef.current?.focus(); }}
          >
            {t}
          </button>
        ))}
        <span className="keys">Esc 取消</span>
      </div>
    </div>
  );
}

export function MainApp() {
  const { tasks, error, create, toggle, remove, reload, update, reorder } = useTasks();
  const [view, setView] = useState<ViewKey>("today");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [settings, setSettings] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const [completing, setCompleting] = useState<number[]>([]);
  const [catSay, setCatSay] = useState<string | null>(null);
  const [catCheer, setCatCheer] = useState(false);
  const sayTimer = useRef<number | undefined>(undefined);
  const cheerTimer = useRef<number | undefined>(undefined);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      window.clearTimeout(sayTimer.current);
      window.clearTimeout(cheerTimer.current);
    },
    [],
  );

  const pokeCat = () => {
    setCatSay(CAT_PHRASES[Math.floor(Math.random() * CAT_PHRASES.length)]);
    window.clearTimeout(sayTimer.current);
    sayTimer.current = window.setTimeout(() => setCatSay(null), 1900);
  };

  const cheerCat = () => {
    setCatCheer(true);
    window.clearTimeout(cheerTimer.current);
    cheerTimer.current = window.setTimeout(() => setCatCheer(false), 1100);
  };

  const data = useMemo(() => selectView(tasks, view, query), [tasks, view, query]);
  const counts = useMemo(
    () => ({
      today: countFor(tasks, "today"),
      upcoming: countFor(tasks, "upcoming"),
      all: countFor(tasks, "all"),
      done: countFor(tasks, "done"),
    }),
    [tasks],
  );

  const openAdd = useCallback(() => {
    setAdding(true);
    setView((v) => (v === "done" ? "today" : v));
  }, []);

  useEffect(() => {
    let un: (() => void) | undefined;
    void onFocusQuickAdd(openAdd).then((fn) => { un = fn; });
    return () => un?.();
  }, [openAdd]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "n") { e.preventDefault(); openAdd(); }
      if (meta && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); }
      if (meta && e.key.toLowerCase() === "w") {
        e.preventDefault();
        if (isTauri) void win().then((w) => w.close());
      }
      if (meta && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        setView((["today", "upcoming", "all", "done"] as ViewKey[])[Number(e.key) - 1]);
      }
      if (e.key === "Escape") {
        if (settings) setSettings(false);
        if (editingId != null) setEditingId(null);
        if (adding) setAdding(false);
        if (query) setQuery("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [adding, openAdd, query, settings, editingId]);

  const title = VIEW_META[view].title;
  const subtitle = view === "today" ? cheer(data.rate) : VIEW_META[view].desc;

  const overdueIds = new Set(data.overdue.map((t) => t.id));
  const rest = data.list.filter((t) => !overdueIds.has(t.id));
  const editingTask = tasks.find((t) => t.id === editingId) ?? null;

  const sortable = view === "today" || view === "all";

  /** 勾选完成时先播动效再落库，避免整行瞬间消失 */
  const handleToggle = (id: number, done: boolean) => {
    if (!done) {
      void toggle(id, false);
      return;
    }
    if (completing.includes(id)) return;
    setCompleting((prev) => [...prev, id]);
    cheerCat();
    window.setTimeout(() => {
      void toggle(id, true).finally(() => {
        setCompleting((prev) => prev.filter((x) => x !== id));
      });
    }, 400);
  };

  const handleDrop = (targetId: number) => {
    const from = dragId;
    setDragId(null);
    setOverId(null);
    if (from == null || from === targetId) return;

    const ids = data.list.map((t) => t.id);
    const start = ids.indexOf(from);
    const end = ids.indexOf(targetId);
    if (start < 0 || end < 0) return;

    const next = [...ids];
    next.splice(start, 1);
    next.splice(end, 0, from);
    void reorder(next);
  };

  const row = (t: Task) => (
    <TaskRow
      key={t.id}
      task={t}
      sortable={sortable}
      dragging={dragId === t.id}
      dropTarget={overId === t.id && dragId !== t.id}
      completing={completing.includes(t.id)}
      onToggle={handleToggle}
      onRemove={remove}
      onEdit={setEditingId}
      onDragStart={setDragId}
      onDragOver={setOverId}
      onDragEnd={() => { setDragId(null); setOverId(null); }}
      onDrop={handleDrop}
    />
  );

  return (
    <div className="shell">
      <div className="card">
        <div className="titlebar" data-tauri-drag-region>
          <TrafficLights />
          <div className="brand" data-tauri-drag-region>
            <div className="brand-icon">
              <CheckIcon />
            </div>
            <span className="brand-name">Todo List</span>
          </div>
          <div className="title-right">
            <label className="search">
              <SearchIcon />
              <input
                ref={searchRef}
                value={query}
                placeholder="搜索任务"
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <div className="pill-btn static" title="今天是这个日子">
              {fullDate()}
            </div>
          </div>
        </div>

        <div className="body">
          <nav className="rail">
            <button className={`rail-btn${view === "today" ? " active" : ""}`} title="今天 ⌘1" onClick={() => setView("today")}>
              <CalendarIcon />
              {counts.today > 0 && <span className="badge">{counts.today}</span>}
            </button>
            <button className={`rail-btn${view === "upcoming" ? " active" : ""}`} title="即将到来 ⌘2" onClick={() => setView("upcoming")}>
              <UpcomingIcon />
            </button>
            <button className={`rail-btn${view === "all" ? " active" : ""}`} title="全部 ⌘3" onClick={() => setView("all")}>
              <AllIcon />
            </button>
            <button className={`rail-btn${view === "done" ? " active" : ""}`} title="已完成 ⌘4" onClick={() => setView("done")}>
              <DoneIcon />
            </button>
            <div className="rail-spacer" />
            <div className="rail-sep" />
            <button className="rail-btn" title="设置" onClick={() => setSettings(true)}>
              <GearIcon />
            </button>
          </nav>

          <div className="main">
            <div className="hero" data-tauri-drag-region>
              <h1 data-tauri-drag-region>{title}</h1>
              <p data-tauri-drag-region>{subtitle}</p>
              <div className="meta" data-tauri-drag-region>{dateLine()}</div>
              <div
                className={`mascot-wrap${catCheer ? " cheer" : ""}`}
                onClick={pokeCat}
                role="button"
                aria-label="摸摸小猫"
                title="摸摸我"
              >
                <span className="mascot-halo" />
                <span className="cat-hearts"><i /><i /><i /></span>
                <img className="mascot" src={catUrl} alt="猫咪" draggable={false} />
                {catSay && <span className="cat-bubble">{catSay}</span>}
              </div>
              <Sparkles />
            </div>

            <div className="list-wrap">
              {error && <div className="error-banner">数据读取失败：{error}</div>}
              {data.list.length === 0 && !adding && (
                <div className="empty">
                  <div className="empty-mark"><PlusIcon /></div>
                  {query ? (
                    <>
                      <b>没有找到相关任务</b>
                      <span>换个关键词试试</span>
                    </>
                  ) : view === "today" && data.done > 0 ? (
                    <>
                      <b>今天的都做完了 🎉</b>
                      <span>休息一下，或者再记一件</span>
                    </>
                  ) : view === "done" ? (
                    <>
                      <b>还没有完成的任务</b>
                      <span>勾掉第一件，这里就会亮起来</span>
                    </>
                  ) : (
                    <>
                      <b>这里空空的</b>
                      <span>点右下角的 + 记一件小事</span>
                    </>
                  )}
                </div>
              )}

              {data.overdue.length > 0 && (
                <>
                  <div className="group-head overdue">
                    已逾期
                    <span className="line" />
                    <span>{data.overdue.length} 项</span>
                  </div>
                  {data.overdue.map((t) => row(t))}
                </>
              )}

              {data.overdue.length > 0 && rest.length > 0 && (
                <div className="group-head">
                  今天
                  <span className="line" />
                  <span>{rest.length} 项</span>
                </div>
              )}

              {rest.map((t) => row(t))}

              {adding && (
                <Adder
                  onAdd={(titleText, dueAt, tag) => {
                    void create({ title: titleText, dueAt, tag });
                    setAdding(false);
                  }}
                  onClose={() => setAdding(false)}
                />
              )}
            </div>

            <div className="footer">
              <span className="icon-bars"><BarsIcon /></span>
              <span className="count">
                <b>{data.done}</b> / {data.total} 完成
              </span>
              <div className="bar">
                <i style={{ width: `${Math.min(100, Math.round((data.rate || 0) * 100))}%` }} />
              </div>
              <button className="fab" title="新建任务 ⌘N" onClick={openAdd}>
                <PlusIcon />
              </button>
            </div>
          </div>
        </div>

        {editingTask && (
          <TaskEditor
            task={editingTask}
            onSave={(patch) => {
              void update(editingTask.id, patch);
              setEditingId(null);
            }}
            onDelete={() => {
              void remove(editingTask.id);
              setEditingId(null);
            }}
            onClose={() => setEditingId(null)}
          />
        )}

        {settings && (
          <SettingsSheet
            doneCount={counts.done}
            onClear={async () => {
              const { api } = await import("../lib/api");
              await api.clearCompleted();
              await reload();
            }}
            onClose={() => setSettings(false)}
          />
        )}
      </div>
    </div>
  );
}
