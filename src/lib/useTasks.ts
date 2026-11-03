import { useCallback, useEffect, useState } from "react";
import { api, onTasksChanged } from "./api";
import type { NewTask, Task } from "./types";

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await api.listTasks();
      setTasks(list);
      setError(null);
    } catch (err) {
      console.error("[mini-todo] 读取任务失败:", err);
      setError(String(err));
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void reload();
    let unlisten: (() => void) | undefined;
    void onTasksChanged(reload).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [reload]);

  const create = useCallback(
    async (input: NewTask) => {
      const task = await api.createTask(input);
      setTasks((prev) => [...prev, task]);
      return task;
    },
    [],
  );

  const toggle = useCallback(async (id: number, done: boolean) => {
    const stamp = done ? Date.now() : null;
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completedAt: stamp } : t)),
    );
    await api.toggleTask(id, done);
  }, []);

  const remove = useCallback(async (id: number) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await api.deleteTask(id);
  }, []);

  const updateTitle = useCallback(async (id: number, title: string) => {
    const clean = title.trim();
    if (!clean) return;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, title: clean } : t)));
    await api.updateTask(id, { title: clean });
  }, []);

  const update = useCallback(
    async (id: number, patch: { title?: string; tag?: string }) => {
      setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      await api.updateTask(id, patch);
    },
    [],
  );

  const reorder = useCallback(async (ids: number[]) => {
    setTasks((prev) => {
      const map = new Map(prev.map((t) => [t.id, t]));
      const ordered = ids.map((id) => map.get(id)).filter(Boolean) as Task[];
      const rest = prev.filter((t) => !ids.includes(t.id));
      return [...ordered, ...rest];
    });
    await api.reorderTasks(ids);
  }, []);

  return { tasks, ready, error, reload, create, toggle, remove, updateTitle, update, reorder };
}
