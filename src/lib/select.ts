import { isSameDay, startOfDay } from "./dates";
import type { Task, ViewKey } from "./types";

export type ViewData = {
  list: Task[];
  overdue: Task[];
  total: number;
  done: number;
  rate: number;
  active: number;
};

const byDue = (a: Task, b: Task) => {
  if (a.dueAt == null && b.dueAt == null) return a.sortOrder - b.sortOrder;
  if (a.dueAt == null) return 1;
  if (b.dueAt == null) return -1;
  return a.dueAt - b.dueAt;
};

/** 手动排序优先（拖拽后的顺序），其次才是创建顺序 */
const bySort = (a: Task, b: Task) => a.sortOrder - b.sortOrder;

export function selectView(all: Task[], view: ViewKey, query: string): ViewData {
  const tomorrow = startOfDay(Date.now()) + 86_400_000;
  const today = startOfDay(Date.now());
  const q = query.trim().toLowerCase();

  const match = (t: Task) => !q || t.title.toLowerCase().includes(q);

  let scope: Task[] = [];
  let list: Task[] = [];

  if (view === "today") {
    scope = all.filter(
      (t) =>
        (t.dueAt == null || t.dueAt < tomorrow) &&
        (!t.completedAt || isSameDay(t.completedAt, Date.now())),
    );
    list = scope.filter(match).sort(bySort);
  } else if (view === "upcoming") {
    scope = all.filter((t) => !t.completedAt && t.dueAt != null && t.dueAt >= tomorrow);
    list = scope.filter(match).sort(byDue);
  } else if (view === "all") {
    scope = all.filter((t) => !t.completedAt || isSameDay(t.completedAt, Date.now()));
    list = scope.filter((t) => !t.completedAt && match(t)).sort(bySort);
  } else {
    scope = all.filter((t) => !!t.completedAt);
    list = scope.filter(match).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  }

  const active = list.filter((t) => !t.completedAt);
  const finished = list
    .filter((t) => !!t.completedAt)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  const overdue =
    view === "today"
      ? active.filter((t) => t.dueAt != null && t.dueAt < today)
      : [];
  const rest =
    view === "today"
      ? active.filter((t) => t.dueAt == null || t.dueAt >= today)
      : active;

  // 待办列表里只放没做完的；已完成只出现在「已完成」视图
  const ordered = view === "done" ? finished : [...overdue, ...rest];

  const done = scope.filter((t) => !!t.completedAt).length;
  const total = scope.length;

  return {
    list: ordered,
    overdue,
    total: view === "done" ? Math.max(total, 1) : total,
    done,
    rate: total === 0 ? 0 : done / total,
    active: all.filter((t) => !t.completedAt).length,
  };
}

export function countFor(all: Task[], view: ViewKey) {
  const tomorrow = startOfDay(Date.now()) + 86_400_000;
  if (view === "today") {
    return all.filter((t) => !t.completedAt && (t.dueAt == null || t.dueAt < tomorrow)).length;
  }
  if (view === "upcoming") {
    return all.filter((t) => !t.completedAt && t.dueAt != null && t.dueAt >= tomorrow).length;
  }
  if (view === "all") return all.filter((t) => !t.completedAt).length;
  return all.filter((t) => !!t.completedAt).length;
}
