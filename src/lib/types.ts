export type Task = {
  id: number;
  title: string;
  notes: string | null;
  dueAt: number | null;
  priority: number;
  tag: string;
  completedAt: number | null;
  createdAt: number;
  sortOrder: number;
};

export type NewTask = {
  title: string;
  dueAt?: number | null;
  tag?: string;
  priority?: number;
};

export type ViewKey = "today" | "upcoming" | "all" | "done";

export const TAGS = ["工作", "学习", "健康", "生活"] as const;
export type TagName = (typeof TAGS)[number];

export const TAG_CLASS: Record<string, string> = {
  工作: "work",
  学习: "study",
  健康: "health",
  生活: "life",
};
