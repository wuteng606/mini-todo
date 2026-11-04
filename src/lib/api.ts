import type { NewTask, Task } from "./types";

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/* ------------------------------------------------------------------ */
/* 浏览器调试用的内存实现（npm run dev 直接看界面，无需 Rust 侧）        */
/* ------------------------------------------------------------------ */
const MOCK_KEY = "mini-todo-mock-v1";

function startOfToday(offsetDays = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  return d.getTime();
}

function seed(): Task[] {
  const now = Date.now();
  const mk = (
    id: number,
    title: string,
    tag: string,
    dueAt: number | null,
    completedAt: number | null = null,
  ): Task => ({
    id,
    title,
    notes: null,
    dueAt,
    priority: 0,
    tag,
    completedAt,
    createdAt: now - id * 1000,
    sortOrder: id * 1000,
  });

  return [
    mk(1, "完成季度报告", "工作", startOfToday() + 18 * 3600e3),
    mk(2, "学习新技能：AIGC", "学习", null, now - 3600e3),
    mk(3, "去健身房运动", "健康", startOfToday() + 20 * 3600e3),
    mk(4, "买生日礼物", "生活", null),
  ];
}

function readMock(): Task[] {
  try {
    const raw = localStorage.getItem(MOCK_KEY);
    if (raw) return JSON.parse(raw) as Task[];
  } catch {
    /* ignore */
  }
  const data = seed();
  writeMock(data);
  return data;
}

function writeMock(tasks: Task[]) {
  localStorage.setItem(MOCK_KEY, JSON.stringify(tasks));
}

async function mockCall<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  await new Promise((r) => setTimeout(r, 40));
  const tasks = readMock();

  switch (cmd) {
    case "list_tasks":
      return [...tasks] as T;

    case "create_task": {
      const title = String(args.title ?? "").trim();
      const maxOrder = Math.max(0, ...tasks.map((t) => t.sortOrder ?? 0));
      const task: Task = {
        id: Math.max(0, ...tasks.map((t) => t.id)) + 1,
        title,
        notes: null,
        dueAt: (args.dueAt as number | null) ?? null,
        priority: (args.priority as number) ?? 0,
        tag: (args.tag as string) ?? "生活",
        completedAt: null,
        createdAt: Date.now(),
        sortOrder: maxOrder + 1000,
      };
      writeMock([...tasks, task]);
      return task as T;
    }

    case "toggle_task": {
      const id = args.id as number;
      const done = args.done as boolean;
      writeMock(
        tasks.map((t) =>
          t.id === id ? { ...t, completedAt: done ? Date.now() : null } : t,
        ),
      );
      return undefined as T;
    }

    case "update_task": {
      const id = args.id as number;
      writeMock(
        tasks.map((t) =>
          t.id === id
            ? {
                ...t,
                title: (args.title as string) ?? t.title,
                // 与 Rust 侧 COALESCE 行为一致：null / undefined 表示「不改」
                dueAt: (args.dueAt as number | null) ?? t.dueAt,
                tag: (args.tag as string) ?? t.tag,
                priority: (args.priority as number) ?? t.priority,
              }
            : t,
        ),
      );
      return undefined as T;
    }

    case "delete_task": {
      writeMock(tasks.filter((t) => t.id !== (args.id as number)));
      return undefined as T;
    }

    case "reorder_tasks": {
      const ids = (args.ids as number[]) ?? [];
      const order = new Map(ids.map((id, i) => [id, (i + 1) * 1000]));
      // 只改传入任务的位置，未参与排序的任务保持原样
      writeMock(
        tasks.map((t) =>
          order.has(t.id) ? { ...t, sortOrder: order.get(t.id)! } : t,
        ),
      );
      return undefined as T;
    }

    case "clear_completed":
      writeMock(tasks.filter((t) => !t.completedAt));
      return undefined as T;

    default:
      return undefined as T;
  }
}

/* ------------------------------------------------------------------ */
/* 对外 API                                                            */
/* ------------------------------------------------------------------ */
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) return mockCall<T>(cmd, args);
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export const api = {
  listTasks: () => call<Task[]>("list_tasks"),

  createTask: (input: NewTask) =>
    call<Task>("create_task", {
      title: input.title,
      dueAt: input.dueAt ?? null,
      tag: input.tag ?? "生活",
      priority: input.priority ?? 0,
    }),

  toggleTask: (id: number, done: boolean) => call<void>("toggle_task", { id, done }),

  updateTask: (
    id: number,
    patch: { title?: string; dueAt?: number | null; tag?: string; priority?: number },
  ) =>
    call<void>("update_task", {
      id,
      title: patch.title ?? null,
      dueAt: patch.dueAt === undefined ? null : patch.dueAt,
      tag: patch.tag ?? null,
      priority: patch.priority ?? null,
    }),

  deleteTask: (id: number) => call<void>("delete_task", { id }),

  reorderTasks: (ids: number[]) => call<void>("reorder_tasks", { ids }),

  clearCompleted: () => call<void>("clear_completed"),
};

/** 订阅任务变更（多窗口同步） */
export async function onTasksChanged(cb: () => void): Promise<() => void> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const un = await listen("tasks-changed", () => cb());
  return un;
}

/** 让 popover 窗口请求主窗口聚焦输入框 */
export async function onFocusQuickAdd(cb: () => void): Promise<() => void> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  const un = await listen("focus-quick-add", () => cb());
  return un;
}
